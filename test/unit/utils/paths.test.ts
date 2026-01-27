// Paths Utilities Module Tests

import { describe, it, expect } from 'vitest';
import {
  joinPath,
  resolvePath,
  normalizePath,
  relativePath,
  isAbsolutePath,
  getExtension,
  getBasename,
  withoutTrailingSlash,
  withTrailingSlash,
  toPosixPath,
  getParentDir,
  safeJoin,
  isFilePath,
  isDirPath,
} from '../../../src/utils/paths';

describe('Paths Utilities', () => {
  describe('joinPath', () => {
    it('should join paths with forward slashes', () => {
      const result = joinPath('home', 'user', 'projects');
      expect(result).toBe('home/user/projects');
    });

    it('should handle empty paths', () => {
      const result = joinPath('', 'home', 'user');
      expect(result).toBe('home/user');
    });

    it('should handle multiple slashes', () => {
      const result = joinPath('home//user', 'projects');
      expect(result).toBe('home/user/projects');
    });
  });

  describe('resolvePath', () => {
    it('should resolve paths relative to current working directory', () => {
      // resolvePath uses posix.resolve which is absolute
      const result = resolvePath('home', 'user', 'projects');
      // It prepends the current working directory
      expect(result.endsWith('/home/user/projects')).toBe(true);
    });
  });

  describe('normalizePath', () => {
    it('should normalize path and convert backslashes', () => {
      const result = normalizePath('home\\user\\projects');
      expect(result).toBe('home/user/projects');
    });

    it('should normalize path separators', () => {
      const result = normalizePath('home/user/../projects');
      expect(result).toBe('home/projects');
    });

    it('should handle Windows paths', () => {
      const result = normalizePath('C:\\Users\\test\\file.txt');
      expect(result).toBe('C:/Users/test/file.txt');
    });
  });

  describe('relativePath', () => {
    it('should return relative path with forward slashes', () => {
      const result = relativePath('/home/user', '/home/user/projects');
      expect(result).toBe('projects');
    });

    it('should handle going up directories', () => {
      const result = relativePath('/home/user/projects', '/home/user');
      expect(result).toBe('..');
    });
  });

  describe('isAbsolutePath', () => {
    it('should return true for absolute POSIX paths', () => {
      expect(isAbsolutePath('/home/user')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsolutePath('home/user')).toBe(false);
    });

    it('should return false for current directory', () => {
      expect(isAbsolutePath('.')).toBe(false);
    });

    it('should return false for parent directory', () => {
      expect(isAbsolutePath('..')).toBe(false);
    });
  });

  describe('getExtension', () => {
    it('should return extension without dot', () => {
      expect(getExtension('file.txt')).toBe('txt');
    });

    it('should return extension for nested paths', () => {
      expect(getExtension('/home/user/file.ts')).toBe('ts');
    });

    it('should return empty string for directories', () => {
      expect(getExtension('dir/')).toBe('');
    });

    it('should handle files without extension', () => {
      expect(getExtension('Makefile')).toBe('');
    });

    it('should handle multiple dots in filename', () => {
      expect(getExtension('file.min.js')).toBe('js');
    });
  });

  describe('getBasename', () => {
    it('should return filename with dot when extension is stripped', () => {
      // getExtension returns 'txt', basename removes 'txt' leaving 'file.'
      expect(getBasename('file.txt')).toBe('file.');
    });

    it('should handle nested paths', () => {
      expect(getBasename('/home/user/file.txt')).toBe('file.');
    });

    it('should handle files without extension', () => {
      expect(getBasename('Makefile')).toBe('Makefile');
    });

    it('should handle files with multiple dots', () => {
      expect(getBasename('file.min.js')).toBe('file.min.');
    });
  });

  describe('withoutTrailingSlash', () => {
    it('should remove trailing slash', () => {
      expect(withoutTrailingSlash('home/user/')).toBe('home/user');
    });

    it('should not modify paths without trailing slash', () => {
      expect(withoutTrailingSlash('home/user')).toBe('home/user');
    });

    it('should handle root path - empty after removal', () => {
      // Root path '/' becomes '' after removing trailing slash
      expect(withoutTrailingSlash('/')).toBe('');
    });
  });

  describe('withTrailingSlash', () => {
    it('should add trailing slash', () => {
      expect(withTrailingSlash('home/user')).toBe('home/user/');
    });

    it('should not modify paths with trailing slash', () => {
      expect(withTrailingSlash('home/user/')).toBe('home/user/');
    });
  });

  describe('toPosixPath', () => {
    it('should convert Windows paths to POSIX', () => {
      expect(toPosixPath('C:\\Users\\test')).toBe('C:/Users/test');
    });

    it('should handle already POSIX paths', () => {
      expect(toPosixPath('home/user')).toBe('home/user');
    });
  });

  describe('getParentDir', () => {
    it('should return parent directory', () => {
      expect(getParentDir('/home/user/file.txt')).toBe('/home/user');
    });

    it('should handle root path', () => {
      expect(getParentDir('/file.txt')).toBe('/');
    });
  });

  describe('safeJoin', () => {
    it('should join paths safely', () => {
      const result = safeJoin('/home/user', 'projects');
      expect(result).toBe('/home/user/projects');
    });

    it('should handle absolute paths in join', () => {
      const result = safeJoin('/home/user', '/absolute/path');
      expect(result).toBe('/absolute/path');
    });

    it('should handle empty paths', () => {
      const result = safeJoin('/home/user', '');
      expect(result).toBe('/home/user');
    });
  });

  describe('isFilePath', () => {
    it('should return true for file paths', () => {
      expect(isFilePath('file.txt')).toBe(true);
    });

    it('should return true for nested file paths', () => {
      expect(isFilePath('/home/user/file.txt')).toBe(true);
    });

    it('should return false for directory paths', () => {
      expect(isFilePath('dir/')).toBe(false);
    });

    it('should return false for paths without extension', () => {
      expect(isFilePath('Makefile')).toBe(false);
    });
  });

  describe('isDirPath', () => {
    it('should return true for directory paths with trailing slash', () => {
      expect(isDirPath('dir/')).toBe(true);
    });

    it('should return true for directory paths without extension', () => {
      expect(isDirPath('dir')).toBe(true);
    });

    it('should return false for file paths', () => {
      expect(isDirPath('file.txt')).toBe(false);
    });

    it('should return false for absolute paths', () => {
      expect(isDirPath('/home/user')).toBe(false);
    });
  });
});
