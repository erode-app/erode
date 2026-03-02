import type { StructuredRelationship, NewComponent } from '../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from './architecture-types.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { LikeC4Patcher } from './likec4/patcher.js';
import { StructurizrPatcher } from './structurizr/patcher.js';
import { ErodeError, ErrorCode } from '../errors.js';
export { quickValidatePatch } from './base-patcher.js';

export interface PatchResult {
  /** Repo-relative path to the patched file */
  filePath: string;
  /** Complete patched file content */
  content: string;
  /** Lines that were inserted */
  insertedLines: string[];
  /** Only the relationship DSL lines (subset of insertedLines, excludes component DSL) */
  relationshipLines?: string[];
  /** Relationships skipped (unknown IDs, duplicates) */
  skipped: { source: string; target: string; reason: string }[];
  /** New components that were added to the model */
  newComponents?: { id: string; kind: string; name: string; insertedLines: string[] }[];
  /** true when DSL validation tooling was unavailable and validation was skipped */
  validationSkipped?: boolean;
}

export interface DslValidationResult {
  valid: boolean;
  errors?: string[];
  /** true if validation tooling was unavailable */
  skipped?: boolean;
}

export interface ModelPatcher {
  patch(options: {
    modelPath: string;
    relationships: StructuredRelationship[];
    existingRelationships: ModelRelationship[];
    componentIndex: ComponentIndex;
    provider: AIProvider;
    newComponents?: NewComponent[];
  }): Promise<PatchResult | null>;
}

export function createModelPatcher(format: string): ModelPatcher {
  switch (format) {
    case 'likec4':
      return new LikeC4Patcher();
    case 'structurizr':
      return new StructurizrPatcher();
    default:
      throw new ErodeError(
        `Unsupported model format: ${format}`,
        ErrorCode.INPUT_INVALID,
        `Model format "${format}" is not supported for patching`
      );
  }
}
