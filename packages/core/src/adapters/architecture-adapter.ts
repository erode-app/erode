import type {
  ArchitectureModel,
  ArchitecturalComponent,
  ComponentRelationship,
  ModelRelationship,
  SimpleComponent,
} from './architecture-types.js';
import type { AdapterMetadata } from './adapter-metadata.js';

export interface VersionCheckResult {
  found: boolean;
  version?: string;
  compatible?: boolean;
  minimum: string;
  /** Version of the model tooling bundled with erode, when known. */
  bundled?: string;
  /** Non-fatal compatibility warning, e.g. the model targets a newer version than erode bundles. */
  warning?: string;
}

/** A model validation diagnostic, keyed for comparison across workspace copies. */
export interface ValidationDiagnostic {
  /** Path relative to the model workspace, with `/` separators, when known */
  file?: string;
  message: string;
}

/** Adapter interface for loading and querying an architecture model. */
export interface ArchitectureModelAdapter {
  /** Format-specific display info */
  readonly metadata: AdapterMetadata;

  /** Load the architecture model from a file path. */
  loadFromPath(path: string): Promise<ArchitectureModel>;

  /** Load and list all components as simplified objects. */
  loadAndListComponents(path: string): Promise<SimpleComponent[]>;

  /** Find a component by its repository URL. */
  findComponentByRepository(repoUrl: string): ArchitecturalComponent | undefined;

  /** Find all components associated with a repository URL. */
  findAllComponentsByRepository(repoUrl: string): ArchitecturalComponent[];

  /** Find a component by its unique identifier. */
  findComponentById(id: string): ArchitecturalComponent | undefined;

  /** Get all components that this component depends on. */
  getComponentDependencies(componentId: string): ArchitecturalComponent[];

  /** Get all components that depend on this component. */
  getComponentDependents(componentId: string): ArchitecturalComponent[];

  /** Get relationships from a component with kind and title metadata. */
  getComponentRelationships(componentId: string): ComponentRelationship[];

  /** Get all components in the loaded model. */
  getAllComponents(): ArchitecturalComponent[];

  /** Get all relationships in the loaded model. */
  getAllRelationships(): ModelRelationship[];

  /** Check whether a dependency from one component to another is declared in the model. */
  isAllowedDependency(fromId: string, toId: string): boolean;

  /** Optional: check version compatibility for the model format. */
  checkVersion?(path: string): VersionCheckResult;

  /**
   * Optional: validation warnings present in the model as loaded, so patch validation
   * can report only the warnings a patch introduces. Undefined when not captured.
   */
  getValidationBaseline?(): readonly ValidationDiagnostic[] | undefined;
}
