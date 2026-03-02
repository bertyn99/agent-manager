// Integration Tests for Manifest v2.0.0
// Tests manifest structure with MCP/Skills separation and origin grouping

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'pathe';
import { readFileSync, writeFileSync, existsSync, mkdirSync, removeSync } from 'fs-extra';
import {
  readManifest,
  writeManifest,
  getManifestPath,
  filterSkillsByRules,
  addMcpToManifest,
  removeMcpFromManifest,
  addSkillOriginGroup,
  getSkillInOrigin,
  addExtensionToManifest,
  removeExtensionFromManifest,
  clearManifest,
  type AgentManagerManifest,
  type SkillOriginGroup,
  type SkillEntry,
} from '../../src/core/manifest';
import type { AgentType } from '../../src/core/types';

// Test fixtures path
const FIXTURES_PATH = join(__dirname, '..', 'fixtures', 'manifest');

describe('Manifest v2.0.0: Core Functions', () => {
  const testDir = join(FIXTURES_PATH, 'v2-tests');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) removeSync(testDir);
    vi.restoreAllMocks();
  });

  describe('getManifestPath', () => {
    it('should return manifest path for given config home', () => {
      const path = getManifestPath('/test/config');
      expect(path).toBe('/test/config/manifest.yaml');
    });
  });

  describe('readManifest (v2.0.0 Format)', () => {
    it('should return empty v2.0.0 manifest when file does not exist', () => {
      const result = readManifest('/non-existent-path-12345');

      expect(result.version).toBe('2.0.0');
      expect(result.mcp).toEqual({});
      expect(result.skills).toEqual([]);
      expect(result.commands).toEqual({});
    });

    it('should read and parse v2.0.0 manifest', () => {
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '2.0.0'
updated: '2024-01-01T00:00:00.000Z'
mcp:
  github:
    agents:
      - claude-code
      - cursor
    config:
      command: npx
      args:
        - -y
        - '@modelcontextprotocol/server-github'
skills:
  - origin: https://github.com/test/repo
    path: skills
    branch: main
    include: []
    exclude: []
    skills:
      - name: test-skill-1
        folderName: test-skill-1
        agents:
          - claude-code
        description: A test skill
commands: {}
`);

      const result = readManifest(testDir);

      expect(result.version).toBe('2.0.0');
      expect(result.mcp).toBeDefined();
      expect(result.mcp.github).toBeDefined();
      expect(result.mcp.github?.agents).toContain('claude-code');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.origin).toBe('https://github.com/test/repo');
      expect(result.skills[0]?.skills).toHaveLength(1);
      expect(result.skills[0]?.skills[0]?.name).toBe('test-skill-1');
    });

    it('should handle invalid YAML gracefully', () => {
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, 'invalid: yaml: content: [');

      const result = readManifest(testDir);

      expect(result.version).toBe('2.0.0');
      expect(result.skills).toEqual([]);
      expect(result.mcp).toEqual({});
    });
  });

  describe('writeManifest', () => {
    it('should write v2.0.0 manifest to file', () => {
      const manifest: AgentManagerManifest = {
        version: '2.0.0',
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          {
            origin: 'https://github.com/test/repo',
            path: 'skills',
            branch: 'main',
            include: ['skill-1'],
            exclude: [],
            skills: [
              {
                name: 'skill-1',
                folderName: 'skill-1',
                agents: ['claude-code'],
              },
            ],
          },
        ],
        commands: {},
      };

      writeManifest(testDir, manifest);

      const manifestPath = getManifestPath(testDir);
      expect(existsSync(manifestPath)).toBe(true);

      const content = readFileSync(manifestPath, 'utf-8');
      expect(content).toContain('version:');
      expect(content).toContain('skill-1');
    });
  });
});

describe('Manifest v2.0.0: filterSkillsByRules', () => {
  describe('include/exclude filter logic', () => {
    it('should ONLY include specified folders when include has items', () => {
      const folders = ['auth', 'database', 'logging', 'utils'];
      const result = filterSkillsByRules(folders, ['auth', 'database'], []);
      expect(result).toEqual(['auth', 'database']);
    });

    it('should ignore exclude when include is specified', () => {
      const folders = ['auth', 'database', 'logging', 'utils'];
      const result = filterSkillsByRules(folders, ['auth', 'database', 'logging'], ['auth']);
      expect(result).toEqual(['auth', 'database', 'logging']);
    });

    it('should exclude specified folders when include is empty', () => {
      const folders = ['auth', 'database', 'logging', 'utils'];
      const result = filterSkillsByRules(folders, [], ['logging', 'utils']);
      expect(result).toEqual(['auth', 'database']);
    });

    it('should include everything when both filters are empty', () => {
      const folders = ['auth', 'database', 'logging', 'utils'];
      const result = filterSkillsByRules(folders, [], []);
      expect(result).toEqual(folders);
    });

    it('should return empty array when include specifies non-existent folders', () => {
      const folders = ['auth', 'database'];
      const result = filterSkillsByRules(folders, ['nonexistent'], []);
      expect(result).toEqual([]);
    });

    it('should handle empty folder list', () => {
      const result = filterSkillsByRules([], ['auth'], []);
      expect(result).toEqual([]);
    });
  });
});

describe('Manifest v2.0.0: MCP Functions', () => {
  const testDir = join(FIXTURES_PATH, 'mcp-tests');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) removeSync(testDir);
  });

  describe('addMcpToManifest', () => {
    it('should add MCP server to manifest', () => {
      addMcpToManifest(testDir, 'github', ['claude-code', 'cursor'], {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      });

      const manifest = readManifest(testDir);
      expect(manifest.mcp['github']).toBeDefined();
      expect(manifest.mcp['github']?.agents).toEqual(['claude-code', 'cursor']);
    });

    it('should update existing MCP server', () => {
      addMcpToManifest(testDir, 'github', ['claude-code'], { command: 'npx' });
      addMcpToManifest(testDir, 'github', ['cursor', 'gemini-cli'], { command: 'node' });

      const manifest = readManifest(testDir);
      expect(manifest.mcp['github']?.agents).toEqual(['cursor', 'gemini-cli']);
    });
  });

  describe('removeMcpFromManifest', () => {
    it('should remove MCP server entirely', () => {
      addMcpToManifest(testDir, 'github', ['claude-code', 'cursor'], {});

      const result = removeMcpFromManifest(testDir, 'github');

      expect(result).toBe(true);
      const manifest = readManifest(testDir);
      expect(manifest.mcp['github']).toBeUndefined();
    });

    it('should remove specific agent from MCP', () => {
      addMcpToManifest(testDir, 'github', ['claude-code', 'cursor'], {});

      const result = removeMcpFromManifest(testDir, 'github', 'claude-code');

      expect(result).toBe(true);
      const manifest = readManifest(testDir);
      expect(manifest.mcp['github']?.agents).toEqual(['cursor']);
    });

    it('should remove MCP entirely when last agent is removed', () => {
      addMcpToManifest(testDir, 'github', ['claude-code'], {});

      const result = removeMcpFromManifest(testDir, 'github', 'claude-code');

      expect(result).toBe(true);
      const manifest = readManifest(testDir);
      expect(manifest.mcp['github']).toBeUndefined();
    });

    it('should return false for non-existent MCP', () => {
      const result = removeMcpFromManifest(testDir, 'nonexistent');
      expect(result).toBe(false);
    });
  });
});

describe('Manifest v2.0.0: Skill Origin Functions', () => {
  const testDir = join(FIXTURES_PATH, 'skill-origin-tests');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) removeSync(testDir);
  });

  describe('addSkillOriginGroup', () => {
    it('should add skill origin group to manifest', () => {
      addSkillOriginGroup(testDir, 'https://github.com/test/repo', 'skills', 'main', {
        include: ['skill-1', 'skill-2'],
        exclude: ['skill-3'],
      });

      const manifest = readManifest(testDir);
      expect(manifest.skills).toHaveLength(1);
      expect(manifest.skills[0]?.origin).toBe('https://github.com/test/repo');
      expect(manifest.skills[0]?.path).toBe('skills');
      expect(manifest.skills[0]?.branch).toBe('main');
      expect(manifest.skills[0]?.include).toEqual(['skill-1', 'skill-2']);
      expect(manifest.skills[0]?.exclude).toEqual(['skill-3']);
    });

    it('should add local origin group', () => {
      addSkillOriginGroup(testDir, 'local', '~/.config/agent-manager/skills', '', {});

      const manifest = readManifest(testDir);
      expect(manifest.skills).toHaveLength(1);
      expect(manifest.skills[0]?.origin).toBe('local');
    });
  });

  describe('getSkillInOrigin', () => {
    it('should find skill in origin group', () => {
      const manifest: AgentManagerManifest = {
        version: '2.0.0',
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          {
            origin: 'https://github.com/test/repo',
            path: 'skills',
            branch: 'main',
            include: [],
            exclude: [],
            skills: [
              { name: 'test-skill', folderName: 'test-skill', agents: ['claude-code'] },
            ],
          },
        ],
        commands: {},
      };

      const result = getSkillInOrigin(manifest, 'https://github.com/test/repo', 'test-skill');
      expect(result).toBeDefined();
      expect(result?.name).toBe('test-skill');
    });

    it('should return undefined for non-existent origin', () => {
      const manifest: AgentManagerManifest = {
        version: '2.0.0',
        updated: new Date().toISOString(),
        mcp: {},
        skills: [],
        commands: {},
      };

      const result = getSkillInOrigin(manifest, 'nonexistent', 'skill');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent skill in origin', () => {
      const manifest: AgentManagerManifest = {
        version: '2.0.0',
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          {
            origin: 'https://github.com/test/repo',
            path: 'skills',
            branch: 'main',
            include: [],
            exclude: [],
            skills: [],
          },
        ],
        commands: {},
      };

      const result = getSkillInOrigin(manifest, 'https://github.com/test/repo', 'nonexistent');
      expect(result).toBeUndefined();
    });
  });
});

describe('Manifest v2.0.0: Extension Functions', () => {
  const testDir = join(FIXTURES_PATH, 'extension-tests');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) removeSync(testDir);
  });

  describe('addExtensionToManifest', () => {
    it('should add extension to new origin group', () => {
      addExtensionToManifest(testDir, 'test-skill', 'claude-code', {
        description: 'A test skill',
        repo: 'https://github.com/test/repo',
      });

      const manifest = readManifest(testDir);
      expect(manifest.skills).toHaveLength(1);
      expect(manifest.skills[0]?.origin).toBe('https://github.com/test/repo');
      expect(manifest.skills[0]?.skills).toHaveLength(1);
      expect(manifest.skills[0]?.skills[0]?.name).toBe('test-skill');
      expect(manifest.skills[0]?.skills[0]?.agents).toContain('claude-code');
    });

    it('should add extension to local origin when no repo provided', () => {
      addExtensionToManifest(testDir, 'local-skill', 'claude-code', {
        description: 'A local skill',
      });

      const manifest = readManifest(testDir);
      expect(manifest.skills).toHaveLength(1);
      expect(manifest.skills[0]?.origin).toBe('local');
      expect(manifest.skills[0]?.skills[0]?.name).toBe('local-skill');
    });

    it('should add agent to existing skill', () => {
      addExtensionToManifest(testDir, 'test-skill', 'claude-code', {
        repo: 'https://github.com/test/repo',
      });
      addExtensionToManifest(testDir, 'test-skill', 'cursor', {
        repo: 'https://github.com/test/repo',
      });

      const manifest = readManifest(testDir);
      expect(manifest.skills[0]?.skills[0]?.agents).toHaveLength(2);
      expect(manifest.skills[0]?.skills[0]?.agents).toContain('claude-code');
      expect(manifest.skills[0]?.skills[0]?.agents).toContain('cursor');
    });

    it('should not duplicate agents', () => {
      addExtensionToManifest(testDir, 'test-skill', 'claude-code', {
        repo: 'https://github.com/test/repo',
      });
      addExtensionToManifest(testDir, 'test-skill', 'claude-code', {
        repo: 'https://github.com/test/repo',
      });

      const manifest = readManifest(testDir);
      expect(manifest.skills[0]?.skills[0]?.agents).toHaveLength(1);
    });
  });

  describe('removeExtensionFromManifest', () => {
    it('should remove agent from skill', () => {
      addExtensionToManifest(testDir, 'test-skill', 'claude-code', {});
      addExtensionToManifest(testDir, 'test-skill', 'cursor', {});

      const result = removeExtensionFromManifest(testDir, 'test-skill', 'claude-code');

      expect(result).toBe(true);
      const manifest = readManifest(testDir);
      expect(manifest.skills[0]?.skills[0]?.agents).toEqual(['cursor']);
    });

    it('should remove skill entirely when last agent is removed', () => {
      addExtensionToManifest(testDir, 'test-skill', 'claude-code', {});

      const result = removeExtensionFromManifest(testDir, 'test-skill', 'claude-code');

      expect(result).toBe(true);
      const manifest = readManifest(testDir);
      expect(manifest.skills[0]?.skills).toHaveLength(0);
    });

    it('should return false for non-existent skill', () => {
      const result = removeExtensionFromManifest(testDir, 'nonexistent', 'claude-code');
      expect(result).toBe(false);
    });
  });
});

describe('Manifest v2.0.0: clearManifest', () => {
  const testDir = join(FIXTURES_PATH, 'clear-tests');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) removeSync(testDir);
  });

  it('should clear entire manifest', () => {
    addExtensionToManifest(testDir, 'test-skill', 'claude-code', {});
    
    clearManifest(testDir);

    const manifestPath = getManifestPath(testDir);
    expect(existsSync(manifestPath)).toBe(false);
  });

  it('should handle non-existent manifest gracefully', () => {
    clearManifest(testDir);
  });

  it('should remove agent from all skills when agentType specified', () => {
    addExtensionToManifest(testDir, 'skill-1', 'claude-code', {});
    addExtensionToManifest(testDir, 'skill-1', 'cursor', {});
    addExtensionToManifest(testDir, 'skill-2', 'claude-code', {});

    clearManifest(testDir, 'claude-code');

    const manifest = readManifest(testDir);
    expect(manifest.skills[0]?.skills[0]?.agents).not.toContain('claude-code');
    expect(manifest.skills[0]?.skills[0]?.agents).toContain('cursor');
  });
});

describe('Manifest v2.0.0: v2.0.0 Format Documentation', () => {
  it('should demonstrate v2.0.0 manifest structure', () => {
    const manifest: AgentManagerManifest = {
      version: '2.0.0',
      updated: new Date().toISOString(),
      mcp: {
        github: {
          agents: ['claude-code', 'cursor'],
          config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
        },
      },
      skills: [
        {
          origin: 'https://github.com/jezweb/claude-skills',
          path: 'skills',
          branch: 'main',
          include: ['ai-sdk-core', 'motion'],
          exclude: [],
          skills: [
            {
              name: 'ai-sdk-core',
              folderName: 'ai-sdk-core',
              agents: ['claude-code'],
              description: 'Build backend AI with Vercel AI SDK',
            },
          ],
        },
      ],
      commands: {},
    };

    expect(manifest.version).toBe('2.0.0');
    expect(manifest.mcp).toBeDefined();
    expect(manifest.skills).toBeDefined();
  });
});
