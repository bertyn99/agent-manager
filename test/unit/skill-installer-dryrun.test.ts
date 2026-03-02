import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, mkdtempSync, writeFileSync, existsSync, cpSync } from 'fs-extra';
import { join } from 'pathe';
import { tmpdir } from 'os';

const { mockCloneRepo, mockPrompt } = vi.hoisted(() => ({
  mockCloneRepo: vi.fn().mockResolvedValue({ path: '/mock/path', branch: 'main' }),
  mockPrompt: vi.fn().mockResolvedValue(['skill-a']),
}));

vi.mock('../../src/core/git', () => ({
  cloneRepo: mockCloneRepo,
  parseRepoUrl: vi.fn().mockReturnValue({
    url: 'https://github.com/test/repo',
    org: 'test',
    repo: 'repo',
    branch: 'main',
    path: '',
  }),
  isValidRepo: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    start: vi.fn(),
    fatal: vi.fn(),
    box: vi.fn(),
    prompt: mockPrompt,
  },
}));

const { addExtension, addGlobalSkill } = await import('../../src/core/skill-installer.js');
import type { AgentManagerConfig } from '../../src/core/types.js';

describe('Skill Installer - Dry-Run Mode', () => {
  let testDir: string;
  let config: AgentManagerConfig;
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCloneRepo.mockClear();
    mockPrompt.mockClear();

    testDir = mkdtempSync(join(tmpdir(), 'dryrun-test-'));

    config = {
      home: join(testDir, '.config', 'agent-manager'),
      manifestPath: join(testDir, '.config', 'agent-manager', 'skills.yaml'),
      skillsPath: join(testDir, '.config', 'agent-manager', 'skill'),
      vendorPath: join(testDir, '.config', 'agent-manager', 'vendor'),
      agents: {
        'claude-code': {
          enabled: true,
          configPath: join(testDir, '.claude', 'settings.json'),
          skillsPath: join(testDir, '.claude', 'skills'),
        },
        'cursor': {
          enabled: true,
          configPath: join(testDir, '.cursor', 'mcp.json'),
          skillsPath: join(testDir, '.cursor', 'skills'),
        },
        'gemini-cli': {
          enabled: true,
          configPath: join(testDir, '.gemini', 'settings.json'),
          skillsPath: join(testDir, '.gemini', 'commands'),
        },
        'opencode': {
          enabled: true,
          configPath: join(testDir, '.config', 'opencode', 'skills.yaml'),
          skillsPath: join(testDir, '.config', 'opencode', 'skill'),
        },
      },
    };

    const vendorTempDir = join(testDir, '.config', 'agent-manager', 'vendor', 'temp');
    mkdirSync(vendorTempDir, { recursive: true });
    
    const mockClonePath = join(vendorTempDir, 'repo');
    mkdirSync(mockClonePath, { recursive: true });
    writeFileSync(join(mockClonePath, 'SKILL.md'), `---
name: test-skill
description: A test skill
---
# Test Skill
`);

    mockCloneRepo.mockResolvedValue({ path: mockClonePath, branch: 'main' });

    mkdirSync(config.agents['claude-code']!.skillsPath!, { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(config.agents['claude-code']!.configPath!, JSON.stringify({ mcpServers: {} }));

    existsSyncSpy = vi.spyOn(require('fs-extra'), 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('addExtension dry-run behavior', () => {
    it('should NOT clone repo in dry-run mode without skill selection', async () => {
      const result = await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: true }
      );

      expect(mockCloneRepo).not.toHaveBeenCalled();
    });

    it('should clone repo in dry-run mode when includeSelect is true', async () => {
      await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: true, includeSelect: true }
      );

      expect(mockCloneRepo).toHaveBeenCalled();
    });

    it('should clone repo in dry-run mode when excludeSelect is true', async () => {
      await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: true, excludeSelect: true }
      );

      expect(mockCloneRepo).toHaveBeenCalled();
    });

    it('should skip path validation in dry-run without skill selection', async () => {
      existsSyncSpy.mockReturnValue(false);

      const result = await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: true, path: 'non-existent-path' }
      );

      expect(mockCloneRepo).not.toHaveBeenCalled();
      expect(result.error).not.toBe('Path not found: non-existent-path');
    });

    it('should validate path in dry-run with skill selection', async () => {
      existsSyncSpy.mockImplementation((path: string) => {
        return !path.includes('non-existent-path');
      });

      await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: true, includeSelect: true, path: 'non-existent-path' }
      );

      expect(mockCloneRepo).toHaveBeenCalled();
    });
  });

  describe('addGlobalSkill dry-run behavior', () => {
    it('should NOT clone repo in dry-run mode without skill selection', async () => {
      await addGlobalSkill(
        'https://github.com/test/skill-repo',
        config,
        { dryRun: true }
      );

      expect(mockCloneRepo).not.toHaveBeenCalled();
    });

    it('should clone repo in dry-run mode when includeSelect is true', async () => {
      await addGlobalSkill(
        'https://github.com/test/skill-repo',
        config,
        { dryRun: true, includeSelect: true }
      );

      expect(mockCloneRepo).toHaveBeenCalled();
    });

    it('should clone repo in dry-run mode when excludeSelect is true', async () => {
      await addGlobalSkill(
        'https://github.com/test/skill-repo',
        config,
        { dryRun: true, excludeSelect: true }
      );

      expect(mockCloneRepo).toHaveBeenCalled();
    });

    it('should skip path validation in dry-run without skill selection', async () => {
      existsSyncSpy.mockReturnValue(false);

      const result = await addGlobalSkill(
        'https://github.com/test/skill-repo',
        config,
        { dryRun: true, path: 'non-existent-path' }
      );

      expect(mockCloneRepo).not.toHaveBeenCalled();
      expect(result.error).not.toBe('Path not found: non-existent-path');
    });

    it('should validate path in non-dry-run mode', async () => {
      existsSyncSpy.mockImplementation((path: string) => {
        return !path.includes('non-existent-path');
      });

      const result = await addGlobalSkill(
        'https://github.com/test/skill-repo',
        config,
        { dryRun: false, path: 'non-existent-path' }
      );

      expect(result.error).toBe('Path not found: non-existent-path');
      expect(result.success).toBe(false);
    });
  });

  describe('addExtension non-dry-run behavior (baseline)', () => {
    it('should clone repo in non-dry-run mode', async () => {
      await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: false }
      );

      expect(mockCloneRepo).toHaveBeenCalled();
    });

    it('should validate path in non-dry-run mode', async () => {
      existsSyncSpy.mockImplementation((path: string) => {
        return !path.includes('non-existent-path');
      });

      const result = await addExtension(
        'https://github.com/test/repo',
        config,
        { dryRun: false, path: 'non-existent-path' }
      );

      expect(result.error).toBe('Path not found: non-existent-path');
      expect(result.success).toBe(false);
    });
  });
});
