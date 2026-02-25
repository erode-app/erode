import { ConfigurationError } from '../errors.js';
import type { ArchitectureModelAdapter } from './architecture-adapter.js';
import { LikeC4Adapter } from './likec4/index.js';

type ModelFormat = 'likec4';

const SUPPORTED_FORMATS: ModelFormat[] = ['likec4'];

function isModelFormat(format: string): format is ModelFormat {
  return SUPPORTED_FORMATS.includes(format as ModelFormat);
}

export function createAdapter(format = 'likec4'): ArchitectureModelAdapter {
  if (!isModelFormat(format)) {
    throw new ConfigurationError(
      `Unknown model format: "${format}". Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
      'MODEL_FORMAT'
    );
  }

  // This will expand as more formats are added
  return new LikeC4Adapter();
}
