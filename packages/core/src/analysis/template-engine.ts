import { readFileSync } from 'fs';
import type {
  DependencyExtractionPromptVars,
  ComponentSelectionPromptVars,
  DriftAnalysisPromptVars,
  ModelPatchPromptVars,
} from './prompt-variables.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ErodeError, ErrorCode } from '../errors.js';
import { CONFIG } from '../utils/config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readMarkdownFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    throw new ErodeError(
      `Failed to read template: ${filePath}`,
      ErrorCode.IO_FILE_NOT_FOUND,
      'Could not load a required prompt template. This may indicate a broken installation.',
      { filePath }
    );
  }
}

function loadTemplate(templateName: string): string {
  const templatePath = join(__dirname, 'prompts', `${templateName}.md`);
  return readMarkdownFile(templatePath);
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

const PLACEHOLDER = /\{\{([^}]+)\}\}/g;

/** Placeholder keys in `template` that `variables` does not provide. */
export function findMissingVariables(template: string, variables: object): string[] {
  const missing: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const key = (match[1] ?? '').trim();
    if (resolveVariable(variables, key) === undefined) missing.push(key);
  }
  return missing;
}

// A missing key renders empty rather than aborting a real analysis; tests catch renamed
// variables through findMissingVariables.
function renderTemplate(templateName: string, variables: object): string {
  const template = loadTemplate(templateName);
  if (CONFIG.debug.verbose) {
    for (const key of findMissingVariables(template, variables)) {
      console.error(`[TemplateEngine] Template "${templateName}" has no value for "${key}"`);
    }
  }
  return template.replace(PLACEHOLDER, (_match: string, path: string) =>
    formatValue(resolveVariable(variables, path))
  );
}

/**
 * Simple template engine for replacing {{variable}} placeholders in markdown templates
 */
export const TemplateEngine = {
  loadDependencyExtractionPrompt(variables: DependencyExtractionPromptVars): string {
    return renderTemplate('dependency-extraction', variables);
  },
  loadDriftAnalysisPrompt(variables: DriftAnalysisPromptVars): string {
    return renderTemplate('drift-analysis', variables);
  },
  loadComponentSelectionPrompt(variables: ComponentSelectionPromptVars): string {
    return renderTemplate('component-selection', variables);
  },
  loadModelPatchPrompt(variables: ModelPatchPromptVars): string {
    return renderTemplate('model-patch', variables);
  },
  loadSyntaxGuide(adapterDir: string, name: string): string {
    const guidePath = join(__dirname, '..', 'adapters', adapterDir, 'prompts', `${name}.md`);
    return readMarkdownFile(guidePath);
  },
} as const;
