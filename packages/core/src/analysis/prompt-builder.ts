import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
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
} from './section-formatters.js';

export const PromptBuilder = {
  /** Extract the first JSON object from an AI response text, or null if none found. */
  extractJson(responseText: string): string | null {
    const start = responseText.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < responseText.length; i++) {
      const ch = responseText[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return responseText.slice(start, i + 1);
      }
    }
    return null;
  },
  /**
   * Stage 2: Build dependency extraction prompt to extract architectural dependencies from git diff
   * @param data - Must contain exactly one component (selected in Stage 1)
   */
  buildDependencyExtractionPrompt(data: DependencyExtractionPromptData): string {
    const { diff, commit, repository, components } = data;

    let componentsContext = '';

    if (!components || components.length === 0) {
      componentsContext = 'Component: Unknown (repository not mapped in LikeC4)';
    } else if (components.length > 1) {
      throw new ErodeError(
        `buildDependencyExtractionPrompt requires exactly 1 component, received ${String(components.length)}`,
        ErrorCode.MODEL_COMPONENT_MISSING,
        `Component selection error: expected 1 component but received ${String(components.length)}. Component selection must occur in Stage 1.`,
        { componentCount: components.length }
      );
    } else {
      const [comp] = components;
      if (!comp) {
        throw new ErodeError(
          'First component is unexpectedly undefined',
          ErrorCode.MODEL_COMPONENT_MISSING,
          'Unexpected error: first component is undefined. This looks like a programming bug.'
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
   * Stage 1: Build component selection prompt
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
   * Build a prompt for inserting relationship lines into an existing model file
   */
  buildModelPatchPrompt(data: {
    fileContent: string;
    linesToInsert: string[];
    modelFormat: string;
  }): string {
    return TemplateEngine.loadModelPatchPrompt({
      fileContent: data.fileContent,
      linesToInsert: data.linesToInsert.join('\n'),
      modelFormat: data.modelFormat,
    });
  },
} as const;
