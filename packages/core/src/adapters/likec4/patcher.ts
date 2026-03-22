import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { BasePatcher } from '../base-patcher.js';
import { validateLikeC4Dsl } from './dsl-validator.js';
import { formatLikeC4Dsl } from './dsl-formatter.js';
import type { StructuredRelationship, NewComponent } from '../../analysis/analysis-types.js';
import type { ModelRelationship } from '../architecture-types.js';
import type { DslValidationResult } from '../model-patcher.js';
import { CONFIG } from '../../utils/config.js';

export class LikeC4Patcher extends BasePatcher {
  protected readonly formatName = 'LikeC4Patcher';
  protected readonly formatId = 'likec4';
  protected readonly defaultIndent = '  ';

  protected isModelBlockLine(line: string): boolean {
    return line.includes('model {') || line.includes('model{');
  }

  protected generateDslLines(
    unique: StructuredRelationship[],
    existing: ModelRelationship[]
  ): string[] {
    const validKinds = new Set(existing.map((r) => r.kind).filter((k): k is string => Boolean(k)));
    this.debugLog('Valid relationship kinds in model', [...validKinds]);
    return unique.map((rel) => {
      const desc = rel.description.replace(/'/g, '');
      if (rel.kind && validKinds.has(rel.kind)) {
        return `  ${rel.source} -[${rel.kind}]-> ${rel.target} '${desc}'`;
      }
      return `  ${rel.source} -> ${rel.target} '${desc}'`;
    });
  }

  protected generateComponentDslLines(components: NewComponent[]): string[] {
    return components.map((comp) => {
      const lines: string[] = [];
      const name = comp.name.replace(/'/g, '');
      lines.push(`  ${comp.id} = ${comp.kind} '${name}' {`);
      if (comp.tags && comp.tags.length > 0) {
        lines.push(`    ${comp.tags.map((t) => `#${t}`).join(' ')}`);
      }
      if (comp.description) {
        lines.push(`    description '${comp.description.replace(/'/g, '')}'`);
      }
      if (comp.technology) {
        lines.push(`    technology '${comp.technology.replace(/'/g, '')}'`);
      }
      lines.push('  }');
      return lines.join('\n');
    });
  }

  protected findTargetFile(modelPath: string): string | null {
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

  protected async validateDsl(
    workspace: string,
    file: string,
    content: string
  ): Promise<DslValidationResult> {
    return validateLikeC4Dsl(workspace, file, content);
  }

  protected override async postFormat(
    content: string,
    modelPath: string,
    targetFile: string
  ): Promise<string> {
    if (!CONFIG.adapter.likec4.formatAfterPatch) {
      this.debugLog('Post-patch formatting disabled by config');
      return content;
    }
    const result = await formatLikeC4Dsl(modelPath, targetFile, content);
    if (result.formatted && result.content) {
      this.debugLog('Post-patch formatting applied');
      return result.content;
    }
    if (result.skipped) {
      this.debugLog('Post-patch formatting skipped (SDK unavailable)');
    } else if (result.error) {
      this.debugLog('Post-patch formatting failed', result.error);
    }
    return content;
  }
}
