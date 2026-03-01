import type { StructuredRelationship } from '../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from '../adapters/architecture-types.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { LikeC4Patcher } from './likec4-patcher.js';
import { StructurizrPatcher } from './structurizr-patcher.js';

export interface PatchResult {
  /** Repo-relative path to the patched file */
  filePath: string;
  /** Complete patched file content */
  content: string;
  /** Lines that were inserted */
  insertedLines: string[];
  /** Relationships skipped (unknown IDs, duplicates) */
  skipped: { source: string; target: string; reason: string }[];
}

export interface ModelPatcher {
  patch(options: {
    modelPath: string;
    relationships: StructuredRelationship[];
    existingRelationships: ModelRelationship[];
    componentIndex: ComponentIndex;
    provider: AIProvider;
  }): Promise<PatchResult | null>;
}

export function createModelPatcher(format: string): ModelPatcher {
  switch (format) {
    case 'likec4':
      return new LikeC4Patcher();
    case 'structurizr':
      return new StructurizrPatcher();
    default:
      throw new Error(`Unsupported model format for patching: ${format}`);
  }
}
