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

export interface SimpleComponent {
  id: string;
  title?: string;
  kind: string;
  links: string[];
  tags: string[];
}
