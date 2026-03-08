export interface ComponentFileMapping {
  componentId: string;
  componentName: string;
  files: string[];
}

export interface FileOwnershipMap {
  thisComponent: ComponentFileMapping | null;
  otherComponents: ComponentFileMapping[];
  unmapped: string[];
}

interface Component {
  id: string;
  name: string;
}

function deriveBaseSegments(component: Component): string[] {
  const bases: string[] = [];

  const idSegment = component.id.split('.').pop();
  if (idSegment) {
    bases.push(idSegment);
  }

  const nameSegment = component.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (nameSegment && !bases.includes(nameSegment)) {
    bases.push(nameSegment);
  }

  return bases;
}

function generateNormalizedVariants(base: string): string[] {
  const underscore = base.replace(/[-\s]+/g, '_');
  const hyphen = base.replace(/[_\s]+/g, '-');
  const collapsed = base.replace(/[-_\s]+/g, '');

  const variants: string[] = [underscore];
  if (!variants.includes(hyphen)) variants.push(hyphen);
  if (!variants.includes(collapsed)) variants.push(collapsed);

  return variants;
}

function buildPrefixMap(allComponents: Component[]): Map<string, Component> {
  const prefixMap = new Map<string, Component>();

  for (const component of allComponents) {
    const bases = deriveBaseSegments(component);
    for (const base of bases) {
      const variants = generateNormalizedVariants(base);
      for (const variant of variants) {
        if (!prefixMap.has(variant)) {
          prefixMap.set(variant, component);
        }
      }
    }
  }

  return prefixMap;
}

function findComponentForFile(
  filename: string,
  prefixMap: Map<string, Component>
): Component | null {
  const segments = filename.split('/');
  for (const segment of segments) {
    const match = prefixMap.get(segment);
    if (match) {
      return match;
    }
  }
  return null;
}

export function mapFilesToComponents(
  files: { filename: string }[],
  allComponents: { id: string; name: string }[],
  selectedComponentId: string
): FileOwnershipMap {
  const prefixMap = buildPrefixMap(allComponents);

  const componentFilesMap = new Map<string, { component: Component; files: string[] }>();
  const unmapped: string[] = [];

  for (const file of files) {
    const component = findComponentForFile(file.filename, prefixMap);
    if (component) {
      const existing = componentFilesMap.get(component.id);
      if (existing) {
        existing.files.push(file.filename);
      } else {
        componentFilesMap.set(component.id, {
          component,
          files: [file.filename],
        });
      }
    } else {
      unmapped.push(file.filename);
    }
  }

  let thisComponent: ComponentFileMapping | null = null;
  const otherComponents: ComponentFileMapping[] = [];

  for (const [id, entry] of componentFilesMap) {
    const mapping: ComponentFileMapping = {
      componentId: id,
      componentName: entry.component.name,
      files: entry.files,
    };
    if (id === selectedComponentId) {
      thisComponent = mapping;
    } else {
      otherComponents.push(mapping);
    }
  }

  return { thisComponent, otherComponents, unmapped };
}
