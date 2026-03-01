import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { execSync } from 'child_process';
import type { ModelPatcher, PatchResult } from '../model-patcher.js';
import { quickValidatePatch } from '../model-patcher.js';
import { validateStructurizrDsl } from './dsl-validator.js';
import type { StructuredRelationship } from '../../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from '../architecture-types.js';
import type { AIProvider } from '../../providers/ai-provider.js';
import { CONFIG } from '../../utils/config.js';

function debugLog(msg: string, data?: unknown): void {
  if (CONFIG.debug.verbose) {
    console.error(`[StructurizrPatcher] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
  }
}

export class StructurizrPatcher implements ModelPatcher {
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

    // 1. Validate
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

    // 2. Deduplicate
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

    // 3. Generate DSL lines
    const insertedLines = unique.map((rel) => this.generateDslLine(rel));
    debugLog('Generated DSL lines', insertedLines);

    // 4. Find target file
    const targetFile = this.findTargetFile(modelPath);
    if (!targetFile) {
      debugLog('No suitable .dsl target file found in', modelPath);
      return null;
    }
    debugLog('Target file', targetFile);

    const originalContent = readFileSync(targetFile, 'utf-8');

    // 5. Try LLM-based patching with DSL validation
    let patchedContent: string | null = null;
    if (provider.patchModel) {
      try {
        debugLog('Attempting LLM-based patching');
        const result = await provider.patchModel(originalContent, insertedLines, 'structurizr');
        if (quickValidatePatch(originalContent, result, insertedLines)) {
          const dslResult = await validateStructurizrDsl(modelPath, targetFile, result);
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
      const dslResult = await validateStructurizrDsl(modelPath, targetFile, deterministic);
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

  private generateDslLine(rel: StructuredRelationship): string {
    const technology = rel.kind ? ` "${rel.kind}"` : '';
    return `        ${rel.source} -> ${rel.target} "${rel.description}"${technology}`;
  }

  private findTargetFile(modelPath: string): string | null {
    const resolvedPath = resolve(modelPath);

    // If it's a file, use it directly
    try {
      if (!statSync(resolvedPath).isDirectory()) {
        return resolvedPath;
      }
    } catch (err) {
      debugLog('statSync failed for path', { path: resolvedPath, error: String(err) });
      return null;
    }

    // Look for .dsl files in the directory
    const dslFiles = readdirSync(resolvedPath)
      .filter((f) => f.endsWith('.dsl'))
      .map((f) => join(resolvedPath, f));

    // Prefer workspace.dsl
    const workspaceDsl = dslFiles.find((f) => f.endsWith('workspace.dsl'));
    if (workspaceDsl) return workspaceDsl;

    return dslFiles[0] ?? null;
  }

  private deterministicInsert(content: string, lines: string[]): string {
    const contentLines = content.split('\n');
    let insertIndex = -1;

    // Find the model block closing brace
    let inModel = false;
    let braceDepth = 0;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? '';
      if (/\bmodel\s*\{/.test(line)) {
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

    if (insertIndex === -1) {
      for (let i = contentLines.length - 1; i >= 0; i--) {
        if ((contentLines[i] ?? '').includes('}')) {
          insertIndex = i;
          break;
        }
      }
    }

    if (insertIndex === -1) {
      return content + '\n' + lines.join('\n') + '\n';
    }

    const lineAbove = contentLines[insertIndex - 1] ?? '';
    const match = /^(\s*)/.exec(lineAbove);
    const indent = match?.[1] ?? '        ';

    const indentedLines = lines.map((line) => {
      const trimmed = line.trimStart();
      return indent + trimmed;
    });

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
