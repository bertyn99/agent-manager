// ClaudeAdapter Unit Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs-extra';
import { join } from 'pathe';
import { ClaudeAdapter } from '../../../src/adapters/ClaudeAdapter';
import { createMockConfig } from '../../helpers/mock-config';
import { createTestEnvironment, createTestSkill, addMcpToConfig } from '../../helpers/test-environment';

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

describe('ClaudeAdapter - File Operations', () => {
  let env: ReturnType<typeof createTestEnvironment>;
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    env = createTestEnvironment();
    adapter = new ClaudeAdapter(env.config);
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('detect()', () => {
    it('should detect Claude Code when config exists', () => {
      expect(adapter.detect()).toBe(true);
    });

    it('should not detect when config path does not exist', () => {
      const envNoClaude = createTestEnvironment();
      envNoClaude.cleanup();
      const adapterNoClaude = new ClaudeAdapter({
        ...envNoClaude.config,
        agents: {
          'claude-code': {
            enabled: true,
            configPath: '/non/existent/path/settings.json',
            skillsPath: '/non/existent/path/skills',
          },
        },
      });
      expect(adapterNoClaude.detect()).toBe(false);
    });
  });

  describe('getSkillsPath()', () => {
    it('should return skills path from config', () => {
      expect(adapter.getSkillsPath()).toBe(env.paths.claude.skills);
    });
  });

  describe('addExtension() - MCP servers', () => {
    it('should add MCP server to config', async () => {
      await adapter.addExtension({
        name: 'test-server',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx test' },
      });

      expect(existsSync(env.paths.claude.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['test-server']).toBeDefined();
      expect(config.mcpServers['test-server'].command).toBe('npx test');
    });

    it('should add HTTP MCP server to config', async () => {
      await adapter.addExtension({
        name: 'http-server',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://mcp.example.com' },
      });

      expect(existsSync(env.paths.claude.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['http-server']).toBeDefined();
      expect(config.mcpServers['http-server'].url).toBe('https://mcp.example.com');
    });

    it('should add multiple MCP servers', async () => {
      await adapter.addExtension({
        name: 'server-1',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx server-1' },
      });

      await adapter.addExtension({
        name: 'server-2',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://server-2.example.com' },
      });

      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['server-1']).toBeDefined();
      expect(config.mcpServers['server-2']).toBeDefined();
    });

    it('should throw error for invalid transport type', async () => {
      await expect(adapter.addExtension({
        name: 'invalid-server',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'invalid' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });
  });

  describe('addExtension() - Skills', () => {
    it('should add skill to skills directory', async () => {
      // Create a source skill
      const sourceSkill = createTestSkill(env.paths.claude.skills, 'source-skill', `---
name: source-skill
description: A source skill
---
# Source Skill
`);

      await adapter.addExtension({
        name: 'test-skill',
        type: 'skill',
        agent: 'claude-code',
        path: sourceSkill,
      });

      const skillPath = env.paths.claude.skills + '/test-skill';
      expect(existsSync(skillPath)).toBe(true);
      expect(existsSync(skillPath + '/SKILL.md')).toBe(true);
    });

    it('should replace existing skill', async () => {
      // Create initial skill
      const sourceSkill1 = createTestSkill(env.paths.claude.skills, 'skill1', `---
name: skill1
description: Version 1
---
# Skill 1 v1
`);
      await adapter.addExtension({
        name: 'replaceable-skill',
        type: 'skill',
        agent: 'claude-code',
        path: sourceSkill1,
      });

      // Create updated skill
      const sourceSkill2 = createTestSkill(env.paths.claude.skills, 'skill2', `---
name: replaceable-skill
description: Version 2
---
# Skill v2
`);

      await adapter.addExtension({
        name: 'replaceable-skill',
        type: 'skill',
        agent: 'claude-code',
        path: sourceSkill2,
      });

      const skillPath = env.paths.claude.skills + '/replaceable-skill';
      const content = readFileSync(skillPath + '/SKILL.md', 'utf-8');
      expect(content).toContain('Version 2');
    });
  });

  describe('removeExtension() - MCP servers', () => {
    it('should remove MCP server from config', async () => {
      // First add
      await adapter.addExtension({
        name: 'to-remove',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://test.com' },
      });

      // Then remove
      await adapter.removeExtension('to-remove');

      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['to-remove']).toBeUndefined();
    });

    it('should handle removing non-existent server gracefully', async () => {
      await expect(adapter.removeExtension('non-existent')).resolves.not.toThrow();
    });
  });

  describe('removeExtension() - Skills', () => {
    it('should remove skill from skills directory', async () => {
      // Create source skill in temp location (NOT in target skills dir)
      const tempSkillDir = join(env.rootDir, 'temp-skills');
      const sourceSkill = createTestSkill(tempSkillDir, 'to-remove-skill');
      await adapter.addExtension({
        name: 'to-remove-skill',
        type: 'skill',
        agent: 'claude-code',
        path: sourceSkill,
      });

      expect(existsSync(env.paths.claude.skills + '/to-remove-skill')).toBe(true);

      // Remove it
      await adapter.removeExtension('to-remove-skill');

      expect(existsSync(env.paths.claude.skills + '/to-remove-skill')).toBe(false);
    });
  });

  describe('listExtensions()', () => {
    it('should list MCP servers from config', async () => {
      addMcpToConfig(env.paths.claude.config, 'listed-server', {
        type: 'command',
        command: 'npx listed',
      });

      const extensions = await adapter.listExtensions();

      const mcpExt = extensions.find(e => e.name === 'listed-server' && e.type === 'mcp');
      expect(mcpExt).toBeDefined();
      expect(mcpExt?.agent).toBe('claude-code');
    });

    it('should list skills from skills directory', async () => {
      createTestSkill(env.paths.claude.skills, 'listable-skill');

      const extensions = await adapter.listExtensions();

      const skillExt = extensions.find(e => e.name === 'listable-skill' && e.type === 'skill');
      expect(skillExt).toBeDefined();
      expect(skillExt?.agent).toBe('claude-code');
    });

    it('should return empty array when no extensions exist', async () => {
      const envEmpty = createTestEnvironment();
      const adapterEmpty = new ClaudeAdapter(envEmpty.config);
      // Remove config file
      envEmpty.config.agents['claude-code'].configPath = '/non/existent/config.json';

      const extensions = await adapterEmpty.listExtensions();

      expect(extensions).toEqual([]);
      envEmpty.cleanup();
    });
  });

  describe('getAgentInfoSync()', () => {
    it('should return agent info with correct paths', () => {
      const info = adapter.getAgentInfoSync();

      expect(info.type).toBe('claude-code');
      expect(info.name).toBe('Claude Code');
      expect(info.installed).toBe(true);
      expect(info.configPath).toBe(env.paths.claude.config);
      expect(info.skillsPath).toBe(env.paths.claude.skills);
    });
  });
});
