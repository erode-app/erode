import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { validatePath } from '../utils/validation.js';
import type { SimpleComponent } from '../adapters/architecture-types.js';

export interface ComponentsOptions {
  modelPath: string;
  modelFormat?: string;
}

export async function runComponents(
  options: ComponentsOptions,
  progress?: ProgressReporter
): Promise<SimpleComponent[]> {
  const p = progress ?? new SilentProgress();
  const adapter = createAdapter(options.modelFormat);

  p.section(`Loading ${adapter.metadata.displayName} Architecture Model`);
  validatePath(options.modelPath, 'directory');
  p.start('Loading architecture model');

  const components = await adapter.loadAndListComponents(options.modelPath);
  p.succeed(`Loaded ${String(components.length)} components`);

  return components;
}
