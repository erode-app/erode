import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { BasePatcher, acceptedValidation, type PatchedFile } from '../base-patcher.js';
import { validateLikeC4Dsl } from './dsl-validator.js';
import { formatLikeC4Dsl } from './dsl-formatter.js';
import { componentBlock, escapeLikeC4String, previewModelEdits } from './model-edits.js';
import type { StructuredRelationship, NewComponent } from '../../analysis/analysis-types.js';
import type { ModelRelationship } from '../architecture-types.js';
import type { DslValidationResult } from '../model-patcher.js';
import type { ValidationDiagnostic } from '../architecture-adapter.js';
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
      const desc = escapeLikeC4String(rel.description);
      if (rel.kind && validKinds.has(rel.kind)) {
        return `  ${rel.source} -[${rel.kind}]-> ${rel.target} '${desc}'`;
      }
      return `  ${rel.source} -> ${rel.target} '${desc}'`;
    });
  }

  protected generateComponentDslLines(components: NewComponent[]): string[] {
    return components.map((comp) => componentBlock(comp, comp.id, '  ').join('\n'));
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
    content: string,
    baseline?: readonly ValidationDiagnostic[]
  ): Promise<DslValidationResult> {
    return validateLikeC4Dsl(workspace, file, content, baseline);
  }

  protected override async tryNativePatching(
    modelPath: string,
    components: NewComponent[],
    relationshipLines: string[],
    baseline?: readonly ValidationDiagnostic[]
  ): Promise<PatchedFile | null> {
    if (CONFIG.adapter.likec4.patchStrategy !== 'model-edits') {
      return null;
    }
    const outcome = await previewModelEdits(modelPath, components, relationshipLines);
    if (!outcome.ok) {
      this.debugLog('Model edits unavailable; falling back to text patching', outcome.reason);
      return null;
    }
    const { targetFile, content } = outcome.patch;
    // Preview checks the diff, not the merged file, so validate the result like text patches
    const dsl = await this.validateDsl(modelPath, targetFile, content, baseline);
    if (!dsl.valid && !dsl.skipped) {
      this.debugLog('Model edits result failed DSL validation', dsl.errors);
      return null;
    }
    this.debugLog('Model edits patch accepted', { targetFile });
    return { targetFile, content, ...acceptedValidation(dsl) };
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
