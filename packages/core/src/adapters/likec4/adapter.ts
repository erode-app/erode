import { z } from 'zod';
import { LikeC4 } from 'likec4';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { CONFIG } from '../../utils/config.js';
import { validate } from '../../utils/validation.js';
import { ErodeError, AdapterError, ErrorCode } from '../../errors.js';
import type { ArchitectureModelAdapter, VersionCheckResult } from '../architecture-adapter.js';
import { LIKEC4_METADATA } from './metadata.js';
import type {
  ArchitecturalComponent,
  ComponentIndex,
  ModelRelationship,
  ArchitectureModel,
  SimpleComponent,
} from '../architecture-types.js';
import { LikeC4ElementSchema, LikeC4RelationshipSchema } from '../../schemas/likec4.schema.js';
import type { LikeC4Element, LikeC4Model } from './likec4-types.js';
import { checkLikeC4Version } from './version-check.js';

export class LikeC4Adapter implements ArchitectureModelAdapter {
  readonly metadata = LIKEC4_METADATA;
  private model: LikeC4Model | null = null;
  private componentIndex: ComponentIndex | null = null;
  private relationships: ModelRelationship[] | null = null;
  private elementTagsMap = new Map<string, string[]>();

  private isExcluded(options: { componentId: string; componentTags?: readonly string[] }): boolean {
    const { componentId, componentTags } = options;
    const { excludePaths, excludeTags } = CONFIG.adapter.likec4;

    if (excludePaths.length > 0) {
      const matchesPath = excludePaths.some((excludePath) => componentId.startsWith(excludePath));
      if (matchesPath) {
        return true;
      }
    }

    if (excludeTags.length > 0) {
      if (componentTags && componentTags.length > 0) {
        const matchesTag = componentTags.some((tag) => excludeTags.includes(tag));
        if (matchesTag) {
          return true;
        }
      }

      const parts = componentId.split('.');
      for (let i = parts.length - 1; i > 0; i--) {
        const parentId = parts.slice(0, i).join('.');
        const parentTags = this.elementTagsMap.get(parentId);
        if (parentTags && parentTags.length > 0) {
          const parentMatchesTag = parentTags.some((tag) => excludeTags.includes(tag));
          if (parentMatchesTag) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private guardVersionCompatibility(likec4Path: string): void {
    const result = checkLikeC4Version(likec4Path);
    if (result.found && !result.compatible) {
      throw new AdapterError(
        `Source repo LikeC4 version ${result.version ?? 'unknown'} does not meet minimum ${result.minimum}`,
        ErrorCode.MODEL_LOAD_ERROR,
        'likec4',
        `Incompatible LikeC4 version: source repo has ${result.version ?? 'unknown'}, but erode needs >=${result.minimum}. Upgrade the likec4 dependency in the source repo.`,
        { detectedVersion: result.version, minimumVersion: result.minimum }
      );
    }
  }

  private isValidLikeC4Model(model: unknown): model is LikeC4Model {
    return (
      typeof model === 'object' &&
      model !== null &&
      'elements' in model &&
      typeof model.elements === 'function' &&
      'relationships' in model &&
      typeof model.relationships === 'function'
    );
  }

  async loadFromPath(likec4Path: string): Promise<ArchitectureModel> {
    const resolvedPath = resolve(likec4Path);
    if (!existsSync(resolvedPath)) {
      throw new ErodeError(
        `LikeC4 model path not found: ${resolvedPath}`,
        ErrorCode.DIRECTORY_NOT_FOUND,
        `LikeC4 model directory could not be located: ${resolvedPath}`,
        { path: resolvedPath }
      );
    }
    this.guardVersionCompatibility(resolvedPath);
    const likec4 = await LikeC4.fromWorkspace(resolvedPath, { printErrors: false });
    try {
      if (likec4.hasErrors()) {
        const errors = likec4.getErrors();
        const messages = errors.map((e: { message?: string }) => e.message ?? JSON.stringify(e));
        throw new AdapterError(
          `LikeC4 model contains validation errors: ${messages.join('; ')}`,
          ErrorCode.MODEL_LOAD_ERROR,
          'likec4',
          `LikeC4 model has errors:\n${messages.map((m: string) => `  - ${m}`).join('\n')}`
        );
      }
      const computedModel = await likec4.computedModel();
      if (!this.isValidLikeC4Model(computedModel)) {
        throw new AdapterError(
          'Malformed LikeC4 model structure: required methods are absent',
          ErrorCode.MODEL_LOAD_ERROR,
          'likec4',
          'Could not load LikeC4 model: the model structure is invalid. It may be corrupted or incompatible.'
        );
      }
      this.model = computedModel;
      const components = this.extractComponents();
      this.relationships = this.extractRelationships();
      this.componentIndex = this.buildComponentIndex(components);
      return {
        components,
        relationships: this.relationships,
        componentIndex: this.componentIndex,
      };
    } finally {
      await likec4.dispose();
    }
  }

  protected extractComponents(): ArchitecturalComponent[] {
    if (!this.model) {
      throw AdapterError.notLoaded('likec4');
    }
    const components: ArchitecturalComponent[] = [];
    const rawElements = [...this.model.elements()];
    const elements = validate(z.array(LikeC4ElementSchema), rawElements, 'LikeC4 elements');
    for (const element of elements) {
      this.elementTagsMap.set(element.id, element.tags ?? []);

      if (this.isExcluded({ componentId: element.id, componentTags: element.tags ?? undefined })) {
        continue;
      }
      const component: ArchitecturalComponent = {
        id: element.id,
        name: element.title ?? element.id,
        description: typeof element.description === 'string' ? element.description : undefined,
        repository: this.extractRepositoryUrl(element),
        tags: element.tags ?? [],
        type: element.kind,
        technology: element.technology ?? undefined,
      };
      components.push(component);
    }
    return components;
  }

  protected extractRepositoryUrl(element: LikeC4Element): string | undefined {
    if (!element.links || element.links.length === 0) {
      return undefined;
    }
    const githubLink = element.links.find((link) => {
      if (typeof link === 'string') {
        return link.includes('github.com');
      }
      return link.url.includes('github.com');
    });
    if (githubLink) {
      const url = typeof githubLink === 'string' ? githubLink : githubLink.url;
      return this.normalizeGitHubUrl(url);
    }
    return undefined;
  }

  private normalizeGitHubUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
        const owner = pathParts[0].toLowerCase();
        const repo = pathParts[1].replace('.git', '').toLowerCase();
        return `https://github.com/${owner}/${repo}`;
      }
      return url;
    } catch {
      return url;
    }
  }

  protected extractRelationships(): ModelRelationship[] {
    if (!this.model) {
      throw AdapterError.notLoaded('likec4');
    }
    const rawRelationships = [...this.model.relationships()];
    const relationships = validate(
      z.array(LikeC4RelationshipSchema),
      rawRelationships,
      'LikeC4 relationships'
    );
    const relationshipArray: ModelRelationship[] = [];
    for (const rel of relationships) {
      const sourceId = typeof rel.source === 'string' ? rel.source : rel.source.id;
      const targetId = typeof rel.target === 'string' ? rel.target : rel.target.id;

      const sourceTags = this.elementTagsMap.get(sourceId);
      const targetTags = this.elementTagsMap.get(targetId);
      if (
        this.isExcluded({ componentId: sourceId, componentTags: sourceTags }) ||
        this.isExcluded({ componentId: targetId, componentTags: targetTags })
      ) {
        continue;
      }

      const relationship: ModelRelationship = {
        source: sourceId,
        target: targetId,
        title: rel.title ?? undefined,
        kind: rel.kind ?? undefined,
      };
      relationshipArray.push(relationship);
    }
    return relationshipArray;
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
      throw AdapterError.notLoaded('likec4');
    }
    const normalizedUrl = this.normalizeGitHubUrl(repoUrl);
    return this.componentIndex.byRepository.get(normalizedUrl);
  }

  findAllComponentsByRepository(repoUrl: string): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
    }
    const normalizedUrl = this.normalizeGitHubUrl(repoUrl);
    const components: ArchitecturalComponent[] = [];

    for (const component of this.componentIndex.byId.values()) {
      if (component.repository === normalizedUrl) {
        components.push(component);
      }
    }

    return components;
  }

  async loadAndListComponents(likec4Path: string): Promise<SimpleComponent[]> {
    const resolvedPath = resolve(likec4Path);
    if (!existsSync(resolvedPath)) {
      throw new ErodeError(
        `LikeC4 model path not found: ${resolvedPath}`,
        ErrorCode.DIRECTORY_NOT_FOUND,
        `LikeC4 model directory could not be located: ${resolvedPath}`,
        { path: resolvedPath }
      );
    }
    this.guardVersionCompatibility(resolvedPath);
    const likec4 = await LikeC4.fromWorkspace(resolvedPath, { printErrors: false });
    try {
      if (likec4.hasErrors()) {
        const errors = likec4.getErrors();
        const messages = errors.map((e: { message?: string }) => e.message ?? JSON.stringify(e));
        throw new AdapterError(
          `LikeC4 model contains validation errors: ${messages.join('; ')}`,
          ErrorCode.MODEL_LOAD_ERROR,
          'likec4',
          `LikeC4 model has errors:\n${messages.map((m: string) => `  - ${m}`).join('\n')}`
        );
      }
      const computedModel = await likec4.computedModel();
      if (!this.isValidLikeC4Model(computedModel)) {
        throw new AdapterError(
          'Malformed LikeC4 model structure: required methods are absent',
          ErrorCode.MODEL_LOAD_ERROR,
          'likec4',
          'Could not load LikeC4 model: the model structure is invalid. It may be corrupted or incompatible.'
        );
      }
      const components: SimpleComponent[] = [];
      const model = computedModel as LikeC4Model;
      const rawElements = [...model.elements()];
      const validatedElements = validate(
        z.array(LikeC4ElementSchema),
        rawElements,
        'LikeC4 elements'
      );
      for (const element of validatedElements) {
        if (
          this.isExcluded({ componentId: element.id, componentTags: element.tags ?? undefined })
        ) {
          continue;
        }
        const component: SimpleComponent = {
          id: element.id,
          title: element.title ?? undefined,
          kind: element.kind,
          links: this.extractLinks([...(element.links ?? [])]),
          tags: [...(element.tags ?? [])],
        };
        components.push(component);
      }
      return components;
    } finally {
      await likec4.dispose();
    }
  }

  private extractLinks(links: (string | { url?: string; toString(): string })[]): string[] {
    return links
      .map((link) => {
        if (typeof link === 'string') {
          return link;
        }
        return link.url ?? link.toString();
      })
      .filter(Boolean);
  }

  findComponentById(id: string): ArchitecturalComponent | undefined {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
    }
    return this.componentIndex.byId.get(id);
  }

  isAllowedDependency(fromId: string, toId: string): boolean {
    if (!this.relationships) {
      throw AdapterError.notLoaded('likec4');
    }
    for (const relation of this.relationships) {
      if (relation.source === fromId && relation.target === toId) {
        return true;
      }
    }
    return false;
  }

  getComponentDependencies(componentId: string): ArchitecturalComponent[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
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

  getComponentRelationships(
    componentId: string
  ): { target: ArchitecturalComponent; kind?: string; title?: string }[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
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

  getComponentDependents(componentId: string): ArchitecturalComponent[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
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

  getAllComponents(): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
    }
    return Array.from(this.componentIndex.byId.values());
  }

  checkVersion(path: string): VersionCheckResult {
    return checkLikeC4Version(path);
  }
}
