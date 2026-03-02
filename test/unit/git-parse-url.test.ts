import { describe, it, expect } from 'vitest';
import { parseRepoUrl } from '../../src/core/git.js';

describe('parseRepoUrl', () => {
  describe('basic URL parsing', () => {
    it('parses basic https URL', () => {
      const result = parseRepoUrl('https://github.com/org/repo');
      expect(result.org).toBe('org');
      expect(result.repo).toBe('repo');
      expect(result.branch).toBe('main');
      expect(result.path).toBe('');
    });

    it('parses basic SSH URL', () => {
      const result = parseRepoUrl('git@github.com:owner/repo.git');
      expect(result.org).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.branch).toBe('main');
    });

    it('parses URL without .git suffix', () => {
      const result = parseRepoUrl('https://github.com/org/repo');
      expect(result.repo).toBe('repo');
    });

    it('parses URL with .git suffix', () => {
      const result = parseRepoUrl('https://github.com/org/repo.git');
      expect(result.repo).toBe('repo');
    });
  });

  describe('branch extraction from tree/ URLs', () => {
    it('extracts branch from tree/main URL', () => {
      const result = parseRepoUrl('https://github.com/org/repo/tree/main/path/to/skill');
      expect(result.branch).toBe('main');
      expect(result.path).toBe('path/to/skill');
    });

    it('extracts branch from tree/v4 URL', () => {
      const result = parseRepoUrl('https://github.com/nuxt/ui/tree/v4');
      expect(result.branch).toBe('v4');
      expect(result.path).toBe('');
    });

    it('extracts branch and path from tree/v4/skills URL', () => {
      const result = parseRepoUrl('https://github.com/nuxt/ui/tree/v4/skills');
      expect(result.branch).toBe('v4');
      expect(result.path).toBe('skills');
    });

    it('extracts branch and nested path from tree URL', () => {
      const result = parseRepoUrl('https://github.com/org/repo/tree/v1.0.0/skills/react/src');
      expect(result.branch).toBe('v1.0.0');
      expect(result.path).toBe('skills/react/src');
    });

    it('extracts commit hash as branch', () => {
      const result = parseRepoUrl('https://github.com/org/repo/tree/abc123def456/path');
      expect(result.branch).toBe('abc123def456');
      expect(result.path).toBe('path');
    });

    it('extracts feature branch name', () => {
      const result = parseRepoUrl('https://github.com/org/repo/tree/feature-branch/path/to/skills');
      expect(result.branch).toBe('feature-branch');
      expect(result.path).toBe('path/to/skills');
    });
  });

  describe('branch extraction from blob/ URLs', () => {
    it('extracts branch from blob/main URL', () => {
      const result = parseRepoUrl('https://github.com/org/repo/blob/main/SKILL.md');
      expect(result.branch).toBe('main');
      expect(result.path).toBe('SKILL.md');
    });

    it('extracts branch from blob/v1.0 URL', () => {
      const result = parseRepoUrl('https://github.com/org/repo/blob/v1.0.0/readme.md');
      expect(result.branch).toBe('v1.0.0');
      expect(result.path).toBe('readme.md');
    });
  });

  describe('path extraction edge cases', () => {
    it('extracts nested path with multiple segments', () => {
      const result = parseRepoUrl('https://github.com/org/repo/tree/main/packages/skill-lib/src/components');
      expect(result.path).toBe('packages/skill-lib/src/components');
    });

    it('returns empty path for root URL', () => {
      const result = parseRepoUrl('https://github.com/org/repo');
      expect(result.path).toBe('');
    });

    it('handles path with hyphens and underscores', () => {
      const result = parseRepoUrl('https://github.com/org/repo/tree/main/my_skill-lib_2024/src');
      expect(result.path).toBe('my_skill-lib_2024/src');
    });
  });

  describe('handles various URL formats', () => {
    it('handles URL with trailing slash', () => {
      const result = parseRepoUrl('https://github.com/org/repo/');
      expect(result.org).toBe('org');
      expect(result.repo).toBe('repo');
    });

    it('preserves original URL in result', () => {
      const url = 'https://github.com/org/repo/tree/v4/skills';
      const result = parseRepoUrl(url);
      expect(result.url).toBe(url);
    });
  });
});
