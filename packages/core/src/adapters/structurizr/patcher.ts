import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { BasePatcher } from '../base-patcher.js';
import { validateStructurizrDsl } from './dsl-validator.js';
import type { StructuredRelationship } from '../../analysis/analysis-types.js';
import type { ModelRelationship } from '../architecture-types.js';
import type { DslValidationResult } from '../model-patcher.js';

export class StructurizrPatcher extends BasePatcher {
  protected readonly formatName = 'StructurizrPatcher';
  protected readonly formatId = 'structurizr';
  protected readonly defaultIndent = '        ';

  protected isModelBlockLine(line: string): boolean {
    return /\bmodel\s*\{/.test(line);
  }

  protected generateDslLines(
    unique: StructuredRelationship[],
    _existing: ModelRelationship[]
  ): string[] {
    return unique.map((rel) => {
      const desc = rel.description.replace(/"/g, '');
      const technology = rel.kind ? ` "${rel.kind.replace(/"/g, '')}"` : '';
      return `        ${rel.source} -> ${rel.target} "${desc}"${technology}`;
    });
  }

  protected findTargetFile(modelPath: string): string | null {
    const resolvedPath = resolve(modelPath);

    // If it's a file, use it directly
    try {
      if (!statSync(resolvedPath).isDirectory()) {
        return resolvedPath;
      }
    } catch (err) {
      this.debugLog('statSync failed for path', { path: resolvedPath, error: String(err) });
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

  protected async validateDsl(
    workspace: string,
    file: string,
    content: string
  ): Promise<DslValidationResult> {
    return validateStructurizrDsl(workspace, file, content);
  }
}
