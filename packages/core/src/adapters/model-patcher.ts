import type { StructuredRelationship } from '../analysis/analysis-types.js';
import type { ModelRelationship, ComponentIndex } from './architecture-types.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { LikeC4Patcher } from './likec4/patcher.js';
import { StructurizrPatcher } from './structurizr/patcher.js';
import { ErodeError, ErrorCode } from '../errors.js';
import { CONFIG } from '../utils/config.js';

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
  }): Promise<PatchResult | null>;
}

/** Quick structural validation shared by both patchers. */
export function quickValidatePatch(
  original: string,
  patched: string,
  insertedLines: string[]
): boolean {
  // Check all original non-empty lines are preserved
  const originalLines = original.split('\n').filter((l) => l.trim().length > 0);
  for (const line of originalLines) {
    if (!patched.includes(line)) {
      if (CONFIG.debug.verbose) {
        console.error('[quickValidatePatch] Failed: original line missing', JSON.stringify(line));
      }
      return false;
    }
  }

  // Check inserted lines are present
  for (const line of insertedLines) {
    if (!patched.includes(line.trim())) {
      if (CONFIG.debug.verbose) {
        console.error('[quickValidatePatch] Failed: inserted line missing', JSON.stringify(line));
      }
      return false;
    }
  }

  // Check brace balance
  const openBraces = (patched.match(/\{/g) ?? []).length;
  const closeBraces = (patched.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    if (CONFIG.debug.verbose) {
      console.error(
        '[quickValidatePatch] Failed: brace imbalance',
        JSON.stringify({ open: openBraces, close: closeBraces })
      );
    }
    return false;
  }

  return true;
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
