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

function renderTemplate(templateName: string, variables: object): string {
  return loadTemplate(templateName).replace(/\{\{([^}]+)\}\}/g, (_match: string, path: string) => {
    const value = resolveVariable(variables, path);
    if (value === undefined) {
      const key = path.trim();
      throw new ErodeError(
        `Template "${templateName}" references missing variable "${key}"`,
        ErrorCode.INTERNAL_UNKNOWN,
        `Could not build the "${templateName}" prompt: no value for "${key}". This looks like a programming bug.`,
        { templateName, key }
      );
    }
    return formatValue(value);
  });
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
