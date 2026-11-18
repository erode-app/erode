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
import {
  countBraces,
  findModelBlocks,
  maskStringsAndComments,
  type ScanOptions,
} from './dsl-scanner.js';

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

export abstract class BasePatcher implements ModelPatcher {
  protected abstract readonly formatName: string;
  protected abstract readonly formatId: string;
  protected abstract readonly defaultIndent: string;
  /** Whether differing relationship kinds make a same-endpoint proposal distinct. */
  protected abstract readonly kindSensitiveDedup: boolean;
  protected readonly scanOptions: ScanOptions = {};

  protected abstract generateDslLines(
    unique: StructuredRelationship[],
    existing: ModelRelationship[],
    context?: ModelPatchOptions
  ): string[];

  protected abstract generateComponentDslLines(
    components: NewComponent[],
    context?: ModelPatchOptions
  ): string[];

  /** Formats that cannot write every new component drop it here and record why in `skipped`. */
  protected filterNewComponents(
    components: NewComponent[],
    _skipped: PatchResult['skipped'],
    _context?: ModelPatchOptions
  ): NewComponent[] {
    return components;
  }

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
    const skipped: PatchResult['skipped'] = options.skipped ?? [];

    this.debugLog('Input relationships', relationships);

    // 0. Filter new components — skip any that already exist in the model
    const genuinelyNew = this.filterNewComponents(
      (options.newComponents ?? []).filter((c) => !componentIndex.byId.has(c.id)),
      skipped,
      options
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
      pendingComponentIds,
      options
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
      genuinelyNew.length > 0 ? this.generateComponentDslLines(genuinelyNew, options) : [];
    const relationshipDslLines =
      unique.length > 0 ? this.generateDslLines(unique, existingRelationships, options) : [];
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
    pendingComponentIds?: Set<string>,
    _context?: ModelPatchOptions
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
      if (quickValidatePatch(originalContent, result, insertedLines, this.scanOptions)) {
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
    // Insert before the end of the last model block, else before the last `}` in the file
    const block = findModelBlocks(content, this.scanOptions).at(-1);
    const closeAt =
      block?.close ?? maskStringsAndComments(content, this.scanOptions).lastIndexOf('}');
    if (closeAt === -1) {
      return content + '\n' + lines.join('\n') + '\n';
    }

    const contentLines = content.split('\n');
    const lineStart = content.lastIndexOf('\n', closeAt - 1) + 1;
    let insertIndex = content.slice(0, lineStart).split('\n').length - 1;
    const closingLine = contentLines[insertIndex] ?? '';
    const column = closeAt - lineStart;
    if (closingLine.slice(0, column).trim() !== '') {
      // Code before the brace, as in `model { a = service 'A' }`: split so lines can go inside
      contentLines.splice(
        insertIndex,
        1,
        closingLine.slice(0, column).trimEnd(),
        closingLine.slice(column)
      );
      insertIndex++;
    }

    const lineAbove = contentLines[insertIndex - 1] ?? '';
    const aboveIsOpener = block
      ? content.slice(0, block.open).split('\n').length === insertIndex
      : lineAbove.trimEnd().endsWith('{');
    const aboveIndent = /^[ \t]*/.exec(lineAbove)?.[0] ?? '';
    const indent = aboveIsOpener ? aboveIndent + this.defaultIndent : aboveIndent;
    contentLines.splice(insertIndex, 0, '', ...lines.flatMap((entry) => reindent(entry, indent)));

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

/** Re-indents a possibly multi-line entry to `indent`, keeping its inner nesting. */
function reindent(entry: string, indent: string): string[] {
  const lines = entry.split('\n');
  const common = Math.min(
    ...lines.filter((l) => l.trim().length > 0).map((l) => /^\s*/.exec(l)?.[0].length ?? 0)
  );
  return lines.map((l) => (l.trim().length > 0 ? indent + l.slice(common) : ''));
}

/** Whether `entry`'s non-blank lines appear, trimmed and in order, as a contiguous run in `lines`. */
function containsRun(lines: readonly string[], entry: string): boolean {
  const run = entry
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (run.length === 0) return true;
  for (let i = 0; i + run.length <= lines.length; i++) {
    if (run.every((l, k) => lines[i + k] === l)) return true;
  }
  return false;
}

function braceDelta(text: string, scanOptions?: ScanOptions): number {
  const { open, close } = countBraces(text, scanOptions);
  return open - close;
}

function rejectPatch(reason: string, data: unknown): false {
  if (CONFIG.debug.verbose) {
    console.error(`[quickValidatePatch] Failed: ${reason}`, JSON.stringify(data));
  }
  return false;
}

/** Quick structural validation shared by both patchers. */
export function quickValidatePatch(
  original: string,
  patched: string,
  insertedLines: string[],
  scanOptions?: ScanOptions
): boolean {
  const originalLines = original.split('\n').filter((l) => l.trim().length > 0);
  for (const line of originalLines) {
    if (!patched.includes(line)) return rejectPatch('original line missing', line);
  }

  // Each entry must appear as a block; the LLM may re-indent it, so lines are compared trimmed
  const patchedLines = patched
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (const entry of insertedLines) {
    if (!containsRun(patchedLines, entry)) return rejectPatch('inserted entry missing', entry);
  }

  // Compare deltas, not balance, so a file the scanner misreads does not reject every patch
  const expected =
    braceDelta(original, scanOptions) + braceDelta(insertedLines.join('\n'), scanOptions);
  const actual = braceDelta(patched, scanOptions);
  if (actual !== expected) return rejectPatch('brace delta mismatch', { expected, actual });

  return true;
}
