import { AdapterError, ErrorCode } from '../../errors.js';
import { exportedDslIdentifierPattern } from '../../schemas/common.schema.js';
import type {
  StructurizrWorkspace,
  StructurizrSoftwareSystem,
  StructurizrContainer,
  StructurizrComponent,
  StructurizrPerson,
} from './structurizr-types.js';

export type StructurizrElement =
  StructurizrPerson | StructurizrSoftwareSystem | StructurizrContainer | StructurizrComponent;

type StructurizrElementKind = 'person' | 'softwareSystem' | 'container' | 'component';

export interface ResolvedElement {
  element: StructurizrElement;
  kind: StructurizrElementKind;
  /** Id erode exposes to the pipeline, prompts and users */
  id: string;
  /** Key that relationship `sourceId`/`destinationId` refer to (the JSON id) */
  key: string;
  /** Identifier usable in DSL at model scope, when the element has a stable one */
  dslReference?: string;
  parent?: ResolvedElement;
}

const ERODE_ID_PROPERTY = 'erode.id';
const DSL_IDENTIFIER_PROPERTY = 'structurizr.dsl.identifier';
// The DSL parser registers anonymous elements under a random UUID, which changes on every export
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `structurizr.dsl.identifier` property, if it can be referenced from DSL.
 * Flat mode stores a bare name, hierarchical mode the dotted path; both resolve at model scope.
 */
function readDslReference(element: StructurizrElement): string | undefined {
  const value = element.properties?.[DSL_IDENTIFIER_PROPERTY];
  if (!value) return undefined;
  const segments = value.split('.');
  const stable = segments.every(
    (s) => exportedDslIdentifierPattern.test(s) && !UUID_SEGMENT.test(s)
  );
  return stable ? value : undefined;
}

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function describe(entry: Pick<ResolvedElement, 'element' | 'kind' | 'parent'>): string {
  const name = entry.element.name ?? '(unnamed)';
  const path = entry.parent ? ` in ${describe(entry.parent)}` : '';
  const jsonId = entry.element.id ? ` (JSON id ${entry.element.id})` : '';
  return `${entry.kind} "${name}"${jsonId}${path}`;
}

function fallbackId(
  element: StructurizrElement,
  kind: StructurizrElementKind,
  parent: ResolvedElement | undefined
): string {
  const slug = slugify(element.name ?? '');
  if (!slug) {
    const label = describe({ element, kind, parent });
    throw new AdapterError(
      `Cannot derive an id for ${label}`,
      ErrorCode.MODEL_LOAD_FAILED,
      'structurizr',
      `Cannot derive an id for ${label}: it has no DSL identifier and its name has no letters or digits.`,
      { element: label },
      ['Assign a DSL identifier to the element, or set an "erode.id" property on it']
    );
  }
  return parent ? `${parent.id}.${slug}` : slug;
}

function duplicateIdError(id: string, first: ResolvedElement, second: ResolvedElement) {
  const a = describe(first);
  const b = describe(second);
  return new AdapterError(
    `Duplicate element id "${id}": ${a} and ${b}`,
    ErrorCode.MODEL_LOAD_FAILED,
    'structurizr',
    `Two elements resolve to the same id "${id}": ${a} and ${b}.`,
    { id, first: a, second: b },
    [
      'Give one of the elements a distinct "erode.id" property or DSL identifier',
      'Element ids come from "erode.id", then the DSL identifier, then the element name',
    ]
  );
}

/**
 * Resolves every element's id: `erode.id`, then a stable DSL identifier, then the
 * parent's id plus a slug of the name. Duplicates fail the load instead of being
 * suffixed, since a suffix would depend on declaration order.
 */
export function resolveElements(model: StructurizrWorkspace['model']): ResolvedElement[] {
  const resolved: ResolvedElement[] = [];
  const byId = new Map<string, ResolvedElement>();

  const add = (
    element: StructurizrElement,
    kind: StructurizrElementKind,
    parent?: ResolvedElement
  ): ResolvedElement => {
    const dslReference = readDslReference(element);
    const erodeId = element.properties?.[ERODE_ID_PROPERTY];
    const id =
      (erodeId === '' ? undefined : erodeId) ?? dslReference ?? fallbackId(element, kind, parent);
    const entry: ResolvedElement = {
      element,
      kind,
      id,
      key: element.id ?? id,
      dslReference,
      parent,
    };
    const clash = byId.get(id);
    if (clash) throw duplicateIdError(id, clash, entry);
    byId.set(id, entry);
    resolved.push(entry);
    return entry;
  };

  for (const person of model?.people ?? []) add(person, 'person');
  for (const system of model?.softwareSystems ?? []) {
    const systemEntry = add(system, 'softwareSystem');
    for (const container of system.containers ?? []) {
      const containerEntry = add(container, 'container', systemEntry);
      for (const component of container.components ?? []) {
        add(component, 'component', containerEntry);
      }
    }
  }

  return resolved;
}
