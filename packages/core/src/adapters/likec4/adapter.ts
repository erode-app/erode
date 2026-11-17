import { z } from 'zod';
import { LikeC4 } from 'likec4';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../../utils/config.js';
import { validate } from '../../utils/validation.js';
import { isRepositoryHostUrl, normalizeRepositoryUrl } from '../url-utils.js';
import { ErodeError, AdapterError, ConfigurationError, ErrorCode } from '../../errors.js';
import type {
  ArchitectureModelAdapter,
  ValidationDiagnostic,
  VersionCheckResult,
} from '../architecture-adapter.js';
import { LIKEC4_METADATA } from './metadata.js';
import type {
  ArchitecturalComponent,
  ComponentIndex,
  ComponentRelationship,
  ModelRelationship,
  ArchitectureModel,
  SimpleComponent,
} from '../architecture-types.js';
import { LikeC4ElementSchema, LikeC4RelationshipSchema } from '../../schemas/likec4.schema.js';
import type { LikeC4Element, LikeC4Model } from './likec4-types.js';
import { checkLikeC4Version } from './version-check.js';
import { readLikeC4Warnings } from './validation-warnings.js';
import { richTextToString } from './rich-text.js';

export class LikeC4Adapter implements ArchitectureModelAdapter {
  readonly metadata = LIKEC4_METADATA;
  private model: LikeC4Model | null = null;
  private componentIndex: ComponentIndex | null = null;
  private relationships: ModelRelationship[] | null = null;
  private elementTagsMap = new Map<string, string[]>();
  private outgoing = new Map<string, ModelRelationship[]>();
  private incoming = new Map<string, ModelRelationship[]>();
  private validationBaseline: ValidationDiagnostic[] | undefined;
  private elementSourceFiles = new Map<string, string>();

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

  private throwModelErrors(errors: { message?: string }[], skewWarning?: string): never {
    const messages = errors.map((e) => e.message ?? JSON.stringify(e));
    const hint = skewWarning ? `\n${skewWarning}` : '';
    // The GitHub Action logs `message`, so the hint goes there too
    throw new AdapterError(
      `LikeC4 model contains validation errors: ${messages.join('; ')}${skewWarning ? ` (${skewWarning})` : ''}`,
      ErrorCode.MODEL_LOAD_FAILED,
      'likec4',
      `LikeC4 model has errors:\n${messages.map((m) => `  - ${m}`).join('\n')}${hint}`
    );
  }

  /** Throws when the source repo's likec4 is below the minimum; returns any non-fatal skew warning. */
  private guardVersionCompatibility(likec4Path: string): string | undefined {
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
    return result.warning;
  }

  /**
   * Pick the LikeC4 project to load. A workspace with several projects (folders with their own
   * likec4.config.json) needs an explicit choice; LikeC4 otherwise fails with a terse error.
   */
  private resolveProjectId<T extends string>(available: readonly T[]): T | undefined {
    const configured = CONFIG.adapter.likec4.project;
    const known = [...available].sort().join(', ');
    if (configured) {
      const match = available.find((id) => id === configured);
      if (!match) {
        throw new ConfigurationError(
          `LikeC4 project "${configured}" not found in the workspace. Known projects: ${known}. Set adapter.likec4.project (or ERODE_LIKEC4_PROJECT) to one of them.`,
          'adapter.likec4.project'
        );
      }
      return match;
    }
    if (available.length > 1) {
      throw new ConfigurationError(
        `The LikeC4 workspace contains several projects: ${known}. Set adapter.likec4.project (or ERODE_LIKEC4_PROJECT) to the one erode should load.`,
        'adapter.likec4.project'
      );
    }
    return undefined;
  }

  /** Only errors in the selected project's documents count; other projects may be broken. */
  private assertNoModelErrors(
    likec4: LikeC4,
    projectId: ReturnType<LikeC4['projects']>[number] | undefined,
    skewWarning: string | undefined
  ): void {
    let errors = likec4.getErrors();
    if (projectId) {
      const documents = new Set(
        likec4.languageServices.project(projectId).documents.map((uri) => uri.fsPath)
      );
      errors = errors.filter((e) => documents.has(e.sourceFsPath));
    }
    if (errors.length > 0) this.throwModelErrors(errors, skewWarning);
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

  /** Load the workspace, compute the selected project's model and dispose the workspace after `use`. */
  private async withComputedModel<T>(
    likec4Path: string,
    use: (model: LikeC4Model, likec4: LikeC4, workspace: string, projectId: string | undefined) => T
  ): Promise<T> {
    const resolvedPath = resolve(likec4Path);
    if (!existsSync(resolvedPath)) {
      throw new ErodeError(
        `LikeC4 model path not found: ${resolvedPath}`,
        ErrorCode.IO_DIR_NOT_FOUND,
        `LikeC4 model directory could not be located: ${resolvedPath}`,
        { path: resolvedPath }
      );
    }
    const skewWarning = this.guardVersionCompatibility(resolvedPath);
    this.validationBaseline = undefined;
    const likec4 = await LikeC4.fromWorkspace(resolvedPath, { printErrors: false });
    try {
      const projectId = this.resolveProjectId(likec4.projects());
      this.assertNoModelErrors(likec4, projectId, skewWarning);
      const computedModel = await likec4.computedModel(projectId);
      if (!this.isValidLikeC4Model(computedModel)) {
        throw new AdapterError(
          'Malformed LikeC4 model structure: required methods are absent',
          ErrorCode.MODEL_LOAD_FAILED,
          'likec4',
          'Could not load LikeC4 model: the model structure is invalid. It may be corrupted or incompatible.'
        );
      }
      return use(computedModel, likec4, resolvedPath, projectId);
    } finally {
      await likec4.dispose();
    }
  }

  async loadFromPath(likec4Path: string): Promise<ArchitectureModel> {
    return this.withComputedModel(likec4Path, (computedModel, likec4, workspace, projectId) => {
      this.model = computedModel;
      this.validationBaseline = readLikeC4Warnings(likec4, workspace);
      const components = this.extractComponents();
      this.relationships = this.extractRelationships();
      this.componentIndex = this.buildComponentIndex(components);
      // Language services are gone after dispose, so resolve declaring files now
      this.elementSourceFiles = this.locateElements(likec4, projectId);
      return {
        components,
        relationships: this.relationships,
        componentIndex: this.componentIndex,
      };
    });
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
        description: el.description,
        repository: this.extractRepositoryUrl(el),
        tags: el.tags ?? [],
        type: el.kind,
        technology: el.technology ?? undefined,
      }));
  }

  protected extractRepositoryUrl(element: LikeC4Element): string | undefined {
    const link = element.links?.find((l) => isRepositoryHostUrl(typeof l === 'string' ? l : l.url));
    return link ? normalizeRepositoryUrl(typeof link === 'string' ? link : link.url) : undefined;
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
      .map((rel): ModelRelationship => ({
        source: typeof rel.source === 'string' ? rel.source : rel.source.id,
        target: typeof rel.target === 'string' ? rel.target : rel.target.id,
        title: rel.title ?? undefined,
        kind: rel.kind ?? undefined,
        technology: rel.technology ?? undefined,
        description: richTextToString(rel.description),
        tags: rel.tags?.length ? [...rel.tags] : undefined,
        ...(rel.isBidirectional && { bidirectional: true }),
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
    // LikeC4 models `a <-> b` as one relationship; index its mirror so b -> a is declared too.
    const indexed = result.flatMap((rel) =>
      rel.bidirectional && rel.source !== rel.target
        ? [rel, { ...rel, source: rel.target, target: rel.source }]
        : [rel]
    );
    for (const rel of indexed) {
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
    return components.reduce(
      (idx, comp) => {
        idx.byId.set(comp.id, comp);
        if (comp.repository) idx.byRepository.set(comp.repository, comp);
        return idx;
      },
      { byRepository: new Map(), byId: new Map() }
    );
  }

  /** `projectId` is required by LikeC4 when the workspace has several projects. */
  private locateElements(likec4: LikeC4, projectId: string | undefined): Map<string, string> {
    type LocateParams = Parameters<LikeC4['languageServices']['locate']>[0];
    const files = new Map<string, string>();
    for (const id of this.elementTagsMap.keys()) {
      try {
        const uri = likec4.languageServices.locate({ element: id, projectId } as LocateParams)?.uri;
        if (uri?.startsWith('file:')) files.set(id, fileURLToPath(uri));
      } catch {
        // Unlocatable element (e.g. ambiguous project): the patcher falls back to its heuristic
      }
    }
    return files;
  }

  getElementSourceFiles(): ReadonlyMap<string, string> {
    return this.elementSourceFiles;
  }

  findComponentByRepository(repoUrl: string): ArchitecturalComponent | undefined {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
    }
    const normalizedUrl = normalizeRepositoryUrl(repoUrl);
    return this.componentIndex.byRepository.get(normalizedUrl);
  }

  findAllComponentsByRepository(repoUrl: string): ArchitecturalComponent[] {
    if (!this.componentIndex) {
      throw AdapterError.notLoaded('likec4');
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

  async loadAndListComponents(likec4Path: string): Promise<SimpleComponent[]> {
    return this.withComputedModel(likec4Path, (model) => {
      const components: SimpleComponent[] = [];
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
    });
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

  getComponentRelationships(componentId: string): ComponentRelationship[] {
    if (!this.componentIndex || !this.relationships) {
      throw AdapterError.notLoaded('likec4');
    }
    const index = this.componentIndex;
    return (this.outgoing.get(componentId) ?? []).flatMap((rel) => {
      const target = index.byId.get(rel.target);
      if (!target) return [];
      const entry: ComponentRelationship = { target };
      if (rel.kind) entry.kind = rel.kind;
      if (rel.title) entry.title = rel.title;
      if (rel.technology) entry.technology = rel.technology;
      if (rel.description) entry.description = rel.description;
      if (rel.tags) entry.tags = [...rel.tags];
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

  getValidationBaseline(): readonly ValidationDiagnostic[] | undefined {
    return this.validationBaseline;
  }

  checkVersion(path: string): VersionCheckResult {
    return checkLikeC4Version(path);
  }
}
