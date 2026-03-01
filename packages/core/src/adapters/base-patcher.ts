import { readFileSync } from 'fs';
import { relative } from 'path';
import { execSync } from 'child_process';
import type { ModelPatcher, PatchResult, DslValidationResult } from './model-patcher.js';
import type { StructuredRelationship } from '../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from './architecture-types.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { CONFIG } from '../utils/config.js';

export abstract class BasePatcher implements ModelPatcher {
  protected abstract readonly formatName: string;
  protected abstract readonly formatId: string;
  protected abstract readonly defaultIndent: string;

  protected abstract isModelBlockLine(line: string): boolean;

  protected abstract generateDslLines(
    unique: StructuredRelationship[],
    existing: ModelRelationship[]
  ): string[];

  protected abstract findTargetFile(modelPath: string): string | null;

  protected abstract validateDsl(
    workspace: string,
    file: string,
    content: string
  ): Promise<DslValidationResult>;

  protected debugLog(msg: string, data?: unknown): void {
    if (CONFIG.debug.verbose) {
      console.error(`[${this.formatName}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
    }
  }

  async patch(options: {
    modelPath: string;
    relationships: StructuredRelationship[];
    existingRelationships: ModelRelationship[];
    componentIndex: ComponentIndex;
    provider: AIProvider;
  }): Promise<PatchResult | null> {
    const { modelPath, relationships, existingRelationships, componentIndex, provider } = options;
    const skipped: PatchResult['skipped'] = [];

    this.debugLog('Input relationships', relationships);

    // 1. Validate and filter relationships
    const valid = this.validateRelationships(relationships, componentIndex, skipped);

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

    if (unique.length === 0) {
      return null;
    }

    // 3. Generate DSL lines
    const insertedLines = this.generateDslLines(unique, existingRelationships);
    this.debugLog('Generated DSL lines', insertedLines);

    // 4. Find target file
    const targetFile = this.findTargetFile(modelPath);
    if (!targetFile) {
      this.debugLog(`No suitable .${this.formatId} target file found in`, modelPath);
      return null;
    }
    this.debugLog('Target file', targetFile);

    const originalContent = readFileSync(targetFile, 'utf-8');

    // 5. Try LLM-based patching with DSL validation
    const patchedContent = await this.tryLlmPatching(
      provider,
      originalContent,
      insertedLines,
      modelPath,
      targetFile
    ).catch(() => null);

    // 6. Deterministic fallback with DSL validation
    const finalContent =
      patchedContent ??
      (await this.tryDeterministicFallback(originalContent, insertedLines, modelPath, targetFile));

    if (!finalContent) {
      return null;
    }

    // 7. Compute repo-relative path
    const repoRelativePath = this.getRepoRelativePath(targetFile);

    return {
      filePath: repoRelativePath,
      content: finalContent,
      insertedLines,
      skipped,
    };
  }

  protected validateRelationships(
    relationships: StructuredRelationship[],
    componentIndex: ComponentIndex,
    skipped: PatchResult['skipped']
  ): StructuredRelationship[] {
    return relationships.filter((rel) => {
      if (!componentIndex.byId.has(rel.source)) {
        skipped.push({
          source: rel.source,
          target: rel.target,
          reason: `Unknown source component: ${rel.source}`,
        });
        return false;
      }
      if (!componentIndex.byId.has(rel.target)) {
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
    return valid.filter((rel) => {
      const isDuplicate = existingRelationships.some(
        (existing) => existing.source === rel.source && existing.target === rel.target
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

  protected async tryLlmPatching(
    provider: AIProvider,
    originalContent: string,
    insertedLines: string[],
    modelPath: string,
    targetFile: string
  ): Promise<string | null> {
    if (!provider.patchModel) {
      return null;
    }
    try {
      this.debugLog('Attempting LLM-based patching');
      const result = await provider.patchModel(originalContent, insertedLines, this.formatId);
      if (quickValidatePatch(originalContent, result, insertedLines)) {
        const dslResult = await this.validateDsl(modelPath, targetFile, result);
        if (dslResult.valid || dslResult.skipped) {
          this.debugLog('LLM patch accepted', {
            valid: dslResult.valid,
            skipped: dslResult.skipped,
          });
          return result;
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
    targetFile: string
  ): Promise<string | null> {
    this.debugLog('Using deterministic fallback');
    const deterministic = this.deterministicInsert(originalContent, insertedLines);
    const dslResult = await this.validateDsl(modelPath, targetFile, deterministic);
    if (dslResult.valid || dslResult.skipped) {
      this.debugLog('Deterministic patch accepted', {
        valid: dslResult.valid,
        skipped: dslResult.skipped,
      });
      return deterministic;
    } else {
      this.debugLog('Deterministic patch failed DSL validation', dslResult.errors);
      return null;
    }
  }

  protected deterministicInsert(content: string, lines: string[]): string {
    const contentLines = content.split('\n');
    let insertIndex = -1;

    // Find the model block and its closing brace
    let inModel = false;
    let braceDepth = 0;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? '';
      if (this.isModelBlockLine(line)) {
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

    // Detect indentation from the line above the closing brace
    const lineAbove = contentLines[insertIndex - 1] ?? '';
    const match = /^(\s*)/.exec(lineAbove);
    const indent = match?.[1] ?? this.defaultIndent;

    // Re-indent lines to match
    const indentedLines = lines.map((line) => {
      const trimmed = line.trimStart();
      return indent + trimmed;
    });

    // Insert lines before the closing brace
    contentLines.splice(insertIndex, 0, '', ...indentedLines);

    return contentLines.join('\n');
  }

  protected getRepoRelativePath(filePath: string): string {
    try {
      const repoRoot = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf-8',
      }).trim();
      return relative(repoRoot, filePath);
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
  // Check all original non-empty lines are preserved
  const originalLines = original.split('\n').filter((l) => l.trim().length > 0);
  for (const line of originalLines) {
    if (!patched.includes(line)) {
      if (CONFIG.debug.verbose) {
        console.error('[quickValidatePatch] Failed: original line missing', JSON.stringify(line));
      }
      return false;
    }
  }

  // Check inserted lines are present
  for (const line of insertedLines) {
    if (!patched.includes(line.trim())) {
      if (CONFIG.debug.verbose) {
        console.error('[quickValidatePatch] Failed: inserted line missing', JSON.stringify(line));
      }
      return false;
    }
  }

  // Check brace balance
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
