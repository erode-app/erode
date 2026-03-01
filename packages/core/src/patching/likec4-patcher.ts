import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';
import { execSync } from 'child_process';
import type { ModelPatcher, PatchResult } from './model-patcher.js';
import type { StructuredRelationship } from '../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from '../adapters/architecture-types.js';
import type { AIProvider } from '../providers/ai-provider.js';

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

    // 2. Deduplicate against existing relationships
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

    // 5. Try LLM-based patching
    let patchedContent: string | null = null;
    if (provider.patchModel) {
      try {
        const result = await provider.patchModel(originalContent, insertedLines, 'likec4');
        if (this.validatePatchedContent(originalContent, result, insertedLines)) {
          patchedContent = result;
        }
      } catch {
        // Fall through to deterministic fallback
      }
    }

    // 6. Deterministic fallback
    patchedContent ??= this.deterministicInsert(originalContent, insertedLines);

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
    if (rel.kind) {
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

  private validatePatchedContent(
    original: string,
    patched: string,
    insertedLines: string[]
  ): boolean {
    // Check all original non-empty lines are preserved
    const originalLines = original.split('\n').filter((l) => l.trim().length > 0);
    for (const line of originalLines) {
      if (!patched.includes(line)) {
        return false;
      }
    }

    // Check inserted lines are present
    for (const line of insertedLines) {
      if (!patched.includes(line.trim())) {
        return false;
      }
    }

    // Check brace balance
    const openBraces = (patched.match(/\{/g) ?? []).length;
    const closeBraces = (patched.match(/\}/g) ?? []).length;
    if (openBraces !== closeBraces) {
      return false;
    }

    return true;
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
