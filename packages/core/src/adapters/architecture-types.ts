export interface ArchitecturalComponent {
  id: string;
  name: string;
  description?: string;
  repository?: string;
  tags: string[];
  type: string;
  technology?: string;
}

export interface ComponentIndex {
  byRepository: Map<string, ArchitecturalComponent>;
  byId: Map<string, ArchitecturalComponent>;
}

export interface ModelRelationship {
  source: string;
  target: string;
  title?: string;
  kind?: string;
}

export interface ArchitectureModel {
  components: ArchitecturalComponent[];
  relationships: ModelRelationship[];
  componentIndex: ComponentIndex;
}

/** A resolved relationship from a component to its target, with optional metadata. */
export interface ComponentRelationship {
  target: ArchitecturalComponent;
  kind?: string;
  title?: string;
}

/** Lightweight component reference used in prompt data and pipeline context. */
export interface ComponentSummary {
  id: string;
  name: string;
  type: string;
}

export interface SimpleComponent {
  id: string;
  title?: string;
  kind: string;
  links: string[];
  tags: string[];
}
