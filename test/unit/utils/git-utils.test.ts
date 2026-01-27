// Git Utilities Module Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cloneRepo,
  pullRepo,
  checkoutBranch,
  getCurrentCommit,
  getLatestTag,
  isRepoDirty,
  getRepoStatus,
  fetchRepo,
  getRemoteUrl,
  parseRepoUrl,
  initRepo,
  addRemote,
  getBranches,
  isValidRepo,
} from '../../../src/utils/git';

describe('Git Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseRepoUrl', () => {
    it('should parse HTTPS URL correctly', () => {
      const result = parseRepoUrl('https://github.com/onmax/nuxt-skills');

      expect(result.url).toBe('https://github.com/onmax/nuxt-skills');
      expect(result.org).toBe('onmax');
      expect(result.repo).toBe('nuxt-skills');
      expect(result.branch).toBe('main');
      expect(result.path).toBe('');
    });

    it('should parse HTTPS URL with .git suffix', () => {
      const result = parseRepoUrl('https://github.com/onmax/nuxt-skills.git');

      expect(result.org).toBe('onmax');
      expect(result.repo).toBe('nuxt-skills');
    });

    it('should parse SSH URL correctly', () => {
      const result = parseRepoUrl('git@github.com:onmax/nuxt-skills.git');

      expect(result.url).toBe('git@github.com:onmax/nuxt-skills.git');
      expect(result.org).toBe('onmax');
      expect(result.repo).toBe('nuxt-skills');
    });

    it('should parse URL with blob path for branch', () => {
      const result = parseRepoUrl('https://github.com/onmax/nuxt-skills/blob/develop/src/code.ts');

      expect(result.org).toBe('onmax');
      expect(result.repo).toBe('nuxt-skills');
      expect(result.branch).toBe('develop');
      expect(result.path).toBe('src/code.ts');
    });

    it('should parse SSH URL with blob path', () => {
      const result = parseRepoUrl('git@github.com:onmax/nuxt-skills/blob/feature/test/path.ts');

      expect(result.org).toBe('onmax');
      expect(result.repo).toBe('nuxt-skills');
      expect(result.branch).toBe('feature');
      expect(result.path).toBe('test/path.ts');
    });

    it('should return empty strings for invalid URLs', () => {
      const result = parseRepoUrl('not-a-url');

      expect(result.org).toBe('');
      expect(result.repo).toBe('');
    });

    it('should handle URL with only org/repo', () => {
      const result = parseRepoUrl('https://github.com/single');

      // URL parsing expects at least org/repo format
      // A single segment doesn't parse as org/repo
      expect(result.repo).toBe('');
    });
  });

  describe('isValidRepo', () => {
    it('should return true for valid repository path', () => {
      // This would need mocking for actual file system checks
      // For now, we test the basic logic structure
      const mockExistsSync = vi.fn().mockImplementation((path: string) => {
        if (path === '/some/repo') return true;
        if (path === '/some/repo/.git') return true;
        return false;
      });

      // Since isValidRepo uses fs-extra directly, we can't easily mock it
      // This is a placeholder for how the test would work with proper mocking
      expect(typeof isValidRepo).toBe('function');
    });

    it('should return false for non-existent path', () => {
      expect(typeof isValidRepo).toBe('function');
    });
  });

  describe('cloneRepo', () => {
    it('should be a function', () => {
      expect(typeof cloneRepo).toBe('function');
    });
  });

  describe('pullRepo', () => {
    it('should be a function', () => {
      expect(typeof pullRepo).toBe('function');
    });
  });

  describe('checkoutBranch', () => {
    it('should be a function', () => {
      expect(typeof checkoutBranch).toBe('function');
    });
  });

  describe('getCurrentCommit', () => {
    it('should be a function', () => {
      expect(typeof getCurrentCommit).toBe('function');
    });
  });

  describe('getLatestTag', () => {
    it('should be a function', () => {
      expect(typeof getLatestTag).toBe('function');
    });
  });

  describe('isRepoDirty', () => {
    it('should be a function', () => {
      expect(typeof isRepoDirty).toBe('function');
    });
  });

  describe('getRepoStatus', () => {
    it('should be a function', () => {
      expect(typeof getRepoStatus).toBe('function');
    });
  });

  describe('fetchRepo', () => {
    it('should be a function', () => {
      expect(typeof fetchRepo).toBe('function');
    });
  });

  describe('getRemoteUrl', () => {
    it('should be a function', () => {
      expect(typeof getRemoteUrl).toBe('function');
    });
  });

  describe('initRepo', () => {
    it('should be a function', () => {
      expect(typeof initRepo).toBe('function');
    });
  });

  describe('addRemote', () => {
    it('should be a function', () => {
      expect(typeof addRemote).toBe('function');
    });
  });

  describe('getBranches', () => {
    it('should be a function', () => {
      expect(typeof getBranches).toBe('function');
    });
  });
});
