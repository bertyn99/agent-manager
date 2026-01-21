// SkillRemover Unit Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs-extra';
import { join } from 'pathe';
import { SkillRemover } from '../../src/core/skill-remover';
import { createMockConfig } from '../../helpers/mock-config';

describe('SkillRemover', () => {
  const config = createMockConfig();
  const remover = new SkillRemover(config);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('removeExtension', () => {
    it('should remove symlink', () => {
      const lstatSpy = vi.spyOn(fs, 'lstatSync').mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => true,
        isFile: () => false,
      });
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);

      await remover.removeExtension('test-skill', 'claude-code');

      expect(unlinkSpy).toHaveBeenCalledWith(
        join('/mock/.claude/skills', 'test-skill')
      );
      expect(lstatSpy).toHaveBeenCalledWith(
        join('/mock/.claude/skills', 'test-skill')
      );
    });

    it('should remove directory recursively', () => {
      const lstatSpy = vi.spyOn(fs, 'lstatSync').mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        isFile: () => false,
      });
      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => undefined);

      await remover.removeExtension('test-dir', 'cursor');

      expect(rmSpy).toHaveBeenCalledWith(
        join('/mock/.cursor/skills', 'test-dir'),
        { recursive: true }
      );
      expect(lstatSpy).toHaveBeenCalledWith(
        join('/mock/.cursor/skills', 'test-dir')
      );
    });
  });
});
