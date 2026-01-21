// CursorAdapter Unit Tests

import { describe, it, expect } from 'vitest';
import { CursorAdapter } from '../../../src/adapters/CursorAdapter';
import { createMockConfig } from '../../helpers/mock-config';

describe('CursorAdapter', () => {
  const config = createMockConfig();
  const adapter = new CursorAdapter(config);

  describe('parseFrontmatter', () => {
    // Cursor uses YAML-style frontmatter (--- markers), not TOML
    it('should parse YAML frontmatter correctly', () => {
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
      const content = '# Test Command\nNo frontmatter here.';

      const frontmatter = adapter.parseFrontmatter(content);

      expect(frontmatter).toEqual({});
    });

    it('should handle content with only --- markers but no content', () => {
      const content = `---
name: test
---
`;
      
      const frontmatter = adapter.parseFrontmatter(content);
      
      expect(frontmatter.name).toBe('test');
    });
  });

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('cursor');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('Cursor');
    });
  });
});
