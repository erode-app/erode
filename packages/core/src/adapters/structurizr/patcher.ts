import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { execSync } from 'child_process';
import type { ModelPatcher, PatchResult } from '../model-patcher.js';
import { quickValidatePatch } from '../model-patcher.js';
import { validateStructurizrDsl } from './dsl-validator.js';
import type { StructuredRelationship } from '../../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from '../architecture-types.js';
import type { AIProvider } from '../../providers/ai-provider.js';

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

    // 2. Deduplicate
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

    if (unique.length === 0) {
      return null;
    }

    // 3. Generate DSL lines
    const insertedLines = unique.map((rel) => this.generateDslLine(rel));

    // 4. Find target file
    const targetFile = this.findTargetFile(modelPath);
    if (!targetFile) {
      return null;
    }

    const originalContent = readFileSync(targetFile, 'utf-8');

    // 5. Try LLM-based patching with DSL validation
    let patchedContent: string | null = null;
    if (provider.patchModel) {
      try {
        const result = await provider.patchModel(originalContent, insertedLines, 'structurizr');
        if (quickValidatePatch(originalContent, result, insertedLines)) {
          const dslResult = await validateStructurizrDsl(modelPath, targetFile, result);
          if (dslResult.valid || dslResult.skipped) {
            patchedContent = result;
          }
        }
      } catch {
        // Fall through to deterministic fallback
      }
    }

    // 6. Deterministic fallback with DSL validation
    if (!patchedContent) {
      const deterministic = this.deterministicInsert(originalContent, insertedLines);
      const dslResult = await validateStructurizrDsl(modelPath, targetFile, deterministic);
      if (dslResult.valid || dslResult.skipped) {
        patchedContent = deterministic;
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
    } catch {
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
