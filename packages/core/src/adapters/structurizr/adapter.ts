import { readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { validate, validatePath } from '../../utils/validation.js';
import { normalizeGitHubUrl, isGitHubUrl } from '../url-utils.js';
import { AdapterError, ErrorCode } from '../../errors.js';
import { STRUCTURIZR_METADATA } from './metadata.js';
import { exportDslToJson } from './structurizr-cli.js';
import { StructurizrWorkspaceSchema } from '../../schemas/structurizr.schema.js';
import type { ArchitectureModelAdapter } from '../architecture-adapter.js';
import type {
  ArchitecturalComponent,
  ComponentIndex,
  ModelRelationship,
  ArchitectureModel,
  SimpleComponent,
} from '../architecture-types.js';
import type {
  StructurizrWorkspace,
  StructurizrSoftwareSystem,
  StructurizrContainer,
  StructurizrComponent,
  StructurizrPerson,
  StructurizrRelationship,
} from './structurizr-types.js';

type StructurizrElement =
  | StructurizrPerson
  | StructurizrSoftwareSystem
  | StructurizrContainer
  | StructurizrComponent;

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
  private identifierMap = new Map<string, string>();

  async loadFromPath(dslPath: string): Promise<ArchitectureModel> {
    const resolvedPath = this.resolveWorkspacePath(resolve(dslPath));
    validatePath(resolvedPath, 'file');

    try {
      const rawWorkspace = await this.parseWorkspace(resolvedPath);
      this.workspace = validate(StructurizrWorkspaceSchema, rawWorkspace, 'Structurizr workspace');
    } catch (error) {
      throw AdapterError.fromStructurizrError(error);
    }

    this.identifierMap = this.buildIdentifierMap();
    const components = this.extractComponents();
    this.relationships = this.extractRelationships();
    this.componentIndex = this.buildComponentIndex(components);

    return {
      components,
      relationships: this.relationships,
      componentIndex: this.componentIndex,
    };
  }

  async loadAndListComponents(dslPath: string): Promise<SimpleComponent[]> {
    const resolvedPath = this.resolveWorkspacePath(resolve(dslPath));
    validatePath(resolvedPath, 'file');

    try {
      const rawWorkspace = await this.parseWorkspace(resolvedPath);
      this.workspace = validate(StructurizrWorkspaceSchema, rawWorkspace, 'Structurizr workspace');
    } catch (error) {
      throw AdapterError.fromStructurizrError(error);
    }

    this.identifierMap = this.buildIdentifierMap();
    const components: SimpleComponent[] = [];

    this.walkElements((element, parentPath) => {
      const localId = element.id ?? this.toSnakeCase(element.name ?? '');
      const resolvedId = this.resolveElementId(element, localId, parentPath);
      const url = element.url;
      const links = url ? [url] : [];

      components.push({
        id: resolvedId,
        title: element.name,
        kind: this.getElementType(element, parentPath),
        links,
        tags: this.parseTags(element.tags),
      });
    });

    return components;
  }

  protected async parseWorkspace(resolvedPath: string): Promise<unknown> {
    if (resolvedPath.endsWith('.json')) {
      const content = await readFile(resolvedPath, 'utf-8');
      return JSON.parse(content) as unknown;
    }
    return exportDslToJson(resolvedPath);
  }

  protected extractComponents(): ArchitecturalComponent[] {
    if (!this.workspace) {
      throw AdapterError.notLoaded('structurizr');
    }

    const components: ArchitecturalComponent[] = [];

    this.walkElements((element, parentPath) => {
      const localId = element.id ?? this.toSnakeCase(element.name ?? '');
      const resolvedId = this.resolveElementId(element, localId, parentPath);
      const tags = this.parseTags(element.tags);
      const repository = this.extractRepositoryUrl(element);
      const type = this.getElementType(element, parentPath);

      components.push({
        id: resolvedId,
        name: element.name ?? localId,
        description: element.description,
        repository,
        tags,
        type,
        technology: typeof element.technology === 'string' ? element.technology : undefined,
      });
    });

    return components;
  }

  protected extractRelationships(): ModelRelationship[] {
    if (!this.workspace) {
      throw AdapterError.notLoaded('structurizr');
    }

    const relationships: ModelRelationship[] = [];
    const seen = new Set<string>();

    const addRelationship = (rel: StructurizrRelationship): void => {
      const source = this.resolveIdentifier(rel.sourceId);
      const target = this.resolveIdentifier(rel.destinationId);

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

    // Collect from all elements
    this.walkElements((element) => {
      if (element.relationships) {
        for (const rel of element.relationships) {
          addRelationship(rel);
        }
      }
    });

    // Collect model-level relationships
    const modelRels = this.workspace.model?.relationships;
    if (modelRels) {
      for (const rel of modelRels) {
        addRelationship(rel);
      }
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
    const normalizedUrl = normalizeGitHubUrl(repoUrl);
    return this.componentIndex.byRepository.get(normalizedUrl);
  }

  findAllComponentsByRepository(repoUrl: string): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('structurizr');
    }
    const normalizedUrl = normalizeGitHubUrl(repoUrl);
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

  getComponentRelationships(
    componentId: string
  ): { target: ArchitecturalComponent; kind?: string; title?: string }[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('structurizr');
    }
    const result: { target: ArchitecturalComponent; kind?: string; title?: string }[] = [];
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

  // --- Private helpers ---

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

  private buildIdentifierMap(): Map<string, string> {
    const map = new Map<string, string>();

    this.walkElements((element, parentPath) => {
      const localId = element.id ?? this.toSnakeCase(element.name ?? '');
      const resolvedId = this.resolveElementId(element, localId, parentPath);

      // Map local identifier to resolved ID
      map.set(localId, resolvedId);

      // Map full dotted path to resolved ID
      const dottedPath = parentPath ? `${parentPath}.${localId}` : localId;
      if (dottedPath !== localId) {
        map.set(dottedPath, resolvedId);
      }
    });

    return map;
  }

  private walkElements(callback: (element: StructurizrElement, parentPath: string) => void): void {
    if (!this.workspace?.model) return;

    const walk = (elements: StructurizrElement[] | undefined, parentPath: string): void => {
      if (!elements) return;
      for (const element of elements) {
        const localId = element.id ?? this.toSnakeCase(element.name ?? '');
        const resolvedId = this.resolveElementId(element, localId, parentPath);
        callback(element, parentPath);

        // Walk children
        const sys = element as StructurizrSoftwareSystem;
        if (sys.containers) walk(sys.containers, resolvedId);
        const container = element as StructurizrContainer;
        if (container.components) walk(container.components, resolvedId);
      }
    };

    walk(this.workspace.model.people, '');
    walk(this.workspace.model.softwareSystems, '');
  }

  private resolveElementId(
    element: StructurizrElement,
    localId: string,
    parentPath: string
  ): string {
    // Priority 1: erode.id property
    if (element.properties?.['erode.id']) {
      return element.properties['erode.id'];
    }

    // Priority 2: DSL identifier (already in localId)
    // Priority 3: snake_case fallback (already in localId from toSnakeCase)
    return parentPath ? `${parentPath}.${localId}` : localId;
  }

  private resolveIdentifier(ref: string): string | undefined {
    // Try direct lookup
    const resolved = this.identifierMap.get(ref);
    if (resolved) return resolved;

    // Try as-is (might already be a resolved ID)
    for (const value of this.identifierMap.values()) {
      if (value === ref) return ref;
    }

    return undefined;
  }

  private extractRepositoryUrl(element: StructurizrElement): string | undefined {
    const url = element.url;
    if (!url) return undefined;
    if (!isGitHubUrl(url)) return undefined;
    return normalizeGitHubUrl(url);
  }

  private parseTags(tags: string | undefined): string[] {
    if (!tags) return [];
    return tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !BUILTIN_TAGS.has(t));
  }

  private getElementType(element: StructurizrElement, parentPath: string): string {
    // Infer from position in hierarchy or explicit type from parser
    const sys = element as StructurizrSoftwareSystem;
    if (sys.containers) return 'softwareSystem';
    const container = element as StructurizrContainer;
    if (container.components) return 'container';

    // Check if this is a person
    if (
      this.workspace?.model?.people?.some((p) => p.id === element.id && p.name === element.name)
    ) {
      return 'person';
    }

    // Infer from nesting depth
    if (!parentPath) return 'softwareSystem';
    if (parentPath.split('.').length === 1) return 'container';
    return 'component';
  }

  private toSnakeCase(name: string): string {
    return name
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }
}
