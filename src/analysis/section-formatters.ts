import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import type { DriftViolation } from './analysis-types.js';

export function formatAllowedDependencies(architectural: {
  relationships?: { target: { id: string; name: string }; kind?: string; title?: string }[];
  dependencies: { id: string; name: string; type: string; repository?: string }[];
}): string {
  if (architectural.relationships && architectural.relationships.length > 0) {
    const byTarget = new Map<string, { kind?: string; title?: string }[]>();
    for (const rel of architectural.relationships) {
      const existing = byTarget.get(rel.target.id) ?? [];
      existing.push({ kind: rel.kind, title: rel.title });
      byTarget.set(rel.target.id, existing);
    }
    const depLines: string[] = [];
    for (const [targetId, rels] of byTarget.entries()) {
      const target = architectural.relationships.find((r) => r.target.id === targetId)?.target;
      if (target) {
        const kinds = rels.map((r) => r.kind ?? 'unknown').join(', ');
        depLines.push(`  - ${target.name} [via: ${kinds}]`);
      }
    }
    return depLines.join('\n');
  } else if (architectural.dependencies.length > 0) {
    return architectural.dependencies.map((d) => `  - ${d.name} (${d.type})`).join('\n');
  }
  return '  - None defined in LikeC4 model';
}

export function formatDependents(dependents: { name: string; type: string }[]): string {
  return dependents.length > 0
    ? dependents.map((d) => `  - ${d.name} (${d.type})`).join('\n')
    : '  - None';
}

export function formatDependencyChanges(dependencies: DependencyExtractionResult): string {
  if (dependencies.dependencies.length === 0) {
    return 'No architectural dependency changes detected across all commits in this PR.';
  }
  const added = dependencies.dependencies.filter((d) => d.type === 'added');
  const modified = dependencies.dependencies.filter((d) => d.type === 'modified');
  const removed = dependencies.dependencies.filter((d) => d.type === 'removed');
  const prefix = 'Aggregated dependency changes across all commits:\n\n';
  let section = prefix;
  if (added.length > 0) {
    section += '**ADDED Dependencies:**\n';
    for (const dep of added) {
      section += `- ${dep.dependency} (${dep.file})\n`;
      section += `  ${dep.description}\n`;
    }
    section += '\n';
  }
  if (modified.length > 0) {
    section += '**MODIFIED Dependencies:**\n';
    for (const dep of modified) {
      section += `- ${dep.dependency} (${dep.file})\n`;
      section += `  ${dep.description}\n`;
    }
    section += '\n';
  }
  if (removed.length > 0) {
    section += '**REMOVED Dependencies:**\n';
    for (const dep of removed) {
      section += `- ${dep.dependency} (${dep.file})\n`;
      section += `  ${dep.description}\n`;
    }
    section += '\n';
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
  components: { id: string; name: string; type: string; technology?: string; description?: string }[],
): string {
  return components
    .map(
      (c, idx) => `
${String(idx + 1)}. **${c.id}**
   - Name: ${c.name}
   - Type: ${c.type}
   ${c.technology ? `- Technology: ${c.technology}` : ''}
   ${c.description ? `- Description: ${c.description}` : ''}`,
    )
    .join('\n');
}

export function formatCommits(
  commits: { sha: string; message: string; author: string }[],
): { section: string; note: string } {
  const section = commits
    .slice(0, 10)
    .map((c) => `  - ${c.sha.substring(0, 7)}: ${c.message.split('\n')[0] ?? ''} (${c.author})`)
    .join('\n');
  const note =
    commits.length > 10 ? `\n  ... and ${String(commits.length - 10)} more commits` : '';
  return { section, note };
}

export function formatViolations(violations: DriftViolation[]): string {
  return violations.length > 0
    ? violations.map((v) => `- [${v.severity.toUpperCase()}] ${v.description}`).join('\n')
    : 'No violations detected';
}

export function formatDependencyChangesSummary(
  dependencies: DependencyExtractionResult,
): string {
  return dependencies.dependencies.length > 0
    ? dependencies.dependencies
        .map(
          (d) =>
            `- ${d.type === 'added' ? '+' : d.type === 'removed' ? '-' : '~'} ${d.dependency}: ${d.description}`,
        )
        .join('\n')
    : 'No dependency changes detected';
}

export function formatModelUpdates(
  modelUpdates?: { add?: string[]; remove?: string[]; notes?: string },
): string {
  if (!modelUpdates) {
    return 'No model updates recommended';
  }
  return `
ADD TO MODEL:
${modelUpdates.add ? modelUpdates.add.map((dep) => `- ${dep}`).join('\n') : 'None'}
REMOVE FROM MODEL:
${modelUpdates.remove ? modelUpdates.remove.map((dep) => `- ${dep}`).join('\n') : 'None'}
NOTES:
${modelUpdates.notes ?? 'None'}
`;
}

export function formatExistingComponents(
  allComponents?: ArchitecturalComponent[],
): string {
  if (!allComponents || allComponents.length === 0) {
    return '';
  }
  return `
EXISTING COMPONENTS IN THE MODEL:
${allComponents
  .map(
    (c: ArchitecturalComponent) =>
      `- ${c.id}: "${c.name}" (${c.type}${c.repository ? `, repo: ${c.repository}` : ''})`,
  )
  .join('\n')}
⚠️ CRITICAL: Before creating a NEW component, search this list for existing components that match.
- Look for components with similar names (e.g., "userservice", "user-api", "user_api")
- Check repository URLs to match services
- Prefer using existing component IDs over creating new ones
- If you find a match, use the existing component ID exactly as shown above
`;
}
