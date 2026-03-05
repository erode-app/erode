import { describe, it, expect, beforeEach } from 'vitest';
import { LikeC4Adapter } from '../adapter.js';
import type { ArchitecturalComponent } from '../../architecture-types.js';
import { createMockModel, type MockLikeC4Model } from './fixtures/mock-model.js';

class TestLikeC4Adapter extends LikeC4Adapter {
  public setMockModel(model: MockLikeC4Model): void {
    const adapter = this as unknown as {
      model: MockLikeC4Model;
      componentIndex: unknown;
      relationships: unknown;
    };
    adapter.model = model;

    const components = this.extractComponents();
    const relationships = this.extractRelationships();
    adapter.relationships = relationships;
    adapter.componentIndex = this.buildComponentIndex(components);
  }

  public override extractComponents() {
    return super.extractComponents();
  }

  public override extractRelationships() {
    return super.extractRelationships();
  }

  public override buildComponentIndex(components: ArchitecturalComponent[]) {
    return super.buildComponentIndex(components);
  }
}

describe('LikeC4Adapter - URL spoofing protection', () => {
  let adapter: TestLikeC4Adapter;

  beforeEach(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];

    adapter = new TestLikeC4Adapter();
    adapter.setMockModel(createMockModel());
  });

  it('should reject URLs from lookalike domains', () => {
    const spoofedModel: MockLikeC4Model = {
      elements: () => [
        {
          id: 'spoofed_service',
          title: 'Spoofed Service',
          kind: 'service',
          tags: [],
          links: ['https://evil-github.com/owner/repo'],
        },
      ],
      relationships: () => [],
    };
    adapter.setMockModel(spoofedModel);
    const components = adapter.extractComponents();
    const spoofed = components.find((c) => c.id === 'spoofed_service');
    expect(spoofed?.repository).toBeUndefined();
  });

  it('should reject URLs with github.com as query parameter', () => {
    const spoofedModel: MockLikeC4Model = {
      elements: () => [
        {
          id: 'query_spoofed',
          title: 'Query Spoofed',
          kind: 'service',
          tags: [],
          links: ['https://evil.com?redirect=github.com/owner/repo'],
        },
      ],
      relationships: () => [],
    };
    adapter.setMockModel(spoofedModel);
    const components = adapter.extractComponents();
    const spoofed = components.find((c) => c.id === 'query_spoofed');
    expect(spoofed?.repository).toBeUndefined();
  });

  it('should accept legitimate github.com URLs', () => {
    const components = adapter.extractComponents();
    const frontend = components.find((c) => c.id === 'frontend');
    expect(frontend?.repository).toBe('https://github.com/example/frontend');
  });
});
