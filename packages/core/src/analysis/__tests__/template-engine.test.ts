import { describe, it, expect } from 'vitest';
import { TemplateEngine } from '../template-engine.js';
import type {
  ComponentSelectionPromptVars,
  DependencyExtractionPromptVars,
  DriftAnalysisPromptVars,
  ModelPatchPromptVars,
} from '../prompt-variables.js';

const dependencyVars: DependencyExtractionPromptVars = {
  diff: 'DIFF_SENTINEL',
  commit: { sha: 'sha123', message: 'msg', author: 'dev' },
  repository: { owner: 'org', repo: 'app', url: 'https://example.com/org/app' },
  componentsContext: 'CTX_SENTINEL',
};

const componentVars: ComponentSelectionPromptVars = {
  components: 'COMPONENTS_SENTINEL',
  files: 'FILES_SENTINEL',
};

const driftVars: DriftAnalysisPromptVars = {
  changeContext: {
    label: 'a pull request',
    headerPrefix: 'PULL REQUEST',
    refLabel: 'PR #1:',
    inSuffix: ' IN THIS PR',
    considerations: 'CONSIDERATIONS_SENTINEL',
  },
  changeRequest: {
    number: 1,
    title: 'TITLE_SENTINEL',
    author: 'AUTHOR_SENTINEL',
    base: { ref: 'main' },
    head: { ref: 'feature' },
    stats: { commits: 2, additions: 3, deletions: 4, files_changed: 5 },
    descriptionSection: '',
  },
  component: {
    name: 'NAME_SENTINEL',
    id: 'comp.id',
    type: 'service',
    description: 'None',
    repository: 'Unknown',
    tags: 'None',
  },
  commitsSection: 'COMMITS_SENTINEL',
  commitsNote: '',
  allowedDeps: 'ALLOWED_SENTINEL',
  dependents: 'DEPENDENTS_SENTINEL',
  allComponentIds: 'IDS_SENTINEL',
  allRelationships: 'RELS_SENTINEL',
  filesSection: 'FILESSECTION_SENTINEL',
  dependencyChangesSection: 'DEPCHANGES_SENTINEL',
};

const patchVars: ModelPatchPromptVars = {
  fileContent: 'FILECONTENT_SENTINEL',
  linesToInsert: 'LINES_SENTINEL',
  modelFormat: 'likec4',
  syntaxGuide: 'GUIDE_SENTINEL',
};

describe('TemplateEngine real templates', () => {
  it.each([
    ['dependency-extraction', () => TemplateEngine.loadDependencyExtractionPrompt(dependencyVars)],
    ['component-selection', () => TemplateEngine.loadComponentSelectionPrompt(componentVars)],
    ['drift-analysis', () => TemplateEngine.loadDriftAnalysisPrompt(driftVars)],
    ['model-patch', () => TemplateEngine.loadModelPatchPrompt(patchVars)],
  ])('renders %s with no unresolved placeholders', (_name, render) => {
    const output = render();
    expect(output).not.toMatch(/\{\{[^}]*\}\}/);
    expect(output.length).toBeGreaterThan(0);
  });

  it('substitutes representative values', () => {
    expect(TemplateEngine.loadDependencyExtractionPrompt(dependencyVars)).toContain(
      'DIFF_SENTINEL'
    );
    expect(TemplateEngine.loadDriftAnalysisPrompt(driftVars)).toContain('DEPCHANGES_SENTINEL');
    expect(TemplateEngine.loadModelPatchPrompt(patchVars)).toContain('GUIDE_SENTINEL');
  });

  it('loads the bundled LikeC4 syntax guide', () => {
    expect(TemplateEngine.loadSyntaxGuide('likec4', 'likec4-syntax-guide').length).toBeGreaterThan(
      0
    );
  });

  it('throws naming the template and key when a variable is missing', () => {
    const { files: _files, ...incomplete } = componentVars;
    expect(() =>
      TemplateEngine.loadComponentSelectionPrompt(incomplete as ComponentSelectionPromptVars)
    ).toThrow(/component-selection.*files/);
  });

  it('throws for a missing nested key', () => {
    const vars = {
      ...driftVars,
      changeRequest: { ...driftVars.changeRequest, base: {} },
    } as unknown as DriftAnalysisPromptVars;
    expect(() => TemplateEngine.loadDriftAnalysisPrompt(vars)).toThrow(
      /drift-analysis.*changeRequest\.base\.ref/
    );
  });

  it('renders an explicit empty string', () => {
    expect(() =>
      TemplateEngine.loadComponentSelectionPrompt({ components: '', files: '' })
    ).not.toThrow();
  });
});
