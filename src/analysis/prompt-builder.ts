import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
  DriftAnalysisResult,
} from './analysis-types.js';
import { TemplateEngine } from './template-engine.js';
import { ErodeError, ErrorCode } from '../errors.js';
import {
  formatAllowedDependencies,
  formatDependents,
  formatDependencyChanges,
  formatComponentContext,
  formatComponentList,
  formatCommits,
  formatViolations,
  formatDependencyChangesSummary,
  formatModelUpdates,
  formatExistingComponents,
} from './section-formatters.js';

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
      componentsContext = formatComponentContext(comp);
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
    const componentsText = formatComponentList(components);
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
    const allowedDeps = formatAllowedDependencies(architectural);
    const dependents = formatDependents(architectural.dependents);
    const dependencyChangesSection = formatDependencyChanges(dependencies);
    const { section: commitsSection, note: commitsNote } = formatCommits(changeRequest.commits);

    return TemplateEngine.loadDriftAnalysisPrompt({
      changeRequest: {
        number: changeRequest.number,
        title: changeRequest.title,
        author: changeRequest.author.name ?? changeRequest.author.login,
        base: { ref: changeRequest.base.ref },
        head: { ref: changeRequest.head.ref },
        stats: changeRequest.stats,
        descriptionSection: changeRequest.description
          ? `Description:\n${changeRequest.description}\n`
          : '',
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
    const violationsSection = formatViolations(violations);
    const dependencyChangesSection = formatDependencyChangesSummary(dependencyChanges);
    const modelUpdatesSection = formatModelUpdates(modelUpdates);
    const existingComponentsSection = formatExistingComponents(allComponents);
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
