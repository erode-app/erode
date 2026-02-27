import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { validatePath } from '../utils/validation.js';

export interface ConnectionsOptions {
  modelPath: string;
  modelFormat?: string;
  repo: string;
}

export interface ComponentConnections {
  component: {
    id: string;
    name: string;
    type: string;
    repository?: string;
  };
  dependencies: {
    id: string;
    name: string;
    type: string;
    repository?: string;
  }[];
  dependents: {
    id: string;
    name: string;
    type: string;
    repository?: string;
  }[];
  relationships: {
    targetId: string;
    targetName: string;
    kind?: string;
    title?: string;
  }[];
}

export async function runConnections(
  options: ConnectionsOptions,
  progress?: ProgressReporter
): Promise<ComponentConnections[]> {
  const p = progress ?? new SilentProgress();
  const adapter = createAdapter(options.modelFormat);

  p.section(`Loading ${adapter.metadata.displayName} Architecture Model`);
  validatePath(options.modelPath, 'directory');
  p.start('Loading architecture model');
  await adapter.loadFromPath(options.modelPath);
  p.succeed('Architecture model loaded');

  p.start(`Finding components for ${options.repo}`);
  const components = adapter.findAllComponentsByRepository(options.repo);

  if (components.length === 0) {
    p.warn(`No components found for repository: ${options.repo}`);
    p.info('Run "erode validate <model-path>" to check which components have repository links.');
    return [];
  }
  p.succeed(`Found ${String(components.length)} component(s)`);

  const results: ComponentConnections[] = components.map((component) => {
    const dependencies = adapter.getComponentDependencies(component.id);
    const dependents = adapter.getComponentDependents(component.id);
    const relationships = adapter.getComponentRelationships(component.id);
    return {
      component: {
        id: component.id,
        name: component.name,
        type: component.type,
        repository: component.repository,
      },
      dependencies: dependencies.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        repository: d.repository,
      })),
      dependents: dependents.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        repository: d.repository,
      })),
      relationships: relationships.map((r) => ({
        targetId: r.target.id,
        targetName: r.target.name,
        kind: r.kind,
        title: r.title,
      })),
    };
  });

  return results;
}
