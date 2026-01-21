// OpenCodeAdapter Unit Tests

import { describe, it, expect } from 'vitest';
import { join } from 'pathe';
import { OpenCodeAdapter } from '../../../src/adapters/OpenCodeAdapter';
import { createMockConfig, createMockConfigWithDisabledAgent } from '../../helpers/mock-config';

describe('OpenCodeAdapter', () => {
  const config = createMockConfig();
  const adapter = new OpenCodeAdapter(config);

  describe('parseFrontmatter', () => {
    it('should parse frontmatter correctly', () => {
      const content = `---
name: test-skill
description: A test skill
version: 1.0.0
---

# Test Skill
`;

      const frontmatter = adapter.parseFrontmatter(content);

      expect(frontmatter.name).toBe('test-skill');
      expect(frontmatter.description).toBe('A test skill');
      expect(frontmatter.version).toBe('1.0.0');
    });

    it('should return empty object for content without frontmatter', () => {
      const content = '# Test Skill\nNo frontmatter here.';

      const frontmatter = adapter.parseFrontmatter(content);

      expect(frontmatter).toEqual({});
    });
  });

  describe('getManifestPath', () => {
    it('should return opencode skills.yaml path', () => {
      const path = adapter.getManifestPath();
      expect(path).toBe(join('/mock/.config/opencode', 'skills.yaml'));
    });

    it('should return opencode path even when config disabled (method does not check enabled)', () => {
      const configWithoutOpenCode = createMockConfigWithDisabledAgent('opencode');
      const adapterWithoutConfig = new OpenCodeAdapter(configWithoutOpenCode);
      
      const path = adapterWithoutConfig.getManifestPath();
      // The method returns config path regardless of enabled status
      expect(path).toBe('/mock/.config/opencode/skills.yaml');
    });
  });

  describe('getConfigDir', () => {
    it('should return opencode config directory', () => {
      const dir = adapter.getConfigDir();
      expect(dir).toBe('/mock/.config/opencode');
    });

    it('should return opencode path even when config disabled (method does not check enabled)', () => {
      const configWithoutOpenCode = createMockConfigWithDisabledAgent('opencode');
      const adapterWithoutConfig = new OpenCodeAdapter(configWithoutOpenCode);
      
      const dir = adapterWithoutConfig.getConfigDir();
      // The method returns config path regardless of enabled status
      expect(dir).toBe('/mock/.config/opencode');
    });
  });

  describe('getMCPConfigPath', () => {
    it('should return opencode.json path', () => {
      const path = adapter.getMCPConfigPath();
      expect(path).toBe(join('/mock/.config/opencode', 'opencode.json'));
    });
  });

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('opencode');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('OpenCode');
    });
  });
});
