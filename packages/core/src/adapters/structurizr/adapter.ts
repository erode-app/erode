import { readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { validate, validatePath } from '../../utils/validation.js';
import { isRepositoryHostUrl, normalizeRepositoryUrl } from '../url-utils.js';
import { AdapterError, ErrorCode } from '../../errors.js';
import { STRUCTURIZR_METADATA } from './metadata.js';
import { exportDslToJson } from './structurizr-cli.js';
import { StructurizrWorkspaceSchema } from '../../schemas/structurizr.schema.js';
import type { ArchitectureModelAdapter } from '../architecture-adapter.js';
import type {
  ArchitecturalComponent,
  ComponentIndex,
  ComponentRelationship,
  ModelRelationship,
  ArchitectureModel,
  SimpleComponent,
} from '../architecture-types.js';
import type { StructurizrWorkspace, StructurizrRelationship } from './structurizr-types.js';
import { resolveElements, type ResolvedElement, type StructurizrElement } from './element-ids.js';

const BUILTIN_TAGS = new Set([
  'Element',
  'Person',
  'Software System',
  'Container',
  'Component',
  'Relationship',
]);

export class StructurizrAdapter implements ArchitectureModelAdapter {
  readonly metadata = STRUCTURIZR_METADATA;
  protected workspace: StructurizrWorkspace | null = null;
  private componentIndex: ComponentIndex | null = null;
  private relationships: ModelRelationship[] | null = null;
  private elements: ResolvedElement[] = [];
  private dslReferences: ReadonlyMap<string, string> = new Map();

  async loadFromPath(dslPath: string): Promise<ArchitectureModel> {
    await this.loadWorkspace(dslPath);
    return this.indexWorkspace();
  }

  async loadAndListComponents(dslPath: string): Promise<SimpleComponent[]> {
    await this.loadWorkspace(dslPath);
    this.setElements(resolveElements(this.workspace?.model));

    return this.elements.map(({ element, id, kind }) => ({
      id,
      title: element.name,
      kind,
      links: element.url ? [element.url] : [],
      tags: this.parseTags(element.tags),
    }));
  }

  /** Element id to the identifier that references it in DSL, for elements that have one. */
  getDslReferences(): ReadonlyMap<string, string> {
    return this.dslReferences;
  }

  /** Replaces the element list and drops everything derived from an earlier load. */
  private setElements(elements: ResolvedElement[]): void {
    this.elements = elements;
    this.componentIndex = null;
    this.relationships = null;
    const references = new Map<string, string>();
    for (const { id, dslReference } of elements) {
      if (dslReference) references.set(id, dslReference);
    }
    this.dslReferences = references;
  }

  protected async parseWorkspace(resolvedPath: string): Promise<unknown> {
    if (resolvedPath.endsWith('.json')) {
      const content = await readFile(resolvedPath, 'utf-8');
      return JSON.parse(content) as unknown;
    }
    return exportDslToJson(resolvedPath);
  }

  protected indexWorkspace(): ArchitectureModel {
    if (!this.workspace) {
      throw AdapterError.notLoaded('structurizr');
    }
    this.setElements(resolveElements(this.workspace.model));
    const components = this.extractComponents();
    this.relationships = this.extractRelationships();
    this.componentIndex = this.buildComponentIndex(components);

    return {
      components,
      relationships: this.relationships,
      componentIndex: this.componentIndex,
    };
  }

  protected extractComponents(): ArchitecturalComponent[] {
    if (!this.workspace) {
      throw AdapterError.notLoaded('structurizr');
    }

    return this.elements.map(({ element, id, kind }) => ({
      id,
      name: element.name ?? id,
      description: element.description,
      repository: this.extractRepositoryUrl(element),
      tags: this.parseTags(element.tags),
      type: kind,
      technology: typeof element.technology === 'string' ? element.technology : undefined,
    }));
  }

  protected extractRelationships(): ModelRelationship[] {
    if (!this.workspace) {
      throw AdapterError.notLoaded('structurizr');
    }

    const idByKey = new Map(this.elements.map((e) => [e.key, e.id]));
    const relationships: ModelRelationship[] = [];
    const seen = new Set<string>();

    const addRelationship = (rel: StructurizrRelationship): void => {
      const source = idByKey.get(rel.sourceId);
      const target = idByKey.get(rel.destinationId);

      if (!source || !target) return;

      const key = `${source}|${target}|${rel.description ?? ''}|${rel.technology ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);

      relationships.push({
        source,
        target,
        title: rel.description,
        kind: rel.technology,
      });
    };

    for (const { element } of this.elements) {
      for (const rel of element.relationships ?? []) {
        addRelationship(rel);
      }
    }
    for (const rel of this.workspace.model?.relationships ?? []) {
      addRelationship(rel);
    }

    return relationships;
  }

  protected buildComponentIndex(components: ArchitecturalComponent[]): ComponentIndex {
    const byRepository = new Map<string, ArchitecturalComponent>();
    const byId = new Map<string, ArchitecturalComponent>();
    for (const component of components) {
      byId.set(component.id, component);
      if (component.repository) {
        byRepository.set(component.repository, component);
      }
    }
    return { byRepository, byId };
  }

  findComponentByRepository(repoUrl: string): ArchitecturalComponent | undefined {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('structurizr');
    }
    const normalizedUrl = normalizeRepositoryUrl(repoUrl);
    return this.componentIndex.byRepository.get(normalizedUrl);
  }

  findAllComponentsByRepository(repoUrl: string): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('structurizr');
    }
    const normalizedUrl = normalizeRepositoryUrl(repoUrl);
    const components: ArchitecturalComponent[] = [];
    for (const component of this.componentIndex.byId.values()) {
      if (component.repository === normalizedUrl) {
        components.push(component);
      }
    }
    return components;
  }

  findComponentById(id: string): ArchitecturalComponent | undefined {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('structurizr');
    }
    return this.componentIndex.byId.get(id);
  }

  getComponentDependencies(componentId: string): ArchitecturalComponent[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('structurizr');
    }
    const dependencies: ArchitecturalComponent[] = [];
    const addedIds = new Set<string>();
    for (const relation of this.relationships) {
      if (relation.source === componentId && !addedIds.has(relation.target)) {
        const targetComponent = this.componentIndex.byId.get(relation.target);
        if (targetComponent) {
          dependencies.push(targetComponent);
          addedIds.add(relation.target);
        }
      }
    }
    return dependencies;
  }

  getComponentDependents(componentId: string): ArchitecturalComponent[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('structurizr');
    }
    const dependents: ArchitecturalComponent[] = [];
    const addedIds = new Set<string>();
    for (const relation of this.relationships) {
      if (relation.target === componentId && !addedIds.has(relation.source)) {
        const sourceComponent = this.componentIndex.byId.get(relation.source);
        if (sourceComponent) {
          dependents.push(sourceComponent);
          addedIds.add(relation.source);
        }
      }
    }
    return dependents;
  }

  getComponentRelationships(componentId: string): ComponentRelationship[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('structurizr');
    }
    const result: ComponentRelationship[] = [];
    for (const relation of this.relationships) {
      if (relation.source === componentId) {
        const targetComponent = this.componentIndex.byId.get(relation.target);
        if (targetComponent) {
          result.push({
            target: targetComponent,
            kind: relation.kind,
            title: relation.title,
          });
        }
      }
    }
    return result;
  }

  getAllComponents(): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('structurizr');
    }
    return Array.from(this.componentIndex.byId.values());
  }

  getAllRelationships(): ModelRelationship[] {
    if (!this.relationships) {
      throw AdapterError.notLoaded('structurizr');
    }
    return this.relationships;
  }

  isAllowedDependency(fromId: string, toId: string): boolean {
    if (!this.relationships) {
      throw AdapterError.notLoaded('structurizr');
    }
    for (const relation of this.relationships) {
      if (relation.source === fromId && relation.target === toId) {
        return true;
      }
    }
    return false;
  }

  private async loadWorkspace(dslPath: string): Promise<void> {
    const resolvedPath = this.resolveWorkspacePath(resolve(dslPath));
    validatePath(resolvedPath, 'file');

    try {
      const rawWorkspace = await this.parseWorkspace(resolvedPath);
      this.workspace = validate(StructurizrWorkspaceSchema, rawWorkspace, 'Structurizr workspace');
    } catch (error) {
      throw AdapterError.fromStructurizrError(error);
    }
  }

  private resolveWorkspacePath(inputPath: string): string {
    try {
      if (!statSync(inputPath).isDirectory()) {
        return inputPath;
      }
    } catch {
      return inputPath;
    }

    const jsonPath = join(inputPath, 'workspace.json');
    if (existsSync(jsonPath)) return jsonPath;

    const dslPath = join(inputPath, 'workspace.dsl');
    if (existsSync(dslPath)) return dslPath;

    throw new AdapterError(
      `No workspace file found in directory: ${inputPath}`,
      ErrorCode.MODEL_LOAD_FAILED,
      'structurizr',
      `No workspace.json or workspace.dsl found in: ${inputPath}`,
      { path: inputPath },
      ['Create a workspace.json or workspace.dsl file in the directory']
    );
  }

  private extractRepositoryUrl(element: StructurizrElement): string | undefined {
    const url = element.url;
    if (!url) return undefined;
    if (!isRepositoryHostUrl(url)) return undefined;
    return normalizeRepositoryUrl(url);
  }

  private parseTags(tags: string | undefined): string[] {
    if (!tags) return [];
    return tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !BUILTIN_TAGS.has(t));
  }
}
