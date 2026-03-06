import { ErodeError, ErrorCode, CONFIG } from '@erode-app/core';

export function resolveModelPath(modelPath?: string): string {
  const resolved = modelPath ?? CONFIG.adapter.modelPath;
  if (!resolved) {
    throw new ErodeError(
      'Provide <model-path> or set adapter.modelPath in .eroderc.json',
      ErrorCode.INPUT_INVALID
    );
  }
  return resolved;
}
