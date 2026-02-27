import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import type { DriftViolation } from './analysis-types.js';

export function formatAllowedDependencies(architectural: {
  relationships?: { target: { id: string; name: string }; kind?: string; title?: string }[];
  dependencies: { id: string; name: string; type: string; repository?: string }[];
}): string {
  if (architectural.relationships && architectural.relationships.length > 0) {
    const grouped = architectural.relationships.reduce<
      Map<string, { name: string; kinds: string[] }>
    >((acc, rel) => {
      const entry = acc.get(rel.target.id) ?? { name: rel.target.name, kinds: [] };
      entry.kinds.push(rel.kind ?? 'unknown');
      acc.set(rel.target.id, entry);
      return acc;
    }, new Map());
    return Array.from(grouped.values())
      .map(({ name, kinds }) => `  - ${name} [via: ${kinds.join(', ')}]`)
      .join('\n');
  }
  if (architectural.dependencies.length > 0) {
    return architectural.dependencies.map((d) => `  - ${d.name} (${d.type})`).join('\n');
  }
  return '  - No declared dependencies';
}

export function formatDependents(dependents: { name: string; type: string }[]): string {
  return dependents.length > 0
    ? dependents.map((d) => `  - ${d.name} (${d.type})`).join('\n')
    : '  - No dependents';
}

export function formatDependencyChanges(dependencies: DependencyExtractionResult): string {
  if (dependencies.dependencies.length === 0) {
    return 'No architectural dependency changes detected across all commits in this PR.';
  }

  const buckets = dependencies.dependencies.reduce<
    Record<string, typeof dependencies.dependencies>
  >((acc, dep) => {
    (acc[dep.type] ??= []).push(dep);
    return acc;
  }, {});

  const labels: Record<string, string> = {
    added: 'ADDED',
    modified: 'MODIFIED',
    removed: 'REMOVED',
  };
  let section = 'Aggregated dependency changes across all commits:\n\n';

  for (const [type, label] of Object.entries(labels)) {
    const items = buckets[type];
    if (items && items.length > 0) {
      section += `**${label} Dependencies:**\n`;
      section += items
        .map((dep) => `- ${dep.dependency} (${dep.file})\n  ${dep.description}`)
        .join('\n');
      section += '\n\n';
    }
  }

  return section;
}

export function formatComponentContext(comp: {
  name: string;
  id: string;
  type: string;
  technology?: string;
}): string {
  return `
Component: ${comp.name} (${comp.id})
Type: ${comp.type}
${comp.technology ? `Technology: ${comp.technology}` : ''}`;
}

export function formatComponentList(
  components: {
    id: string;
    name: string;
    type: string;
    technology?: string;
    description?: string;
  }[]
): string {
  return components
    .map(
      (c, idx) => `
${String(idx + 1)}. **${c.id}**
   - Name: ${c.name}
   - Type: ${c.type}
   ${c.technology ? `- Technology: ${c.technology}` : ''}
   ${c.description ? `- Description: ${c.description}` : ''}`
    )
    .join('\n');
}

export function formatCommits(commits: { sha: string; message: string; author: string }[]): {
  section: string;
  note: string;
} {
  const section = commits
    .slice(0, 10)
    .map((c) => `  - ${c.sha.substring(0, 7)}: ${c.message.split('\n')[0] ?? ''} (${c.author})`)
    .join('\n');
  const note = commits.length > 10 ? `\n  ... and ${String(commits.length - 10)} more commits` : '';
  return { section, note };
}

export function formatViolations(violations: DriftViolation[]): string {
  if (violations.length === 0) return 'No violations detected';
  return violations.map((v) => `- [${v.severity.toUpperCase()}] ${v.description}`).join('\n');
}

export function formatDependencyChangesSummary(dependencies: DependencyExtractionResult): string {
  return dependencies.dependencies.length > 0
    ? dependencies.dependencies
        .map(
          (d) =>
            `- ${d.type === 'added' ? '+' : d.type === 'removed' ? '-' : '~'} ${d.dependency}: ${d.description}`
        )
        .join('\n')
    : 'No dependency changes detected';
}

export function formatModelUpdates(modelUpdates?: {
  add?: string[];
  remove?: string[];
  notes?: string;
}): string {
  if (!modelUpdates) return 'No model updates recommended';
  const addSection = modelUpdates.add?.map((dep) => `- ${dep}`).join('\n') ?? 'None';
  const removeSection = modelUpdates.remove?.map((dep) => `- ${dep}`).join('\n') ?? 'None';
  return [
    'ADD TO MODEL:',
    addSection,
    'REMOVE FROM MODEL:',
    removeSection,
    'NOTES:',
    modelUpdates.notes ?? 'None',
  ].join('\n');
}

export function formatExistingComponents(allComponents?: ArchitecturalComponent[]): string {
  if (!allComponents || allComponents.length === 0) return '';
  const lines = allComponents.map(
    (c: ArchitecturalComponent) =>
      `- ${c.id}: "${c.name}" (${c.type}${c.repository ? `, repo: ${c.repository}` : ''})`
  );
  return [
    '',
    'EXISTING COMPONENTS IN THE MODEL:',
    ...lines,
    '⚠️ CRITICAL: Before creating a NEW component, search this list for existing components that match.',
    '- Look for components with similar names (e.g., "userservice", "user-api", "user_api")',
    '- Check repository URLs to match services',
    '- Prefer using existing component IDs over creating new ones',
    '- If you find a match, use the existing component ID exactly as shown above',
    '',
  ].join('\n');
}
