// Skill Sync Module Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentManagerConfig, AgentType, Extension } from '../../../src/core/types';
import { createMockConfig } from '../../helpers/mock-config';

// Mock the adapter registry
const mockListExtensions = vi.fn();
const mockDetect = vi.fn();
const mockGetAdapter = vi.fn();

vi.mock('../../../src/adapters/index.js', () => ({
  createAgentRegistry: vi.fn(() => ({
    detect: mockDetect,
    getAdapter: mockGetAdapter,
    listAllExtensions: mockListExtensions,
  })),
}));

// Mock manifest
vi.mock('../../../src/core/manifest.js', () => ({
  readManifest: vi.fn(() => ({
    skills: [],
  })),
  addExtensionToManifest: vi.fn(),
}));

// Mock fs-extra
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('fs-extra', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs-extra')>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

// Mock skill-installer to avoid file system operations
vi.mock('../../../src/core/skill-installer.js', () => ({
  detectExtensionFormat: vi.fn((path: string) => {
    if (path.includes('/some/path') || path.includes('/nonexistent')) {
      return {
        name: 'test-skill',
        description: 'A test skill',
        formats: {
          agentSkills: { enabled: true, path: 'SKILL.md' },
        },
      };
    }
    return null;
  }),
}));

describe('SkillSync', () => {
  let syncExtensions: (
    config: AgentManagerConfig,
    options: { dryRun?: boolean; from?: AgentType[]; to?: AgentType[] }
  ) => Promise<{
    success: boolean;
    synced: number;
    skipped: number;
    failed: number;
    added: string[];
    details: string[];
  }>;
  let upgradeExtension: (
    extensionName: string,
    config: AgentManagerConfig,
    options: { force?: boolean }
  ) => Promise<{ success: boolean; message: string }>;
  let upgradeAllExtensions: (
    config: AgentManagerConfig,
    options: { force?: boolean }
  ) => Promise<{ success: boolean; upgraded: number; failed: number }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/core/skill-sync.js');
    syncExtensions = module.syncExtensions;
    upgradeExtension = module.upgradeExtension;
    upgradeAllExtensions = module.upgradeAllExtensions;

    // Default mock implementations
    mockDetect.mockReturnValue([]);
    mockGetAdapter.mockReturnValue({
      detect: mockDetect,
      listExtensions: mockListExtensions,
      addExtension: vi.fn().mockResolvedValue(undefined),
    });
    mockListExtensions.mockResolvedValue([]);
    mockExistsSync.mockReturnValue(true);
  });

  describe('syncExtensions', () => {
    it('should return no agents detected when none are detected', async () => {
      mockDetect.mockReturnValue([]);

      const config = createMockConfig();
      const result = await syncExtensions(config, {});

      expect(result.success).toBe(false);
      expect(result.details).toContain('No agents detected');
    });

    it('should skip extension if source path not found', async () => {
      mockExistsSync.mockReturnValue(false);

      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([{ name: 'test-skill', type: 'skill' as const, agent: 'claude-code', path: '/nonexistent/path' }]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(['claude-code', 'cursor'] as AgentType[]);

      const result = await syncExtensions(config, { from: ['claude-code'] as AgentType[], to: ['cursor'] as AgentType[] });

      expect(result.failed).toBe(1);
      expect(result.details.some(d => d.includes('source path not found'))).toBe(true);
    });

    it('should skip agent if not compatible with extension format', async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([{ name: 'test-skill', type: 'mcp' as const, agent: 'claude-code', config: { command: 'test' } }]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(['claude-code', 'vscode-copilot'] as AgentType[]);

      // VS Code Copilot doesn't support MCP format (no mcp.enabled)
      const result = await syncExtensions(config, { from: ['claude-code'] as AgentType[], to: ['vscode-copilot'] as AgentType[] });

      expect(result.skipped).toBe(1);
      expect(result.details.some(d => d.includes("doesn't support this format"))).toBe(true);
    });

    it('should not install in dry run mode', async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([{ name: 'test-skill', type: 'skill' as const, agent: 'claude-code', path: '/some/path' }]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(['claude-code', 'cursor'] as AgentType[]);

      const result = await syncExtensions(config, { dryRun: true, from: ['claude-code'] as AgentType[], to: ['cursor'] as AgentType[] });

      expect(mockAdapter.addExtension).not.toHaveBeenCalled();
    });

    it('should install extension to target agent', async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([{ name: 'test-skill', type: 'skill' as const, agent: 'claude-code', path: '/some/path' }]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(['claude-code', 'cursor'] as AgentType[]);

      const result = await syncExtensions(config, { from: ['claude-code'] as AgentType[], to: ['cursor'] as AgentType[] });

      expect(result.added).toContain('cursor');
      expect(mockAdapter.addExtension).toHaveBeenCalled();
    });

    it('should skip duplicate extensions from same source', async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([
          { name: 'test-skill', type: 'skill' as const, agent: 'claude-code', path: '/some/path' },
          { name: 'test-skill', type: 'skill' as const, agent: 'cursor', path: '/some/path' },
        ]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(['claude-code', 'cursor'] as AgentType[]);

      const result = await syncExtensions(config, { from: ['claude-code', 'cursor'] as AgentType[], to: ['opencode'] as AgentType[] });

      // Should only attempt to install once (deduplicated by name)
      expect(mockAdapter.addExtension).toHaveBeenCalledTimes(1);
    });
  });

  describe('upgradeExtension', () => {
    it('should return not implemented message', async () => {
      const config = createMockConfig();
      const result = await upgradeExtension('test-skill', config, {});

      expect(result.success).toBe(false);
      expect(result.message).toContain('requires full implementation');
    });
  });

  describe('upgradeAllExtensions', () => {
    it('should return not implemented message', async () => {
      const config = createMockConfig();
      const result = await upgradeAllExtensions(config, {});

      expect(result.success).toBe(false);
      expect(result.upgraded).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
