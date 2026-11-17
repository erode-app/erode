import { describe, it, expect, beforeEach } from 'vitest';
import type { StructurizrWorkspace } from '../structurizr-types.js';
import { TestStructurizrAdapter } from './adapter.test.js';
import { dslElement } from './fixtures/mock-workspace.js';

describe('StructurizrAdapter - Built-in tag filtering', () => {
  let adapter: TestStructurizrAdapter;

  beforeEach(() => {
    adapter = new TestStructurizrAdapter();
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [
          {
            ...dslElement('svc'),
            name: 'My Service',
            // Built-in Structurizr tags that should be filtered out
            tags: 'Element,Software System,myCustomTag',
          },
        ],
        people: [
          {
            ...dslElement('usr'),
            name: 'User',
            tags: 'Element,Person,externalUser',
          },
        ],
      },
    };
    adapter.setMockWorkspace(workspace);
  });

  it('should filter out "Element" and "Software System" built-in tags', () => {
    const svc = adapter.findComponentById('svc');

    expect(svc?.tags).not.toContain('Element');
    expect(svc?.tags).not.toContain('Software System');
    expect(svc?.tags).toContain('myCustomTag');
  });

  it('should filter out "Person" built-in tag', () => {
    const user = adapter.findComponentById('usr');

    expect(user?.tags).not.toContain('Element');
    expect(user?.tags).not.toContain('Person');
    expect(user?.tags).toContain('externalUser');
  });

  it('should filter Container and Component built-in tags', () => {
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [
          {
            ...dslElement('sys'),
            name: 'System',
            tags: 'Element,Software System',
            containers: [
              {
                ...dslElement('sys.ctr'),
                name: 'Container',
                tags: 'Element,Container,myContainerTag',
                components: [
                  {
                    ...dslElement('sys.ctr.cmp'),
                    name: 'Component',
                    tags: 'Element,Component,myComponentTag',
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    adapter.setMockWorkspace(workspace);

    const ctr = adapter.findComponentById('sys.ctr');
    expect(ctr?.tags).not.toContain('Container');
    expect(ctr?.tags).toContain('myContainerTag');

    const cmp = adapter.findComponentById('sys.ctr.cmp');
    expect(cmp?.tags).not.toContain('Component');
    expect(cmp?.tags).toContain('myComponentTag');
  });
});

describe('StructurizrAdapter - ID resolution', () => {
  let adapter: TestStructurizrAdapter;

  beforeEach(() => {
    adapter = new TestStructurizrAdapter();
  });

  it('should use DSL identifier as ID', () => {
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [{ ...dslElement('my_service', '1'), name: 'My Service' }],
      },
    };
    adapter.setMockWorkspace(workspace);

    const svc = adapter.findComponentById('my_service');
    expect(svc).toBeDefined();
    expect(svc?.name).toBe('My Service');
  });

  it('should fall back to snake_case of name when no id present', () => {
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [{ name: 'My Unnamed Service' }],
      },
    };
    adapter.setMockWorkspace(workspace);

    expect(adapter.findComponentById('my_unnamed_service')).toBeDefined();
  });

  it('should use erode.id property as highest priority ID', () => {
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [
          {
            id: '1',
            name: 'Service With Custom ID',
            properties: {
              'erode.id': 'custom_erode_id',
              'structurizr.dsl.identifier': 'dsl_identifier',
            },
          },
        ],
      },
    };
    adapter.setMockWorkspace(workspace);

    expect(adapter.findComponentById('custom_erode_id')?.name).toBe('Service With Custom ID');
    // DSL identifier should NOT be used when erode.id is set
    expect(adapter.findComponentById('dsl_identifier')).toBeUndefined();
  });

  it('should build nested IDs using dotted paths', () => {
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [
          {
            ...dslElement('parent_sys'),
            name: 'Parent System',
            containers: [{ ...dslElement('parent_sys.child_svc'), name: 'Child Service' }],
          },
        ],
      },
    };
    adapter.setMockWorkspace(workspace);

    const child = adapter.findComponentById('parent_sys.child_svc');
    expect(child).toBeDefined();
    expect(child?.name).toBe('Child Service');
  });

  it('should build three-level dotted IDs for components inside containers', () => {
    const workspace: StructurizrWorkspace = {
      name: 'Test',
      model: {
        softwareSystems: [
          {
            ...dslElement('sys'),
            name: 'System',
            containers: [
              {
                ...dslElement('sys.container'),
                name: 'Container',
                components: [{ ...dslElement('sys.container.component'), name: 'Component' }],
              },
            ],
          },
        ],
      },
    };
    adapter.setMockWorkspace(workspace);

    expect(adapter.findComponentById('sys.container.component')).toBeDefined();
  });
});
