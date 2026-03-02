// OpenCodeAdapter Unit Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync, lstatSync, symlinkSync, readJSON } from 'fs-extra';
import { join } from 'pathe';
import { OpenCodeAdapter } from '../../../src/adapters/OpenCodeAdapter';
import { createMockConfig, createMockConfigWithDisabledAgent } from '../../helpers/mock-config';
import { createTestEnvironment, createTestSkill } from '../../helpers/test-environment';

describe('OpenCodeAdapter', () => {
  const config = createMockConfig();
  const adapter = new OpenCodeAdapter(config);

  // Note: parseFrontmatter is private in OpenCodeAdapter, so we test it indirectly through listExtensions()

  describe('getManifestPath', () => {
    it('should return opencode skills.yaml path', () => {
      const path = adapter.getManifestPath();
      expect(path).toBe(join('/mock/.config/opencode', 'skills.yaml'));
    });

    it('should return opencode path even when config disabled', () => {
      const configWithoutOpenCode = createMockConfigWithDisabledAgent('opencode');
      const adapterWithoutConfig = new OpenCodeAdapter(configWithoutOpenCode);
      
      const path = adapterWithoutConfig.getManifestPath();
      expect(path).toBe('/mock/.config/opencode/skills.yaml');
    });
  });

  describe('getConfigDir', () => {
    it('should return opencode config directory', () => {
      const dir = adapter.getConfigDir();
      expect(dir).toBe('/mock/.config/opencode');
    });
  });

  describe('getMCPConfigPath', () => {
    it('should return opencode.json path', () => {
      const path = adapter.getMCPConfigPath();
      expect(path).toBe(join('/mock/.config/opencode', 'opencode.json'));
    });
  });

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('opencode');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('OpenCode');
    });
  });
});

describe('OpenCodeAdapter - File Operations', () => {
  let env: ReturnType<typeof createTestEnvironment>;
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    env = createTestEnvironment();
    adapter = new OpenCodeAdapter(env.config);
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('detect()', () => {
    it('should detect OpenCode when skills path exists', () => {
      expect(adapter.detect()).toBe(true);
    });

    it('should not detect when skills path does not exist', () => {
      const adapterNoOpenCode = new OpenCodeAdapter({
        ...env.config,
        agents: {
          'opencode': {
            enabled: true,
            configPath: '/non/existent/skills.yaml',
            skillsPath: '/non/existent/skills',
          },
        },
      });
      expect(adapterNoOpenCode.detect()).toBe(false);
    });

    it('should not detect when opencode not configured', () => {
      const adapterNoConfig = new OpenCodeAdapter({
        ...env.config,
        agents: {},
      });
      expect(adapterNoConfig.detect()).toBe(false);
    });
  });

  describe('getManifestPath()', () => {
    it('should return manifest path from config', () => {
      expect(adapter.getManifestPath()).toBe(env.paths.opencode.config);
    });
  });

  describe('getConfigDir()', () => {
    it('should return config directory', () => {
      expect(adapter.getConfigDir()).toBe(join(env.paths.opencode.config, '..'));
    });
  });

  describe('getMCPConfigPath()', () => {
    it('should return opencode.json path', () => {
      const expectedPath = join(env.paths.opencode.config, '..', 'opencode.json');
      expect(adapter.getMCPConfigPath()).toBe(expectedPath);
    });
  });

  describe('readOpenCodeConfig()', () => {
    it('should read opencode.json config', () => {
      const mcpPath = adapter.getMCPConfigPath();
      writeFileSync(mcpPath, JSON.stringify({ mcp: { 'test-server': { type: 'remote', url: 'https://test.com' } } }));

      const config = adapter.readOpenCodeConfig();

      expect(config).not.toBeNull();
      expect(config?.mcp?.['test-server']).toBeDefined();
    });

    it('should return null when config does not exist', () => {
      const adapterNoConfig = new OpenCodeAdapter({
        ...env.config,
        agents: {
          'opencode': {
            enabled: true,
            configPath: '/non/existent/opencode.json',
            skillsPath: env.paths.opencode.skills,
          },
        },
      });

      const config = adapterNoConfig.readOpenCodeConfig();

      expect(config).toBeNull();
    });

    it('should handle JSONC with comments', () => {
      const mcpPath = adapter.getMCPConfigPath();
      writeFileSync(mcpPath, `{
        // This is a comment
        "mcp": {
          "commented-server": { "type": "remote", "url": "https://test.com" }
        }
      }`);

      const config = adapter.readOpenCodeConfig();

      expect(config).not.toBeNull();
      expect(config?.mcp?.['commented-server']).toBeDefined();
    });
  });

  describe('writeOpenCodeConfig()', () => {
    it('should write opencode.json config', () => {
      adapter.writeOpenCodeConfig({ mcp: { 'new-server': { type: 'remote', url: 'https://new.com' } } });

      expect(existsSync(adapter.getMCPConfigPath())).toBe(true);
      const config = adapter.readOpenCodeConfig();
      expect(config?.mcp?.['new-server']).toBeDefined();
    });

    it('should create parent directory if needed', () => {
      const newPath = join(env.rootDir, 'new-dir', 'opencode.json');
      const adapterNew = new OpenCodeAdapter({
        ...env.config,
        agents: {
          'opencode': {
            enabled: true,
            configPath: newPath,
            skillsPath: env.paths.opencode.skills,
          },
        },
      });

      adapterNew.writeOpenCodeConfig({ mcp: {} });

      expect(existsSync(newPath)).toBe(true);
    });
  });

  describe('addExtension() - MCP servers', () => {
    it('should add HTTP MCP server to opencode.json', async () => {
      await adapter.addExtension({
        name: 'opencode-http',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://mcp.opencode.example.com' },
      });

      const config = adapter.readOpenCodeConfig();
      expect(config?.mcp?.['opencode-http']).toBeDefined();
      expect(config?.mcp?.['opencode-http'].type).toBe('remote');
      expect(config?.mcp?.['opencode-http'].url).toBe('https://mcp.opencode.example.com');
    });

    it('should add command-based MCP server to opencode.json', async () => {
      await adapter.addExtension({
        name: 'opencode-stdio',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'command', command: 'npx opencode-mcp' },
      });

      const config = adapter.readOpenCodeConfig();
      expect(config?.mcp?.['opencode-stdio']).toBeDefined();
      expect(config?.mcp?.['opencode-stdio'].type).toBe('command');
      expect(config?.mcp?.['opencode-stdio'].command).toBe('npx opencode-mcp');
    });

    it('should throw error for invalid transport type', async () => {
      await expect(adapter.addExtension({
        name: 'invalid-server',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'invalid' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });

    it('should throw error when opencode not configured', async () => {
      const adapterNoConfig = new OpenCodeAdapter({
        ...env.config,
        agents: {},
      });

      await expect(adapterNoConfig.addExtension({
        name: 'test',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://test.com' },
      })).rejects.toThrow('OpenCode is not configured');
    });
  });

  describe('addExtension() - Skills (symlinks)', () => {
    it('should create symlink for skill', async () => {
      const sourceSkill = createTestSkill(env.paths.opencode.skills, 'source-skill', `---
name: opencode-skill
description: An OpenCode skill
---
# OpenCode Skill
`);

      await adapter.addExtension({
        name: 'linked-skill',
        type: 'skill',
        agent: 'opencode',
        path: sourceSkill,
      });

      const linkPath = env.paths.opencode.skills + '/linked-skill';
      expect(existsSync(linkPath)).toBe(true);
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    });

    it('should throw error when skill already exists as directory', async () => {
      const existingSkill = createTestSkill(env.paths.opencode.skills, 'existing-skill');
      const sourceSkill = createTestSkill(env.paths.opencode.skills, 'new-skill');

      await expect(adapter.addExtension({
        name: 'existing-skill',
        type: 'skill',
        agent: 'opencode',
        path: sourceSkill,
      })).rejects.toThrow('already exists as a directory');
    });

    it('should replace existing symlink', async () => {
      const sourceSkill1 = createTestSkill(env.paths.opencode.skills, 'skill1', `---
name: skill1
description: Version 1
---
# Skill v1
`);
      const sourceSkill2 = createTestSkill(env.paths.opencode.skills, 'skill2', `---
name: replaceable
description: Version 2
---
# Skill v2
`);

      // Create first symlink
      await adapter.addExtension({
        name: 'replaceable',
        type: 'skill',
        agent: 'opencode',
        path: sourceSkill1,
      });

      // Replace with new symlink
      await adapter.addExtension({
        name: 'replaceable',
        type: 'skill',
        agent: 'opencode',
        path: sourceSkill2,
      });

      const linkPath = env.paths.opencode.skills + '/replaceable';
      const content = readFileSync(linkPath + '/SKILL.md', 'utf-8');
      expect(content).toContain('Version 2');
    });
  });

  describe('removeExtension() - MCP servers', () => {
    it('should remove MCP server from opencode.json', async () => {
      // First add
      await adapter.addExtension({
        name: 'oc-to-remove',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://test.com' },
      });

      // Then remove
      await adapter.removeExtension('oc-to-remove');

      const config = adapter.readOpenCodeConfig();
      expect(config?.mcp?.['oc-to-remove']).toBeUndefined();
    });

    it('should handle removing non-existent server gracefully', async () => {
      await expect(adapter.removeExtension('non-existent')).resolves.not.toThrow();
    });

    it('should handle when opencode not configured', async () => {
      const adapterNoConfig = new OpenCodeAdapter({
        ...env.config,
        agents: {},
      });

      await expect(adapterNoConfig.removeExtension('test')).resolves.not.toThrow();
    });
  });

  describe('removeExtension() - Skills (symlinks)', () => {
    it('should remove symlink', async () => {
      const tempSkillDir = join(env.rootDir, 'temp-skills');
      const sourceSkill = createTestSkill(tempSkillDir, 'skill-to-unlink');
      await adapter.addExtension({
        name: 'skill-to-unlink',
        type: 'skill',
        agent: 'opencode',
        path: sourceSkill,
      });

      const linkPath = env.paths.opencode.skills + '/skill-to-unlink';
      expect(existsSync(linkPath)).toBe(true);

      await adapter.removeExtension('skill-to-unlink');

      expect(existsSync(linkPath)).toBe(false);
    });
  });

  describe('listExtensions()', () => {
    it('should list MCP servers from opencode.json', async () => {
      adapter.writeOpenCodeConfig({
        mcp: { 'oc-list-mcp': { type: 'remote', url: 'https://list.example.com' } },
      });

      const extensions = await adapter.listExtensions();

      const mcpExt = extensions.find(e => e.name === 'oc-list-mcp' && e.type === 'mcp');
      expect(mcpExt).toBeDefined();
      expect(mcpExt?.agent).toBe('opencode');
    });

    it('should list skills from skills directory', async () => {
      createTestSkill(env.paths.opencode.skills, 'oc-listable-skill');

      const extensions = await adapter.listExtensions();

      const skillExt = extensions.find(e => e.name === 'oc-listable-skill' && e.type === 'skill');
      expect(skillExt).toBeDefined();
      expect(skillExt?.agent).toBe('opencode');
    });

    it('should return empty array when no extensions exist', async () => {
      const envEmpty = createTestEnvironment();
      const adapterEmpty = new OpenCodeAdapter({
        ...envEmpty.config,
        agents: {
          'opencode': {
            enabled: true,
            configPath: '/non/existent/skills.yaml',
            skillsPath: '/non/existent/skills',
          },
        },
      });

      const extensions = await adapterEmpty.listExtensions();

      expect(extensions).toEqual([]);
      envEmpty.cleanup();
    });
  });

  describe('getAgentInfo()', () => {
    it('should return agent info with extensions', async () => {
      createTestSkill(env.paths.opencode.skills, 'oc-info-skill');

      const info = await adapter.getAgentInfo();

      expect(info.type).toBe('opencode');
      expect(info.name).toBe('OpenCode');
      expect(info.installed).toBe(true);
      expect(info.configPath).toBe(env.paths.opencode.config);
      expect(info.skillsPath).toBe(env.paths.opencode.skills);
      expect(info.extensions.length).toBeGreaterThan(0);
    });

    it('should return not installed when opencode not configured', async () => {
      const adapterNoConfig = new OpenCodeAdapter({
        ...env.config,
        agents: {},
      });

      const info = await adapterNoConfig.getAgentInfo();

      expect(info.installed).toBe(false);
      expect(info.configPath).toBe('');
      expect(info.skillsPath).toBe('');
    });
  });

  describe('isSymlink()', () => {
    it('should return true for symlinks', () => {
      const sourceSkill = createTestSkill(env.paths.opencode.skills, 'symlink-test-source');
      const linkPath = env.paths.opencode.skills + '/symlink-test';
      symlinkSync(sourceSkill, linkPath);

      expect(adapter.isSymlink(linkPath)).toBe(true);
    });

    it('should return false for directories', () => {
      const dirPath = env.paths.opencode.skills + '/regular-dir';
      mkdirSync(dirPath);

      expect(adapter.isSymlink(dirPath)).toBe(false);
    });

    it('should return false for non-existent paths', () => {
      expect(adapter.isSymlink('/non/existent')).toBe(false);
    });
  });

  describe('isDirectory()', () => {
    it('should return true for directories', () => {
      const dirPath = env.paths.opencode.skills + '/test-dir';
      mkdirSync(dirPath);

      expect(adapter.isDirectory(dirPath)).toBe(true);
    });

    it('should return false for files', () => {
      const filePath = env.paths.opencode.skills + '/test-file.md';
      writeFileSync(filePath, '# Test');

      expect(adapter.isDirectory(filePath)).toBe(false);
    });
  });

  describe('isFile()', () => {
    it('should return true for files', () => {
      const filePath = env.paths.opencode.skills + '/test-file.md';
      writeFileSync(filePath, '# Test');

      expect(adapter.isFile(filePath)).toBe(true);
    });

    it('should return false for directories', () => {
      const dirPath = env.paths.opencode.skills + '/test-dir';
      mkdirSync(dirPath);

      expect(adapter.isFile(dirPath)).toBe(false);
    });
  });
});
