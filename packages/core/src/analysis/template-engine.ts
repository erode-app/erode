import { readFileSync } from 'fs';
import type {
  DependencyExtractionPromptVars,
  ComponentSelectionPromptVars,
  DriftAnalysisPromptVars,
  ModelGenerationPromptVars,
} from './prompt-variables.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadTemplate(templateName: string): string {
  const templatePath = join(__dirname, 'prompts', `${templateName}.md`);
  return readFileSync(templatePath, 'utf-8');
}

function loadAdapterTemplate(adapterName: string, templateName: string): string {
  const templatePath = join(
    __dirname,
    '..',
    'adapters',
    adapterName,
    'prompts',
    `${templateName}.md`
  );
  return readFileSync(templatePath, 'utf-8');
}

function replaceVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match: string, path: string) => {
    const keys = path.trim().split('.');
    let value: unknown = variables;
    for (const key of keys) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.prototype.hasOwnProperty.call(value, key)
      ) {
        value = Reflect.get(value, key);
      } else {
        return match; // Keep placeholder if path not found
      }
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return JSON.stringify(value);
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  });
}

/**
 * Simple template engine for replacing {{variable}} placeholders in markdown templates
 */
export const TemplateEngine = {
  loadDependencyExtractionPrompt(variables: DependencyExtractionPromptVars): string {
    const template = loadTemplate('dependency-extraction');
    return replaceVariables(template, variables as unknown as Record<string, unknown>);
  },
  loadDriftAnalysisPrompt(variables: DriftAnalysisPromptVars): string {
    const template = loadTemplate('drift-analysis');
    return replaceVariables(template, variables as unknown as Record<string, unknown>);
  },
  loadModelGenerationPrompt(
    variables: ModelGenerationPromptVars,
    adapterFormat = 'likec4'
  ): string {
    const template = loadAdapterTemplate(adapterFormat, 'model-generation');
    return replaceVariables(template, variables as unknown as Record<string, unknown>);
  },
  loadComponentSelectionPrompt(variables: ComponentSelectionPromptVars): string {
    const template = loadTemplate('component-selection');
    return replaceVariables(template, variables as unknown as Record<string, unknown>);
  },
} as const;
