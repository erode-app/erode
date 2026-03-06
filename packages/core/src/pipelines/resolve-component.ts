import type { ProgressReporter } from './progress.js';
import type { AIProvider } from '../providers/ai-provider.js';
import type { ArchitecturalComponent } from '../adapters/architecture-types.js';

/**
 * Use AI to select the best-matching component when multiple candidates exist.
 * Returns the selected component, falling back to `defaultComponent` if the
 * provider lacks the capability or the model returns no result.
 */
export async function selectComponentWithAI(
  provider: AIProvider,
  components: ArchitecturalComponent[],
  files: { filename: string }[],
  defaultComponent: ArchitecturalComponent,
  progress: ProgressReporter
): Promise<ArchitecturalComponent> {
  progress.start('Asking the model to pick the best-matching component');
  if (!provider.selectComponent) {
    progress.warn(`Provider lacks component selection, defaulting to: ${defaultComponent.name}`);
    return defaultComponent;
  }
  const componentId = await provider.selectComponent({ components, files });
  if (componentId) {
    const found = components.find((c) => c.id === componentId) ?? defaultComponent;
    progress.succeed(`Chosen component: ${found.name} (${componentId})`);
    return found;
  }
  progress.warn(`AI was unable to pick a component, defaulting to: ${defaultComponent.name}`);
  return defaultComponent;
}
