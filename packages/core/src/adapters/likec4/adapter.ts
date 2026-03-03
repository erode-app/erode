import { z } from 'zod';
import { LikeC4 } from 'likec4';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { CONFIG } from '../../utils/config.js';
import { validate } from '../../utils/validation.js';
import { normalizeGitHubUrl } from '../url-utils.js';
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
  private outgoing = new Map<string, ModelRelationship[]>();
  private incoming = new Map<string, ModelRelationship[]>();

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
        ErrorCode.MODEL_LOAD_FAILED,
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
        ErrorCode.IO_DIR_NOT_FOUND,
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
          ErrorCode.MODEL_LOAD_FAILED,
          'likec4',
          `LikeC4 model has errors:\n${messages.map((m: string) => `  - ${m}`).join('\n')}`
        );
      }
      const computedModel = await likec4.computedModel();
      if (!this.isValidLikeC4Model(computedModel)) {
        throw new AdapterError(
          'Malformed LikeC4 model structure: required methods are absent',
          ErrorCode.MODEL_LOAD_FAILED,
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
    if (!this.model) throw AdapterError.notLoaded('likec4');
    const rawElements = [...this.model.elements()];
    const elements = validate(z.array(LikeC4ElementSchema), rawElements, 'LikeC4 elements');
    // First pass: build tags map for all elements
    elements.forEach((el) => this.elementTagsMap.set(el.id, el.tags ?? []));
    // Second pass: filter and map
    return elements
      .filter((el) => !this.isExcluded({ componentId: el.id, componentTags: el.tags ?? undefined }))
      .map((el) => ({
        id: el.id,
        name: el.title ?? el.id,
        description: typeof el.description === 'string' ? el.description : undefined,
        repository: this.extractRepositoryUrl(el),
        tags: el.tags ?? [],
        type: el.kind,
        technology: el.technology ?? undefined,
      }));
  }

  protected extractRepositoryUrl(element: LikeC4Element): string | undefined {
    const link = element.links?.find((l) =>
      (typeof l === 'string' ? l : l.url).includes('github.com')
    );
    return link ? normalizeGitHubUrl(typeof link === 'string' ? link : link.url) : undefined;
  }

  protected extractRelationships(): ModelRelationship[] {
    if (!this.model) throw AdapterError.notLoaded('likec4');
    const rawRelationships = [...this.model.relationships()];
    const relationships = validate(
      z.array(LikeC4RelationshipSchema),
      rawRelationships,
      'LikeC4 relationships'
    );

    const result = relationships
      .map((rel) => ({
        source: typeof rel.source === 'string' ? rel.source : rel.source.id,
        target: typeof rel.target === 'string' ? rel.target : rel.target.id,
        title: rel.title ?? undefined,
        kind: rel.kind ?? undefined,
      }))
      .filter(
        (rel) =>
          !this.isExcluded({
            componentId: rel.source,
            componentTags: this.elementTagsMap.get(rel.source),
          }) &&
          !this.isExcluded({
            componentId: rel.target,
            componentTags: this.elementTagsMap.get(rel.target),
          })
      );

    // Build adjacency maps for O(1) lookups
    this.outgoing.clear();
    this.incoming.clear();
    for (const rel of result) {
      const out = this.outgoing.get(rel.source) ?? [];
      out.push(rel);
      this.outgoing.set(rel.source, out);

      const inc = this.incoming.get(rel.target) ?? [];
      inc.push(rel);
      this.incoming.set(rel.target, inc);
    }

    return result;
  }

  protected buildComponentIndex(components: ArchitecturalComponent[]): ComponentIndex {
    return components.reduce<ComponentIndex>(
      (idx, comp) => {
        idx.byId.set(comp.id, comp);
        if (comp.repository) idx.byRepository.set(comp.repository, comp);
        return idx;
      },
      { byRepository: new Map(), byId: new Map() }
    );
  }

  findComponentByRepository(repoUrl: string): ArchitecturalComponent | undefined {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
    }
    const normalizedUrl = normalizeGitHubUrl(repoUrl);
    return this.componentIndex.byRepository.get(normalizedUrl);
  }

  findAllComponentsByRepository(repoUrl: string): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
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

  async loadAndListComponents(likec4Path: string): Promise<SimpleComponent[]> {
    const resolvedPath = resolve(likec4Path);
    if (!existsSync(resolvedPath)) {
      throw new ErodeError(
        `LikeC4 model path not found: ${resolvedPath}`,
        ErrorCode.IO_DIR_NOT_FOUND,
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
          ErrorCode.MODEL_LOAD_FAILED,
          'likec4',
          `LikeC4 model has errors:\n${messages.map((m: string) => `  - ${m}`).join('\n')}`
        );
      }
      const computedModel = await likec4.computedModel();
      if (!this.isValidLikeC4Model(computedModel)) {
        throw new AdapterError(
          'Malformed LikeC4 model structure: required methods are absent',
          ErrorCode.MODEL_LOAD_FAILED,
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
      .map((link) => (typeof link === 'string' ? link : (link.url ?? link.toString())))
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
    return (this.outgoing.get(fromId) ?? []).some((rel) => rel.target === toId);
  }

  getComponentDependencies(componentId: string): ArchitecturalComponent[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
    }
    const index = this.componentIndex;
    const seen = new Set<string>();
    return (this.outgoing.get(componentId) ?? [])
      .filter((rel) => {
        if (seen.has(rel.target)) return false;
        seen.add(rel.target);
        return true;
      })
      .map((rel) => index.byId.get(rel.target))
      .filter((comp): comp is ArchitecturalComponent => comp != null);
  }

  getComponentRelationships(
    componentId: string
  ): { target: ArchitecturalComponent; kind?: string; title?: string }[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
    }
    const index = this.componentIndex;
    return (this.outgoing.get(componentId) ?? []).flatMap((rel) => {
      const target = index.byId.get(rel.target);
      if (!target) return [];
      const entry: { target: ArchitecturalComponent; kind?: string; title?: string } = { target };
      if (rel.kind) entry.kind = rel.kind;
      if (rel.title) entry.title = rel.title;
      return [entry];
    });
  }

  getComponentDependents(componentId: string): ArchitecturalComponent[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
    }
    const index = this.componentIndex;
    const seen = new Set<string>();
    return (this.incoming.get(componentId) ?? [])
      .filter((rel) => {
        if (seen.has(rel.source)) return false;
        seen.add(rel.source);
        return true;
      })
      .map((rel) => index.byId.get(rel.source))
      .filter((comp): comp is ArchitecturalComponent => comp != null);
  }

  getAllComponents(): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
    }
    return Array.from(this.componentIndex.byId.values());
  }

  getAllRelationships(): ModelRelationship[] {
    if (!this.relationships) {
      throw AdapterError.notLoaded('likec4');
    }
    return this.relationships;
  }

  checkVersion(path: string): VersionCheckResult {
    return checkLikeC4Version(path);
  }
}
