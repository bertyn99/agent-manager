// Integration Tests for Manifest Restructuring
// Tests new manifest structure with MCP/Skills separation and origin grouping
// Some tests reference functions that need to be implemented per the restructuring plan

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'pathe';
import { readFileSync, writeFileSync, existsSync, mkdirSync, removeSync } from 'fs-extra';
import {
  // Current manifest functions (existing)
  readManifest,
  writeManifest,
  getManifestPath,
  findSkill,
  addSkillToManifest,
  removeSkillFromManifest,
  addSourceToManifest,
  // Types from manifest
  type AgentManagerManifest,
  type ManifestSkill,
  type ManifestSource,
} from '../../src/core/manifest';
import type { AgentType } from '../../src/core/types';

// Test fixtures path
const FIXTURES_PATH = join(__dirname, '..', 'fixtures', 'manifest');

describe('Manifest Restructuring: Current Implementation Tests', () => {
  const testDir = join(FIXTURES_PATH, 'current-tests');

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

  describe('readManifest (Legacy Format)', () => {
    it('should read and parse v1.0.0 manifest', () => {
      // Write directly to manifest path in testDir
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills:
  - name: test-skill-1
    description: A test skill
    installedAt: '2024-01-01T00:00:00.000Z'
    agents:
      - agent: claude-code
        installedAt: '2024-01-01T00:00:00.000Z'
sources:
  - repo: https://github.com/test/repo
    path: skills
    branch: main
    addedAt: '2024-01-01T00:00:00.000Z'
`);

      const result = readManifest(testDir);

      expect(result.version).toBe('1.0.0');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('test-skill-1');
      expect(result.sources).toHaveLength(1);
    });

    it('should handle missing manifest gracefully', () => {
      const result = readManifest('/non-existent/path');

      expect(result.version).toBe('1.0.0');
      expect(result.skills).toEqual([]);
      expect(result.sources).toEqual([]);
    });

    it('should return empty manifest for invalid YAML', () => {
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, 'invalid: yaml: content: [');

      const result = readManifest(testDir);

      expect(result.skills).toEqual([]);
      expect(result.sources).toEqual([]);
    });
  });

  describe('findSkill', () => {
    it('should find skill by name', () => {
      const manifest: AgentManagerManifest = {
        version: '1.0.0',
        updated: new Date().toISOString(),
        skills: [
          {
            name: 'test-skill',
            installedAt: new Date().toISOString(),
            agents: [],
          },
        ],
        sources: [],
      };

      const result = findSkill(manifest, 'test-skill');
      expect(result).toBeDefined();
      expect(result?.name).toBe('test-skill');
    });

    it('should return undefined for non-existent skill', () => {
      const manifest: AgentManagerManifest = {
        version: '1.0.0',
        updated: new Date().toISOString(),
        skills: [],
        sources: [],
      };

      const result = findSkill(manifest, 'non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('addSkillToManifest', () => {
    it('should add new skill to manifest', () => {
      // Write initial manifest
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills: []
sources: []
`);

      addSkillToManifest(testDir, 'new-skill', 'claude-code', {
        description: 'A new skill',
        repo: 'https://github.com/test/new-skill',
      });

      const result = readManifest(testDir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('new-skill');
      expect(result.skills[0].agents).toHaveLength(1);
      expect(result.skills[0].agents[0].agent).toBe('claude-code');
    });

    it('should add agent to existing skill', () => {
      // Write initial manifest with existing skill
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills:
  - name: existing-skill
    installedAt: '2024-01-01T00:00:00.000Z'
    agents:
      - agent: claude-code
        installedAt: '2024-01-01T00:00:00.000Z'
sources: []
`);

      addSkillToManifest(testDir, 'existing-skill', 'cursor', {});

      const result = readManifest(testDir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].agents).toHaveLength(2);
    });
  });

  describe('removeSkillFromManifest', () => {
    it('should remove skill from manifest', () => {
      // Write initial manifest
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills:
  - name: skill-to-remove
    installedAt: '2024-01-01T00:00:00.000Z'
    agents:
      - agent: claude-code
        installedAt: '2024-01-01T00:00:00.000Z'
sources: []
`);

      const result = removeSkillFromManifest(testDir, 'skill-to-remove', 'claude-code');

      expect(result).toBe(true);
      const updatedManifest = readManifest(testDir);
      expect(updatedManifest.skills).toHaveLength(0);
    });

    it('should return false for non-existent skill', () => {
      // Write initial manifest
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills: []
sources: []
`);

      const result = removeSkillFromManifest(testDir, 'non-existent', 'claude-code');

      expect(result).toBe(false);
    });
  });

  describe('addSourceToManifest', () => {
    it('should add source to manifest', () => {
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills: []
sources: []
`);

      addSourceToManifest(testDir, 'https://github.com/test/repo', 'skills', 'main');

      const result = readManifest(testDir);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].repo).toBe('https://github.com/test/repo');
      expect(result.sources[0].path).toBe('skills');
      expect(result.sources[0].branch).toBe('main');
    });

    it('should update existing source', () => {
      const manifestPath = getManifestPath(testDir);
      writeFileSync(manifestPath, `
version: '1.0.0'
skills: []
sources:
  - repo: https://github.com/test/repo
    path: old-path
    branch: main
    addedAt: '2024-01-01T00:00:00.000Z'
`);

      addSourceToManifest(testDir, 'https://github.com/test/repo', 'new-path', 'develop');

      const result = readManifest(testDir);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].path).toBe('new-path');
      expect(result.sources[0].branch).toBe('develop');
    });
  });
});

describe('Manifest Restructuring: Filter Logic Tests (Per Plan)', () => {
  // These tests document the expected filter behavior from the plan
  // The actual filterByFolderName function needs to be implemented

  describe('filterByFolderName (Planned Implementation)', () => {
    // Placeholder for the planned filter function
    // Expected behavior from plan:
    // - If include has items: ONLY include those folder names
    // - Else if exclude has items: include ALL EXCEPT those folder names
    // - Else (both empty): include everything

    it.todo('should ONLY include specified folders when include has items');

    it.todo('should ignore exclude when include is specified');

    it.todo('should exclude specified folders when include is empty');

    it.todo('should include everything when both filters are empty');

    it.todo('should match by folder name, not skill name from SKILL.md');

    it('filter logic example (manual implementation for documentation)', () => {
      // Example of expected behavior for documentation
      function filterSkillsByFolderName(
        allSkillFolders: string[],
        include: string[],
        exclude: string[]
      ): string[] {
        // If include array has items: ONLY include those folder names
        if (include.length > 0) {
          return allSkillFolders.filter(folder => include.includes(folder));
        }
        // Else if exclude array has items: include ALL EXCEPT those folder names
        if (exclude.length > 0) {
          return allSkillFolders.filter(folder => !exclude.includes(folder));
        }
        // Else (both empty): include everything
        return allSkillFolders;
      }

      // Test cases
      const folders = ['auth', 'database', 'logging', 'utils'];

      // Include only auth and database
      expect(filterSkillsByFolderName(folders, ['auth', 'database'], [])).toEqual(['auth', 'database']);

      // Exclude logging and utils
      expect(filterSkillsByFolderName(folders, [], ['logging', 'utils'])).toEqual(['auth', 'database']);

      // Include everything
      expect(filterSkillsByFolderName(folders, [], [])).toEqual(folders);

      // Include takes precedence
      expect(filterSkillsByFolderName(folders, ['auth', 'database', 'logging'], ['auth'])).toEqual(['auth', 'database', 'logging']);
    });
  });
});

describe('Manifest Restructuring: Migration Tests (Per Plan)', () => {
  // These tests document expected migration behavior
  // The migrateManifest function needs to be implemented

  describe('migrateManifest (Planned Implementation)', () => {
    it.todo('should migrate old manifest to new format');

    it.todo('should separate MCPs from skills (identified by description pattern)');

    it.todo('should group skills by origin repo');

    it.todo('should handle skills without source as local');

    it.todo('should preserve all agent assignments');

    it.todo('should create backup of old manifest as manifest.yaml.old');

    it.todo('should be idempotent (safe to run multiple times)');

    it.todo('should return MigrationResult with counts and errors');

    it('migration logic example (manual implementation for documentation)', () => {
      // Example of expected migration behavior for documentation
      interface LegacyManifest {
        version: string;
        skills: Array<{
          name: string;
          description?: string;
          source?: { repo: string; path?: string };
          agents: Array<{ agent: AgentType }>;
        }>;
        sources: Array<{
          repo: string;
          path: string;
          branch: string;
          include?: string[];
          exclude?: string[];
        }>;
      }

      interface MigrationResult {
        success: boolean;
        migratedSkills: number;
        migratedMcps: number;
        migratedSources: number;
        errors: string[];
      }

      function exampleMigrateManifest(legacy: LegacyManifest): MigrationResult {
        const result: MigrationResult = {
          success: true,
          migratedSkills: 0,
          migratedMcps: 0,
          migratedSources: 0,
          errors: [],
        };

        // Identify MCPs by description pattern
        const mcpSkills = legacy.skills.filter(s => s.description?.startsWith('MCP server:'));
        const regularSkills = legacy.skills.filter(s => !s.description?.startsWith('MCP server:'));

        result.migratedMcps = mcpSkills.length;

        // Group skills by origin
        const skillsByOrigin = new Map<string, typeof regularSkills>();
        for (const skill of regularSkills) {
          const origin = skill.source?.repo || 'local';
          const existing = skillsByOrigin.get(origin) || [];
          existing.push(skill);
          skillsByOrigin.set(origin, existing);
        }

        result.migratedSkills = regularSkills.length;
        result.migratedSources = legacy.sources.length;

        return result;
      }

      // Example test
      const legacyManifest: LegacyManifest = {
        version: '1.0.0',
        skills: [
          {
            name: 'github-mcp',
            description: 'MCP server: github',
            agents: [{ agent: 'claude-code' }],
          },
          {
            name: 'ai-sdk-core',
            description: 'Build backend AI',
            source: { repo: 'https://github.com/test/repo' },
            agents: [{ agent: 'claude-code' }],
          },
          {
            name: 'local-skill',
            agents: [{ agent: 'claude-code' }],
          },
        ],
        sources: [
          {
            repo: 'https://github.com/test/repo',
            path: 'skills',
            branch: 'main',
          },
        ],
      };

      const result = exampleMigrateManifest(legacyManifest);
      expect(result.migratedMcps).toBe(1);
      expect(result.migratedSkills).toBe(2);
      expect(result.migratedSources).toBe(1);
    });
  });
});

describe('Manifest Restructuring: New Format Tests (Per Plan)', () => {
  // These tests document expected new format structure

  describe('New Manifest Structure', () => {
    it.todo('should have version 2.0.0');

    it.todo('should have separate mcp section');

    it.todo('should have skills grouped by origin');

    it('new format example (for documentation)', () => {
      // Expected new format structure from the plan
      interface NewAgentManagerManifest {
        version: string;
        updated: string;
        mcp: Record<string, {
          agents: AgentType[];
          config?: Record<string, unknown>;
        }>;
        skills: SkillOriginGroup[];
      }

      interface SkillOriginGroup {
        origin: string;
        path: string;
        branch: string;
        include: string[];
        exclude: string[];
        skills: Array<{
          name: string;
          folderName: string;
          agents: AgentType[];
          description?: string;
        }>;
      }

      // Example manifest
      const exampleManifest: NewAgentManagerManifest = {
        version: '2.0.0',
        updated: new Date().toISOString(),
        mcp: {
          github: {
            agents: ['claude-code', 'cursor', 'gemini-cli'],
            config: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
            },
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
          {
            origin: 'local',
            path: '~/.config/agent-manager/skills',
            branch: '',
            include: [],
            exclude: [],
            skills: [
              {
                name: 'my-custom-skill',
                folderName: 'my-custom-skill',
                agents: ['claude-code', 'opencode'],
              },
            ],
          },
        ],
      };

      expect(exampleManifest.version).toBe('2.0.0');
      expect(exampleManifest.mcp.github).toBeDefined();
      expect(exampleManifest.mcp.github?.agents).toContain('claude-code');
      expect(exampleManifest.skills).toHaveLength(2);

      const remoteOrigin = exampleManifest.skills.find(s => s.origin !== 'local');
      expect(remoteOrigin?.skills[0].folderName).toBe('ai-sdk-core');
    });
  });

  describe('MCP Configuration (Per Plan)', () => {
    it.todo('should store MCP config in neutral format');

    it.todo('should track which agents have each MCP');

    it.todo('should handle both command and http transport types');

    it('MCP configuration examples (for documentation)', () => {
      // Examples of MCP configuration from the plan
      const mcpExamples = {
        github: {
          agents: ['claude-code', 'cursor', 'gemini-cli', 'opencode'],
          config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
              GITHUB_TOKEN: '${GITHUB_TOKEN}',
            },
          },
          origin: 'https://github.com/user/repo',
          path: 'mcp/github',
        },
        context7: {
          agents: ['claude-code'],
          config: {
            url: 'https://context7.io',
          },
        },
      };

      expect(mcpExamples.github.agents).toHaveLength(4);
      expect(mcpExamples.context7.config.url).toBe('https://context7.io');
    });
  });
});

describe('Manifest Restructuring: Edge Cases (Per Plan)', () => {
  describe('Empty/Invalid Manifests', () => {
    it.todo('should handle empty manifest gracefully');

    it.todo('should handle malformed YAML');

    it.todo('should handle manifest with missing required fields');
  });

  describe('Filter Edge Cases', () => {
    it.todo('should handle empty filter arrays');

    it.todo('should handle non-existent folder names in filters');

    it.todo('should handle duplicate entries in filter arrays');

    it.todo('should handle case sensitivity correctly');

    it.todo('should handle special characters in folder names');
  });

  describe('Migration Edge Cases', () => {
    it.todo('should handle manifest with no skills');

    it.todo('should handle manifest with no sources');

    it.todo('should handle skills with multiple agents');

    it.todo('should handle circular dependencies in origins');
  });
});

describe('Manifest Restructuring: Real-World Scenarios', () => {
  const testDir = join(FIXTURES_PATH, 'real-world');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) removeSync(testDir);
  });

  describe('Complete Migration Workflow', () => {
    it.todo('should migrate realistic manifest with multiple MCPs and skill repos');

    it.todo('should handle include filter selecting specific skills');

    it.todo('should handle exclude filter excluding specific skills');

    it.todo('should preserve agent assignments during migration');
  });

  describe('Filter Application After Migration', () => {
    it.todo('should apply include filter correctly to discovered skills');

    it.todo('should apply exclude filter correctly to discovered skills');

    it.todo('should handle large skill repositories (100+ skills)');
  });
});
