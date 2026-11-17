import { readFileSync, realpathSync } from 'fs';
import { dirname, relative } from 'path';
import { execFileSync } from 'child_process';
import type {
  ModelPatcher,
  ModelPatchOptions,
  PatchResult,
  DslValidationResult,
} from './model-patcher.js';
import type { StructuredRelationship, NewComponent } from '../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from './architecture-types.js';
import type { ValidationDiagnostic } from './architecture-adapter.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { CONFIG } from '../utils/config.js';
import { knownRelationshipKinds, resolveRelationshipKind } from './relationship-kind.js';
import { selectTargetFileByLocation, type TargetFileContext } from './target-file-selection.js';

interface AcceptedPatch {
  content: string;
  validationSkipped: boolean;
  validationWarnings?: string[];
}

export interface PatchedFile extends AcceptedPatch {
  targetFile: string;
}

export function acceptedValidation(dslResult: DslValidationResult): Omit<AcceptedPatch, 'content'> {
  return {
    validationSkipped: !!dslResult.skipped,
    validationWarnings: dslResult.warnings?.length ? dslResult.warnings : undefined,
  };
}

/**
 * Index of the `}` closing the first `{` on the line, or -1 if the block continues.
 * Braces inside quoted strings and after `//` do not count.
 */
function closingBraceOnSameLine(line: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '/' && line[i + 1] === '/') {
      return -1;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}' && depth > 0 && --depth === 0) {
      return i;
    }
  }
  return -1;
}

export abstract class BasePatcher implements ModelPatcher {
  protected abstract readonly formatName: string;
  protected abstract readonly formatId: string;
  protected abstract readonly defaultIndent: string;
  /** Whether differing relationship kinds make a same-endpoint proposal distinct. */
  protected abstract readonly kindSensitiveDedup: boolean;

  protected abstract isModelBlockLine(line: string): boolean;

  protected abstract generateDslLines(
    unique: StructuredRelationship[],
    existing: ModelRelationship[]
  ): string[];

  protected abstract generateComponentDslLines(components: NewComponent[]): string[];

  protected abstract findTargetFile(modelPath: string): string | null;

  protected abstract validateDsl(
    workspace: string,
    file: string,
    content: string,
    baseline?: readonly ValidationDiagnostic[]
  ): Promise<DslValidationResult>;

  /** Returns null to use LLM/deterministic text patching. */
  protected tryNativePatching(
    _modelPath: string,
    _components: NewComponent[],
    _relationshipLines: string[],
    _baseline?: readonly ValidationDiagnostic[]
  ): Promise<PatchedFile | null> {
    return Promise.resolve(null);
  }

  protected postFormat(content: string, _modelPath: string, _targetFile: string): Promise<string> {
    return Promise.resolve(content);
  }

  protected debugLog(msg: string, data?: unknown): void {
    if (CONFIG.debug.verbose) {
      console.error(`[${this.formatName}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
    }
  }

  async patch(options: ModelPatchOptions): Promise<PatchResult | null> {
    const { modelPath, relationships, existingRelationships, componentIndex, provider } = options;
    const skipped: PatchResult['skipped'] = [];

    this.debugLog('Input relationships', relationships);

    // 0. Filter new components — skip any that already exist in the model
    const genuinelyNew = (options.newComponents ?? []).filter(
      (c) => !componentIndex.byId.has(c.id)
    );
    const pendingComponentIds = new Set(genuinelyNew.map((c) => c.id));

    if (genuinelyNew.length > 0) {
      this.debugLog(
        'Genuinely new components',
        genuinelyNew.map((c) => c.id)
      );
    }

    // 1. Validate and filter relationships (pending component IDs are accepted)
    const valid = this.validateRelationships(
      relationships,
      componentIndex,
      skipped,
      pendingComponentIds
    );

    if (skipped.length > 0) {
      this.debugLog('Skipped after component validation', skipped);
    }

    // 2. Deduplicate against existing relationships
    const prevSkipped = skipped.length;
    const unique = this.deduplicateRelationships(valid, existingRelationships, skipped);

    if (skipped.length > prevSkipped) {
      this.debugLog('Skipped as duplicates', skipped.slice(prevSkipped));
    }
    this.debugLog(
      `After filtering: ${String(unique.length)} unique, ${String(skipped.length)} skipped`
    );

    if (unique.length === 0 && genuinelyNew.length === 0) {
      return null;
    }

    // 3. Generate DSL lines — components first, then relationships
    const componentDslLines =
      genuinelyNew.length > 0 ? this.generateComponentDslLines(genuinelyNew) : [];
    const relationshipDslLines =
      unique.length > 0 ? this.generateDslLines(unique, existingRelationships) : [];
    const insertedLines = [...componentDslLines, ...relationshipDslLines];
    this.debugLog('Generated DSL lines', insertedLines);

    // 4. Format-native patching (opt-in); the format picks the target file itself
    const native = await this.tryNativePatching(
      modelPath,
      genuinelyNew,
      relationshipDslLines,
      options.validationBaseline
    ).catch((error: unknown) => {
      this.debugLog(
        'Native patching failed; falling back to text patching',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    });

    // 5. Text patching: LLM with DSL validation, then deterministic fallback
    const patched =
      native ??
      (await this.tryTextPatching(provider, insertedLines, modelPath, options.validationBaseline, {
        relationships: unique,
        newComponents: genuinelyNew,
        elementSourceFiles: options.elementSourceFiles,
      }));
    if (!patched) {
      return null;
    }
    const { targetFile, validationSkipped, validationWarnings } = patched;
    let finalContent = patched.content;

    // 6. Optional post-processing (e.g., formatting)
    const preFormatContent = finalContent;
    let formatted = false;
    try {
      const postFormatted = await this.postFormat(finalContent, modelPath, targetFile);
      formatted = postFormatted !== preFormatContent;
      finalContent = postFormatted;
    } catch (error) {
      this.debugLog(
        'Post-processing failed; proceeding with unformatted patch',
        error instanceof Error ? error.message : String(error)
      );
    }

    // 7. Compute repo-relative path
    const repoRelativePath = this.getRepoRelativePath(targetFile);

    return {
      filePath: repoRelativePath,
      absolutePath: targetFile,
      content: finalContent,
      insertedLines,
      relationshipLines: relationshipDslLines,
      skipped,
      newComponents:
        genuinelyNew.length > 0
          ? genuinelyNew.map((c, i) => ({
              id: c.id,
              kind: c.kind,
              name: c.name,
              insertedLines: componentDslLines[i] ? [componentDslLines[i]] : [],
            }))
          : undefined,
      validationSkipped: validationSkipped || undefined,
      formatted: formatted || undefined,
      validationWarnings,
    };
  }

  protected validateRelationships(
    relationships: StructuredRelationship[],
    componentIndex: ComponentIndex,
    skipped: PatchResult['skipped'],
    pendingComponentIds?: Set<string>
  ): StructuredRelationship[] {
    return relationships.filter((rel) => {
      if (!componentIndex.byId.has(rel.source) && !pendingComponentIds?.has(rel.source)) {
        skipped.push({
          source: rel.source,
          target: rel.target,
          reason: `Unknown source component: ${rel.source}`,
        });
        return false;
      }
      if (!componentIndex.byId.has(rel.target) && !pendingComponentIds?.has(rel.target)) {
        skipped.push({
          source: rel.source,
          target: rel.target,
          reason: `Unknown target component: ${rel.target}`,
        });
        return false;
      }
      return true;
    });
  }

  protected deduplicateRelationships(
    valid: StructuredRelationship[],
    existingRelationships: ModelRelationship[],
    skipped: PatchResult['skipped']
  ): StructuredRelationship[] {
    // A proposal is a duplicate of a same-endpoint relationship unless both carry a kind and
    // the kinds differ. Structurizr opts out: its `kind` is free-text technology.
    const knownKinds = knownRelationshipKinds(existingRelationships);
    const kindsDiffer = (a?: string, b?: string): boolean =>
      this.kindSensitiveDedup && a !== undefined && b !== undefined && a !== b;
    return valid.filter((proposed) => {
      // A kind the writer would drop counts as no kind
      const rel = this.kindSensitiveDedup
        ? { ...proposed, kind: resolveRelationshipKind(proposed.kind, knownKinds) }
        : proposed;
      const isDuplicate = existingRelationships.some(
        (existing) =>
          (existing.source === rel.source &&
            existing.target === rel.target &&
            !kindsDiffer(rel.kind, existing.kind)) ||
          (existing.bidirectional === true &&
            existing.source === rel.target &&
            existing.target === rel.source &&
            !kindsDiffer(rel.kind, existing.kind))
      );
      if (isDuplicate) {
        skipped.push({
          source: rel.source,
          target: rel.target,
          reason: 'Relationship already exists in model',
        });
      }
      return !isDuplicate;
    });
  }

  private async tryTextPatching(
    provider: AIProvider,
    insertedLines: string[],
    modelPath: string,
    baseline: readonly ValidationDiagnostic[] | undefined,
    touched: TargetFileContext
  ): Promise<PatchedFile | null> {
    // Where the touched elements are declared, else the format heuristic
    const located = selectTargetFileByLocation(modelPath, touched);
    if (located) this.debugLog('Target file located from element declarations', located);
    const targetFile = located ?? this.findTargetFile(modelPath);
    if (!targetFile) {
      this.debugLog(`No suitable .${this.formatId} target file found in`, modelPath);
      return null;
    }
    this.debugLog('Target file', targetFile);

    const originalContent = readFileSync(targetFile, 'utf-8');
    const llmResult = await this.tryLlmPatching(
      provider,
      originalContent,
      insertedLines,
      modelPath,
      targetFile,
      baseline
    ).catch(() => null);
    const result = llmResult?.content
      ? llmResult
      : await this.tryDeterministicFallback(
          originalContent,
          insertedLines,
          modelPath,
          targetFile,
          baseline
        );
    return result?.content ? { targetFile, ...result } : null;
  }

  protected async tryLlmPatching(
    provider: AIProvider,
    originalContent: string,
    insertedLines: string[],
    modelPath: string,
    targetFile: string,
    baseline?: readonly ValidationDiagnostic[]
  ): Promise<AcceptedPatch | null> {
    if (!provider.patchModel) {
      return null;
    }
    try {
      this.debugLog('Attempting LLM-based patching');
      const result = await provider.patchModel(originalContent, insertedLines, this.formatId);
      if (quickValidatePatch(originalContent, result, insertedLines)) {
        const dslResult = await this.validateDsl(modelPath, targetFile, result, baseline);
        if (dslResult.valid || dslResult.skipped) {
          this.debugLog('LLM patch accepted', {
            valid: dslResult.valid,
            skipped: dslResult.skipped,
          });
          return { content: result, ...acceptedValidation(dslResult) };
        } else {
          this.debugLog('LLM patch failed DSL validation', dslResult.errors);
        }
      } else {
        this.debugLog('LLM patch failed quick validation');
      }
    } catch (err) {
      this.debugLog('LLM patching threw', String(err));
    }
    return null;
  }

  protected async tryDeterministicFallback(
    originalContent: string,
    insertedLines: string[],
    modelPath: string,
    targetFile: string,
    baseline?: readonly ValidationDiagnostic[]
  ): Promise<AcceptedPatch | null> {
    this.debugLog('Using deterministic fallback');
    const deterministic = this.deterministicInsert(originalContent, insertedLines);
    const dslResult = await this.validateDsl(modelPath, targetFile, deterministic, baseline);
    if (dslResult.valid || dslResult.skipped) {
      this.debugLog('Deterministic patch accepted', {
        valid: dslResult.valid,
        skipped: dslResult.skipped,
      });
      return { content: deterministic, ...acceptedValidation(dslResult) };
    } else {
      this.debugLog('Deterministic patch failed DSL validation', dslResult.errors);
      return null;
    }
  }

  protected deterministicInsert(content: string, lines: string[]): string {
    const contentLines = content.split('\n');
    let insertIndex = -1;

    let inModel = false;
    let braceDepth = 0;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? '';
      if (this.isModelBlockLine(line)) {
        const closeAt = closingBraceOnSameLine(line);
        if (closeAt !== -1) {
          // One-line block such as `model { a = service 'A' }`: split it so lines can go inside
          contentLines.splice(i, 1, line.slice(0, closeAt).trimEnd(), line.slice(closeAt));
          insertIndex = i + 1;
          break;
        }
        inModel = true;
        braceDepth = 1;
        continue;
      }
      if (inModel) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') {
            braceDepth--;
            if (braceDepth === 0) {
              insertIndex = i;
              inModel = false;
              break;
            }
          }
        }
      }
    }

    // If no model block found, insert before the last } in the file
    if (insertIndex === -1) {
      for (let i = contentLines.length - 1; i >= 0; i--) {
        if ((contentLines[i] ?? '').includes('}')) {
          insertIndex = i;
          break;
        }
      }
    }

    if (insertIndex === -1) {
      // No closing brace found, just append
      return content + '\n' + lines.join('\n') + '\n';
    }

    const lineAbove = contentLines[insertIndex - 1] ?? '';
    const match = /^(\s*)/.exec(lineAbove);
    const indent = match?.[1] ?? this.defaultIndent;

    const indentedLines = lines.map((line) => {
      const trimmed = line.trimStart();
      return indent + trimmed;
    });

    contentLines.splice(insertIndex, 0, '', ...indentedLines);

    return contentLines.join('\n');
  }

  protected getRepoRelativePath(filePath: string): string {
    try {
      const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf-8',
        cwd: dirname(filePath),
      }).trim();
      return relative(realpathSync(repoRoot), realpathSync(filePath));
    } catch {
      return filePath;
    }
  }
}

/** Quick structural validation shared by both patchers. */
export function quickValidatePatch(
  original: string,
  patched: string,
  insertedLines: string[]
): boolean {
  const originalLines = original.split('\n').filter((l) => l.trim().length > 0);
  for (const line of originalLines) {
    if (!patched.includes(line)) {
      if (CONFIG.debug.verbose) {
        console.error('[quickValidatePatch] Failed: original line missing', JSON.stringify(line));
      }
      return false;
    }
  }

  for (const line of insertedLines) {
    if (!patched.includes(line.trim())) {
      if (CONFIG.debug.verbose) {
        console.error('[quickValidatePatch] Failed: inserted line missing', JSON.stringify(line));
      }
      return false;
    }
  }

  const openBraces = (patched.match(/\{/g) ?? []).length;
  const closeBraces = (patched.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    if (CONFIG.debug.verbose) {
      console.error(
        '[quickValidatePatch] Failed: brace imbalance',
        JSON.stringify({ open: openBraces, close: closeBraces })
      );
    }
    return false;
  }

  return true;
}
