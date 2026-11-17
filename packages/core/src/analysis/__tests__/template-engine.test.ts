import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TemplateEngine, findMissingVariables } from '../template-engine.js';
import { CONFIG } from '../../utils/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

  it('leaves no key of any real template without a value', () => {
    // A missing key renders empty at runtime, so this is what catches a renamed variable.
    const read = (name: string) =>
      readFileSync(join(__dirname, '..', 'prompts', `${name}.md`), 'utf-8');
    expect(findMissingVariables(read('dependency-extraction'), dependencyVars)).toEqual([]);
    expect(findMissingVariables(read('component-selection'), componentVars)).toEqual([]);
    expect(findMissingVariables(read('drift-analysis'), driftVars)).toEqual([]);
    expect(findMissingVariables(read('model-patch'), patchVars)).toEqual([]);
  });

  it('reports missing keys, including nested ones', () => {
    expect(findMissingVariables('{{a}} {{ b.c }} {{d}}', { a: '', b: {} })).toEqual(['b.c', 'd']);
  });

  it('renders a missing variable as empty and warns in verbose mode', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const previous = CONFIG.debug.verbose;
    CONFIG.debug.verbose = true;
    try {
      const { files: _files, ...incomplete } = componentVars;
      const output = TemplateEngine.loadComponentSelectionPrompt(
        incomplete as ComponentSelectionPromptVars
      );
      expect(output).not.toMatch(/\{\{[^}]*\}\}/);
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/component-selection.*files/));
    } finally {
      CONFIG.debug.verbose = previous;
      spy.mockRestore();
    }
  });

  it('renders an explicit empty string', () => {
    expect(() =>
      TemplateEngine.loadComponentSelectionPrompt({ components: '', files: '' })
    ).not.toThrow();
  });
});
