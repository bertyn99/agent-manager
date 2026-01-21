// ClaudeAdapter Unit Tests

import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../../src/adapters/ClaudeAdapter';
import { createMockConfig } from '../../helpers/mock-config';

describe('ClaudeAdapter', () => {
  const config = createMockConfig();
  const adapter = new ClaudeAdapter(config);

  describe('parseFrontmatter', () => {
    it('should parse frontmatter correctly', () => {
      const content = `---
name: test-skill
description: A test skill
version: 1.0.0
---

# Test Skill
This is a test.
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

    it('should handle quoted values', () => {
      const content = `---
name: "quoted-name"
description: 'single-quoted'
---
`;
      
      const frontmatter = adapter.parseFrontmatter(content);
      
      expect(frontmatter.name).toBe('quoted-name');
      expect(frontmatter.description).toBe('single-quoted');
    });

    it('should ignore empty lines in frontmatter', () => {
      const content = `---
name: test
description: 

---
`;
      
      const frontmatter = adapter.parseFrontmatter(content);
      
      expect(frontmatter.name).toBe('test');
      expect(frontmatter.description).toBe('');
    });
  });

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('claude-code');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('Claude Code');
    });
  });
});
