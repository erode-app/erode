import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
} from './analysis-types.js';
import type { ChangeContextVars } from './prompt-variables.js';
import { TemplateEngine } from './template-engine.js';
import { ErodeError, ErrorCode } from '../errors.js';
import {
  formatAllowedDependencies,
  formatDependents,
  formatDependencyChanges,
  formatAllRelationships,
  formatChangedFiles,
  formatComponentContext,
  formatComponentList,
  formatCommits,
  formatFileOwnership,
} from './section-formatters.js';
import { mapFilesToComponents } from '../utils/file-component-mapper.js';
import { parseFilesFromDiff } from '../utils/git-diff.js';

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

    let componentsContext: string;

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

    let fileOwnership = '';
    const selectedComp = components?.[0];
    if (data.allComponents && data.allComponents.length > 1 && selectedComp) {
      const files = parseFilesFromDiff(diff);
      const ownershipMap = mapFilesToComponents(files, data.allComponents, selectedComp.id);
      if (ownershipMap.otherComponents.length > 0) {
        fileOwnership = formatFileOwnership(ownershipMap);
      }
    }

    return TemplateEngine.loadDependencyExtractionPrompt({
      diff,
      commit,
      repository,
      componentsContext,
      fileOwnership,
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
    const allComponentIds =
      (data.allComponentIds ?? []).map((id) => `- \`${id}\``).join('\n') || '(none)';
    const allRelationships = data.allRelationships?.length
      ? formatAllRelationships(data.allRelationships)
      : '(none)';
    const filesSection = data.files?.length
      ? formatChangedFiles(data.files)
      : 'No file list available.';

    const isLocal = changeRequest.source === 'local' || changeRequest.number === 0;
    const changeContext: ChangeContextVars = isLocal
      ? {
          label: 'local changes',
          headerPrefix: 'LOCAL CHANGES',
          refLabel: 'Changes:',
          inSuffix: '',
          considerations: [
            "- Evaluate if the changes align with the component's architectural role",
            '- Consider whether new dependencies should be declared in the model',
            '- Provide recommendations before these changes are committed',
          ].join('\n'),
        }
      : {
          label: 'a pull request',
          headerPrefix: 'PULL REQUEST',
          refLabel: `PR #${String(changeRequest.number)}:`,
          inSuffix: ' IN THIS PR',
          considerations: [
            "- Consider the PR's stated goals and description",
            "- Evaluate if the architectural changes align with the PR's purpose",
            '- Provide recommendations for the PR review',
          ].join('\n'),
        };

    return TemplateEngine.loadDriftAnalysisPrompt({
      changeContext,
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
      allComponentIds,
      allRelationships,
      filesSection,
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
