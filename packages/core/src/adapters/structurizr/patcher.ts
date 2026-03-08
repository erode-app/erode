import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { BasePatcher } from '../base-patcher.js';
import { validateStructurizrDsl } from './dsl-validator.js';
import type { StructuredRelationship, NewComponent } from '../../analysis/analysis-types.js';
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

  protected generateComponentDslLines(components: NewComponent[]): string[] {
    return components.map((comp) => {
      const name = comp.name.replace(/"/g, '');
      const desc = (comp.description ?? '').replace(/"/g, '');
      const tech = comp.technology ? ` "${comp.technology.replace(/"/g, '')}"` : '';
      return `        ${comp.id} = ${comp.kind} "${name}" "${desc}"${tech}`;
    });
  }

  protected findTargetFile(modelPath: string): string | null {
    const resolvedPath = resolve(modelPath);

    try {
      if (!statSync(resolvedPath).isDirectory()) {
        return resolvedPath;
      }
    } catch (err) {
      this.debugLog('statSync failed for path', { path: resolvedPath, error: String(err) });
      return null;
    }

    const dslFiles = readdirSync(resolvedPath)
      .filter((f) => f.endsWith('.dsl'))
      .map((f) => join(resolvedPath, f));

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
