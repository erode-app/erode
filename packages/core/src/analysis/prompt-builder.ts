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
} from './section-formatters.js';

const UNTRUSTED_NAME = /^untrusted[_-](?:pr[_-]content|diff)/i;

/**
 * Prevents author-controlled text from closing an untrusted block early. Escapes the `<` of any
 * tag-like sequence for the untrusted block names, tolerating case, `_`/`-` variants and any
 * amount of whitespace or `/` before the name. A single forward scan that jumps past each
 * skipped run keeps it linear, with no regex backtracking.
 */
function escapeUntrusted(text: string): string {
  let out = '';
  let last = 0;
  let i = text.indexOf('<');
  while (i !== -1) {
    let j = i + 1;
    while (j < text.length && (text[j] === '/' || /\s/.test(text.charAt(j)))) j++;
    let next = j;
    if (UNTRUSTED_NAME.test(text.slice(j, j + 32))) {
      out += text.slice(last, i) + '&lt;';
      last = i + 1;
      next = i + 1;
    }
    i = text.indexOf('<', next);
  }
  return last === 0 ? text : out + text.slice(last);
}

export const PromptBuilder = {
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

    return TemplateEngine.loadDependencyExtractionPrompt({
      diff: escapeUntrusted(diff),
      commit: {
        ...commit,
        message: escapeUntrusted(commit.message),
        author: escapeUntrusted(commit.author),
      },
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
        title: escapeUntrusted(changeRequest.title),
        author: escapeUntrusted(changeRequest.author.name ?? changeRequest.author.login),
        base: { ref: escapeUntrusted(changeRequest.base.ref) },
        head: { ref: escapeUntrusted(changeRequest.head.ref) },
        stats: changeRequest.stats,
        descriptionSection: changeRequest.description
          ? `Description:\n${escapeUntrusted(changeRequest.description)}\n`
          : '',
      },
      component: {
        name: component.name,
        id: component.id,
        type: component.type,
        description: component.description ?? 'None',
        repository: component.repository ?? 'Unknown',
        tags: component.tags.join(', ') || 'None',
      },
      commitsSection: escapeUntrusted(commitsSection),
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
    const syntaxGuide =
      data.modelFormat === 'likec4'
        ? TemplateEngine.loadSyntaxGuide('likec4', 'likec4-syntax-guide')
        : '';
    return TemplateEngine.loadModelPatchPrompt({
      fileContent: data.fileContent,
      linesToInsert: data.linesToInsert.join('\n'),
      modelFormat: data.modelFormat,
      syntaxGuide,
    });
  },
} as const;
