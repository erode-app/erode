import { readFileSync } from 'fs';
import type {
  DependencyExtractionPromptVars,
  ComponentSelectionPromptVars,
  DriftAnalysisPromptVars,
  ModelPatchPromptVars,
} from './prompt-variables.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadTemplate(templateName: string): string {
  const templatePath = join(__dirname, 'prompts', `${templateName}.md`);
  return readFileSync(templatePath, 'utf-8');
}

function resolveVariable(variables: object, path: string): unknown {
  return path
    .trim()
    .split('.')
    .reduce<unknown>(
      (obj, key) =>
        obj != null &&
        typeof obj === 'object' &&
        !Array.isArray(obj) &&
        key in (obj as Record<string, unknown>)
          ? (obj as Record<string, unknown>)[key]
          : undefined,
      variables
    );
}

function formatValue(value: unknown): string {
  switch (true) {
    case value === null || value === undefined:
      return '';
    case Array.isArray(value):
      return (value as unknown[]).join(', ');
    case typeof value === 'object':
      return JSON.stringify(value);
    case typeof value === 'string':
    case typeof value === 'number':
    case typeof value === 'boolean':
      return String(value);
    default:
      return '';
  }
}

function replaceVariables(template: string, variables: object): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match: string, path: string) => {
    const value = resolveVariable(variables, path);
    return value === undefined ? '' : formatValue(value);
  });
}

/**
 * Simple template engine for replacing {{variable}} placeholders in markdown templates
 */
export const TemplateEngine = {
  loadDependencyExtractionPrompt(variables: DependencyExtractionPromptVars): string {
    const template = loadTemplate('dependency-extraction');
    return replaceVariables(template, variables);
  },
  loadDriftAnalysisPrompt(variables: DriftAnalysisPromptVars): string {
    const template = loadTemplate('drift-analysis');
    return replaceVariables(template, variables);
  },
  loadComponentSelectionPrompt(variables: ComponentSelectionPromptVars): string {
    const template = loadTemplate('component-selection');
    return replaceVariables(template, variables);
  },
  loadModelPatchPrompt(variables: ModelPatchPromptVars): string {
    const template = loadTemplate('model-patch');
    return replaceVariables(template, variables);
  },
} as const;
