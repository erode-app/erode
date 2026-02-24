import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
  DriftAnalysisResult,
} from './analysis-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import { TemplateEngine } from './template-engine.js';
import { ErodeError, ErrorCode } from '../errors.js';

function buildAllowedDependenciesSection(architectural: {
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

function buildDependentsSection(dependents: { name: string; type: string }[]): string {
  return dependents.length > 0
    ? dependents.map((d) => `  - ${d.name} (${d.type})`).join('\n')
    : '  - None';
}

function buildDependencyChangesSection(dependencies: DependencyExtractionResult): string {
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

export const PromptBuilder = {
  /** Extract the first JSON object from an AI response text, or null if none found. */
  extractJson(responseText: string): string | null {
    const jsonMatch = /\{[\s\S]*\}/.exec(responseText);
    return jsonMatch ? jsonMatch[0] : null;
  },
  /**
   * Stage 1: Build dependency extraction prompt to extract architectural dependencies from git diff
   * @param data - Must contain exactly one component (selected in Stage 0)
   */
  buildDependencyExtractionPrompt(data: DependencyExtractionPromptData): string {
    const { diff, commit, repository, components } = data;

    let componentsContext = '';

    if (!components || components.length === 0) {
      componentsContext = 'Component: Unknown (repository not mapped in LikeC4)';
    } else if (components.length > 1) {
      throw new ErodeError(
        `buildDependencyExtractionPrompt expects exactly 1 component, got ${String(components.length)}`,
        ErrorCode.COMPONENT_NOT_FOUND,
        `Component selection error: Expected 1 component but got ${String(components.length)}. Component selection should happen in Stage 0.`,
        { componentCount: components.length }
      );
    } else {
      const [comp] = components;
      if (!comp) {
        throw new ErodeError(
          'First component is undefined',
          ErrorCode.COMPONENT_NOT_FOUND,
          'Unexpected error: First component is undefined. This appears to be a programming error.'
        );
      }
      componentsContext = `
Component: ${comp.name} (${comp.id})
Type: ${comp.type}
${comp.technology ? `Technology: ${comp.technology}` : ''}`;
    }

    return TemplateEngine.loadDependencyExtractionPrompt({
      diff,
      commit,
      repository,
      componentsContext,
    });
  },
  /**
   * Stage 0: Build component selection prompt
   */
  buildComponentSelectionPrompt(data: ComponentSelectionPromptData): string {
    const { components, files } = data;

    const componentsText = components
      .map(
        (c, idx) => `
${String(idx + 1)}. **${c.id}**
   - Name: ${c.name}
   - Type: ${c.type}
   ${c.technology ? `- Technology: ${c.technology}` : ''}
   ${c.description ? `- Description: ${c.description}` : ''}`
      )
      .join('\n');

    const filesText = files.map((f) => `- ${f.filename}`).join('\n');

    return TemplateEngine.loadComponentSelectionPrompt({
      components: componentsText,
      files: filesText,
    });
  },
  /**
   * Build drift analysis prompt for a change request (aggregates multiple commits)
   */
  buildDriftAnalysisPrompt(data: DriftAnalysisPromptData): string {
    const { changeRequest, component, dependencies, architectural } = data;
    const allowedDeps = buildAllowedDependenciesSection(architectural);
    const dependents = buildDependentsSection(architectural.dependents);
    const dependencyChangesSection = buildDependencyChangesSection(dependencies);
    const commitsSection = changeRequest.commits
      .slice(0, 10)
      .map((c) => `  - ${c.sha.substring(0, 7)}: ${c.message.split('\n')[0] ?? ''} (${c.author})`)
      .join('\n');
    const commitsNote =
      changeRequest.commits.length > 10 ? `\n  ... and ${String(changeRequest.commits.length - 10)} more commits` : '';
    return TemplateEngine.loadDriftAnalysisPrompt({
      changeRequest: {
        number: changeRequest.number,
        title: changeRequest.title,
        author: changeRequest.author.name ?? changeRequest.author.login,
        base: { ref: changeRequest.base.ref },
        head: { ref: changeRequest.head.ref },
        stats: changeRequest.stats,
        descriptionSection: changeRequest.description ? `Description:\n${changeRequest.description}\n` : '',
      },
      component: {
        name: component.name,
        id: component.id,
        type: component.type,
        repository: component.repository ?? 'Unknown',
        tags: component.tags.join(', ') || 'None',
      },
      commitsSection,
      commitsNote,
      allowedDeps,
      dependents,
      dependencyChangesSection,
    });
  },
  /**
   * Build a prompt for generating architecture model code from analysis results
   */
  buildModelGenerationPrompt(analysisResult: DriftAnalysisResult): string {
    const { component, modelUpdates, metadata, violations, dependencyChanges, allComponents } =
      analysisResult;
    const violationsSection =
      violations.length > 0
        ? violations.map((v) => `- [${v.severity.toUpperCase()}] ${v.description}`).join('\n')
        : 'No violations detected';
    const dependencyChangesSection =
      dependencyChanges.dependencies.length > 0
        ? dependencyChanges.dependencies
            .map(
              (d) =>
                `- ${d.type === 'added' ? '+' : d.type === 'removed' ? '-' : '~'} ${d.dependency}: ${d.description}`
            )
            .join('\n')
        : 'No dependency changes detected';
    const modelUpdatesSection = modelUpdates
      ? `
ADD TO MODEL:
${modelUpdates.add ? modelUpdates.add.map((dep) => `- ${dep}`).join('\n') : 'None'}
REMOVE FROM MODEL:
${modelUpdates.remove ? modelUpdates.remove.map((dep) => `- ${dep}`).join('\n') : 'None'}
NOTES:
${modelUpdates.notes ?? 'None'}
`
      : 'No model updates recommended';
    const existingComponentsSection =
      allComponents && allComponents.length > 0
        ? `
EXISTING COMPONENTS IN THE MODEL:
${allComponents
  .map(
    (c: ArchitecturalComponent) =>
      `- ${c.id}: "${c.name}" (${c.type}${c.repository ? `, repo: ${c.repository}` : ''})`
  )
  .join('\n')}
⚠️ CRITICAL: Before creating a NEW component, search this list for existing components that match.
- Look for components with similar names (e.g., "userservice", "user-api", "user_api")
- Check repository URLs to match services
- Prefer using existing component IDs over creating new ones
- If you find a match, use the existing component ID exactly as shown above
`
        : '';
    const modelFormat = analysisResult.modelFormat ?? 'likec4';
    return TemplateEngine.loadModelGenerationPrompt(
      {
        metadata: {
          number: metadata.number,
          title: metadata.title,
        },
        component: {
          id: component.id,
          name: component.name,
          type: component.type,
          repository: component.repository ?? 'Not specified',
        },
        existingComponentsSection,
        violationsSection,
        dependencyChangesSection,
        modelUpdatesSection,
        date: new Date().toISOString().split('T')[0] ?? '',
      },
      modelFormat
    );
  },
} as const;
