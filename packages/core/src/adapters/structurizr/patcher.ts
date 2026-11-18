import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { BasePatcher } from '../base-patcher.js';
import { dslIdentifierPattern } from '../../schemas/common.schema.js';
import { validateStructurizrDsl } from './dsl-validator.js';
import type { StructuredRelationship, NewComponent } from '../../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from '../architecture-types.js';
import type { DslValidationResult, ModelPatchOptions, PatchResult } from '../model-patcher.js';

/**
 * Escaping of `"` inside Structurizr strings is not documented, so quotes become `'`
 * (keeps the text) rather than `\"`. Backslashes are dropped so one cannot escape the closing quote.
 */
function dslString(text: string): string {
  return text
    .replace(/\\/g, '')
    .replace(/"/g, "'")
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
}

export class StructurizrPatcher extends BasePatcher {
  protected readonly formatName = 'StructurizrPatcher';
  protected readonly formatId = 'structurizr';
  protected readonly defaultIndent = '        ';
  protected readonly kindSensitiveDedup = false;
  // Structurizr strings use double quotes only, so an apostrophe in a `#` comment opens nothing
  protected override readonly scanOptions = { quotes: ['"'], hashComments: true };

  // Pending components are written under their erode id, so only valid DSL identifiers can be declared
  protected override filterNewComponents(
    components: NewComponent[],
    skipped: PatchResult['skipped']
  ): NewComponent[] {
    return components.filter((comp) => {
      if (dslIdentifierPattern.test(comp.id)) return true;
      skipped.push({
        source: comp.id,
        target: comp.id,
        reason: `New component "${comp.id}" is not a valid DSL identifier (letters, digits, underscores and hyphens, starting with a letter), so it was not added`,
      });
      return false;
    });
  }

  // Element ids are erode's, not DSL references; a relationship is only written when both ends resolve
  protected override validateRelationships(
    relationships: StructuredRelationship[],
    componentIndex: ComponentIndex,
    skipped: PatchResult['skipped'],
    pendingComponentIds?: Set<string>,
    context?: ModelPatchOptions
  ): StructuredRelationship[] {
    const known = super.validateRelationships(
      relationships,
      componentIndex,
      skipped,
      pendingComponentIds,
      context
    );
    const references = context?.dslReferences;
    if (!references) return known;

    const hasReference = (id: string): boolean =>
      references.has(id) || !!pendingComponentIds?.has(id);

    return known.filter((rel) => {
      const missing = [rel.source, rel.target].find((id) => !hasReference(id));
      if (missing === undefined) return true;
      skipped.push({
        source: rel.source,
        target: rel.target,
        reason: `No DSL identifier for ${missing}: assign one in the DSL so the relationship can reference it`,
      });
      return false;
    });
  }

  protected generateDslLines(
    unique: StructuredRelationship[],
    _existing: ModelRelationship[],
    context?: ModelPatchOptions
  ): string[] {
    const references = context?.dslReferences;
    return unique.map((rel) => {
      const desc = dslString(rel.description);
      const technology = rel.kind ? ` "${dslString(rel.kind)}"` : '';
      const source = references?.get(rel.source) ?? rel.source;
      const target = references?.get(rel.target) ?? rel.target;
      return `        ${source} -> ${target} "${desc}"${technology}`;
    });
  }

  protected generateComponentDslLines(components: NewComponent[]): string[] {
    return components.map((comp) => {
      const name = dslString(comp.name);
      const desc = dslString(comp.description ?? '');
      const tech = comp.technology ? ` "${dslString(comp.technology)}"` : '';
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
