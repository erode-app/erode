import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';
import { execSync } from 'child_process';
import type { ModelPatcher, PatchResult } from '../model-patcher.js';
import { quickValidatePatch } from '../model-patcher.js';
import { validateLikeC4Dsl } from './dsl-validator.js';
import type { StructuredRelationship } from '../../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from '../architecture-types.js';
import type { AIProvider } from '../../providers/ai-provider.js';
import { CONFIG } from '../../utils/config.js';

function debugLog(msg: string, data?: unknown): void {
  if (CONFIG.debug.verbose) {
    console.error(`[LikeC4Patcher] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
  }
}

export class LikeC4Patcher implements ModelPatcher {
  async patch(options: {
    modelPath: string;
    relationships: StructuredRelationship[];
    existingRelationships: ModelRelationship[];
    componentIndex: ComponentIndex;
    provider: AIProvider;
  }): Promise<PatchResult | null> {
    const { modelPath, relationships, existingRelationships, componentIndex, provider } = options;
    const skipped: PatchResult['skipped'] = [];

    debugLog('Input relationships', relationships);

    // 1. Validate and filter relationships
    const valid = relationships.filter((rel) => {
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

    if (skipped.length > 0) {
      debugLog('Skipped after component validation', skipped);
    }

    // 2. Deduplicate against existing relationships
    const prevSkipped = skipped.length;
    const unique = valid.filter((rel) => {
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

    if (skipped.length > prevSkipped) {
      debugLog('Skipped as duplicates', skipped.slice(prevSkipped));
    }
    debugLog(`After filtering: ${String(unique.length)} unique, ${String(skipped.length)} skipped`);

    if (unique.length === 0) {
      return null;
    }

    // 3. Generate DSL lines (only emit kinds that exist in the model)
    const validKinds = new Set(
      existingRelationships.map((r) => r.kind).filter((k): k is string => Boolean(k))
    );
    const insertedLines = unique.map((rel) => this.generateDslLine(rel, validKinds));
    debugLog('Valid relationship kinds in model', [...validKinds]);
    debugLog('Generated DSL lines', insertedLines);

    // 4. Find target file
    const targetFile = this.findTargetFile(modelPath);
    if (!targetFile) {
      debugLog('No suitable .c4 target file found in', modelPath);
      return null;
    }
    debugLog('Target file', targetFile);

    const originalContent = readFileSync(targetFile, 'utf-8');

    // 5. Try LLM-based patching with DSL validation
    let patchedContent: string | null = null;
    if (provider.patchModel) {
      try {
        debugLog('Attempting LLM-based patching');
        const result = await provider.patchModel(originalContent, insertedLines, 'likec4');
        if (quickValidatePatch(originalContent, result, insertedLines)) {
          const dslResult = await validateLikeC4Dsl(modelPath, targetFile, result);
          if (dslResult.valid || dslResult.skipped) {
            debugLog('LLM patch accepted', { valid: dslResult.valid, skipped: dslResult.skipped });
            patchedContent = result;
          } else {
            debugLog('LLM patch failed DSL validation', dslResult.errors);
          }
        } else {
          debugLog('LLM patch failed quick validation');
        }
      } catch (err) {
        debugLog('LLM patching threw', String(err));
        // Fall through to deterministic fallback
      }
    }

    // 6. Deterministic fallback with DSL validation
    if (!patchedContent) {
      debugLog('Using deterministic fallback');
      const deterministic = this.deterministicInsert(originalContent, insertedLines);
      const dslResult = await validateLikeC4Dsl(modelPath, targetFile, deterministic);
      if (dslResult.valid || dslResult.skipped) {
        debugLog('Deterministic patch accepted', {
          valid: dslResult.valid,
          skipped: dslResult.skipped,
        });
        patchedContent = deterministic;
      } else {
        debugLog('Deterministic patch failed DSL validation', dslResult.errors);
      }
    }

    if (!patchedContent) {
      return null;
    }

    // 7. Compute repo-relative path
    const repoRelativePath = this.getRepoRelativePath(targetFile);

    return {
      filePath: repoRelativePath,
      content: patchedContent,
      insertedLines,
      skipped,
    };
  }

  private generateDslLine(rel: StructuredRelationship, validKinds: Set<string>): string {
    if (rel.kind && validKinds.has(rel.kind)) {
      return `  ${rel.source} -[${rel.kind}]-> ${rel.target} '${rel.description}'`;
    }
    return `  ${rel.source} -> ${rel.target} '${rel.description}'`;
  }

  private findTargetFile(modelPath: string): string | null {
    const resolvedPath = resolve(modelPath);
    const c4Files = readdirSync(resolvedPath)
      .filter((f) => f.endsWith('.c4'))
      .map((f) => join(resolvedPath, f));

    if (c4Files.length === 0) return null;

    // Prefer files with model blocks and existing relationships
    for (const file of c4Files) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('model {') && content.includes('->')) {
        return file;
      }
    }

    // Fall back to any file with a model block
    for (const file of c4Files) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('model {')) {
        return file;
      }
    }

    // Last resort: first .c4 file
    return c4Files[0] ?? null;
  }

  private deterministicInsert(content: string, lines: string[]): string {
    // Find the last closing brace of the model block
    const contentLines = content.split('\n');
    let insertIndex = -1;

    // Find the model block and its closing brace
    let inModel = false;
    let braceDepth = 0;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? '';
      if (line.includes('model {') || line.includes('model{')) {
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
    const indent = match?.[1] ?? '  ';

    // Re-indent lines to match
    const indentedLines = lines.map((line) => {
      const trimmed = line.trimStart();
      return indent + trimmed;
    });

    // Insert lines before the closing brace
    contentLines.splice(insertIndex, 0, '', ...indentedLines);

    return contentLines.join('\n');
  }

  private getRepoRelativePath(filePath: string): string {
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
