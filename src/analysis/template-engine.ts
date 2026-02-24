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
/**
 * Simple template engine for replacing {{variable}} placeholders in markdown templates
 */
export class TemplateEngine {
  /**
   * Load a prompt template from the prompts directory
   */
  private static loadTemplate(templateName: string): string {
    const templatePath = join(__dirname, 'prompts', `${templateName}.md`);
    return readFileSync(templatePath, 'utf-8');
  }
  private static loadAdapterTemplate(adapterName: string, templateName: string): string {
    const templatePath = join(
      __dirname,
      '..',
      'adapters',
      adapterName,
      'prompts',
      `${templateName}.md`,
    );
    return readFileSync(templatePath, 'utf-8');
  }
  /**
   * Replace template variables with actual values
   * Supports nested objects using dot notation (e.g., {{component.name}})
   */
  private static replaceVariables(template: string, variables: Record<string, unknown>): string {
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
        // Arrays → comma-separated for template readability
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        // Objects → JSON for structured data in prompts
        return JSON.stringify(value);
      }
      // Primitives → direct string conversion
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      // Unsupported types (Symbol, Function) → empty string
      return '';
    });
  }
  /**
   * Load and process the dependency extraction prompt template
   */
  static loadDependencyExtractionPrompt(variables: DependencyExtractionPromptVars): string {
    const template = this.loadTemplate('dependency-extraction');
    return this.replaceVariables(template, variables as unknown as Record<string, unknown>);
  }
  /**
   * Load and process the drift analysis prompt template
   */
  static loadDriftAnalysisPrompt(variables: DriftAnalysisPromptVars): string {
    const template = this.loadTemplate('drift-analysis');
    return this.replaceVariables(template, variables as unknown as Record<string, unknown>);
  }
  /**
   * Load and process the model generation prompt template for the given adapter format
   */
  static loadModelGenerationPrompt(
    variables: ModelGenerationPromptVars,
    adapterFormat = 'likec4'
  ): string {
    const template = this.loadAdapterTemplate(adapterFormat, 'model-generation');
    return this.replaceVariables(template, variables as unknown as Record<string, unknown>);
  }
  /**
   * Load and process the component selection prompt template
   */
  static loadComponentSelectionPrompt(variables: ComponentSelectionPromptVars): string {
    const template = this.loadTemplate('component-selection');
    return this.replaceVariables(template, variables as unknown as Record<string, unknown>);
  }
}
