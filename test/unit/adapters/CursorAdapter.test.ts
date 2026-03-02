// CursorAdapter Unit Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs-extra';
import { join } from 'pathe';
import { CursorAdapter } from '../../../src/adapters/CursorAdapter';
import { createMockConfig } from '../../helpers/mock-config';
import { createTestEnvironment, createTestSkill, addMcpToConfig } from '../../helpers/test-environment';

describe('CursorAdapter', () => {
  const config = createMockConfig();
  const adapter = new CursorAdapter(config);

  describe('parseFrontmatter', () => {
    it('should parse YAML frontmatter correctly', () => {
      const content = `---
name: test-skill
description: A test skill
version: 1.0.0
---
# Test Skill
`;

      const frontmatter = adapter.parseFrontmatter(content);

      expect(frontmatter.name).toBe('test-skill');
      expect(frontmatter.description).toBe('A test skill');
      expect(frontmatter.version).toBe('1.0.0');
    });

    it('should return empty object for content without frontmatter', () => {
      const content = '# Test Command\nNo frontmatter here.';

      const frontmatter = adapter.parseFrontmatter(content);

      expect(frontmatter).toEqual({});
    });

    it('should handle content with only --- markers but no content', () => {
      const content = `---
name: test
---
`;
      
      const frontmatter = adapter.parseFrontmatter(content);
      
      expect(frontmatter.name).toBe('test');
    });
  });

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('cursor');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('Cursor');
    });
  });
});

describe('CursorAdapter - File Operations', () => {
  let env: ReturnType<typeof createTestEnvironment>;
  let adapter: CursorAdapter;

  beforeEach(() => {
    env = createTestEnvironment();
    adapter = new CursorAdapter(env.config);
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('detect()', () => {
    it('should detect Cursor when config exists', () => {
      expect(adapter.detect()).toBe(true);
    });

    it('should not detect when config path does not exist', () => {
      const adapterNoCursor = new CursorAdapter({
        ...env.config,
        agents: {
          'cursor': {
            enabled: true,
            configPath: '/non/existent/path/mcp.json',
            skillsPath: '/non/existent/path/skills',
          },
        },
      });
      expect(adapterNoCursor.detect()).toBe(false);
    });
  });

  describe('getSkillsPath()', () => {
    it('should return skills path from config', () => {
      expect(adapter.getSkillsPath()).toBe(env.paths.cursor.skills);
    });
  });

  describe('addExtension() - MCP servers', () => {
    it('should add MCP server to config', async () => {
      await adapter.addExtension({
        name: 'cursor-server',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'command', command: 'npx cursor-mcp' },
      });

      expect(existsSync(env.paths.cursor.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.cursor.config, 'utf-8'));
      expect(config.mcpServers['cursor-server']).toBeDefined();
      expect(config.mcpServers['cursor-server'].command).toBe('npx cursor-mcp');
    });

    it('should add HTTP MCP server to config', async () => {
      await adapter.addExtension({
        name: 'cursor-http',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'http', url: 'https://mcp.cursor.example.com' },
      });

      expect(existsSync(env.paths.cursor.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.cursor.config, 'utf-8'));
      expect(config.mcpServers['cursor-http']).toBeDefined();
      expect(config.mcpServers['cursor-http'].url).toBe('https://mcp.cursor.example.com');
    });

    it('should update existing MCP server', async () => {
      addMcpToConfig(env.paths.cursor.config, 'existing-server', {
        type: 'command',
        command: 'npx old-command',
      });

      await adapter.addExtension({
        name: 'existing-server',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'command', command: 'npx new-command' },
      });

      const config = JSON.parse(readFileSync(env.paths.cursor.config, 'utf-8'));
      expect(config.mcpServers['existing-server'].command).toBe('npx new-command');
    });

    it('should throw error for invalid transport type', async () => {
      await expect(adapter.addExtension({
        name: 'invalid-server',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'invalid' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });
  });

  describe('addExtension() - Skills', () => {
    it('should add skill to skills directory', async () => {
      const sourceSkill = createTestSkill(env.paths.cursor.skills, 'source-skill', `---
name: cursor-skill
description: A Cursor skill
---
# Cursor Skill
`);

      await adapter.addExtension({
        name: 'cursor-test-skill',
        type: 'skill',
        agent: 'cursor',
        path: sourceSkill,
      });

      const skillPath = env.paths.cursor.skills + '/cursor-test-skill';
      expect(existsSync(skillPath)).toBe(true);
      expect(existsSync(skillPath + '/SKILL.md')).toBe(true);
    });
  });

  describe('removeExtension() - MCP servers', () => {
    it('should remove MCP server from config', async () => {
      addMcpToConfig(env.paths.cursor.config, 'to-remove', {
        type: 'http',
        url: 'https://remove.example.com',
      });

      await adapter.removeExtension('to-remove');

      const config = JSON.parse(readFileSync(env.paths.cursor.config, 'utf-8'));
      expect(config.mcpServers['to-remove']).toBeUndefined();
    });

    it('should handle removing non-existent server gracefully', async () => {
      await expect(adapter.removeExtension('non-existent')).resolves.not.toThrow();
    });
  });

  describe('removeExtension() - Skills', () => {
    it('should remove skill from skills directory', async () => {
      const tempSkillDir = join(env.rootDir, 'temp-skills');
      const sourceSkill = createTestSkill(tempSkillDir, 'cursor-skill-to-remove');
      await adapter.addExtension({
        name: 'cursor-skill-to-remove',
        type: 'skill',
        agent: 'cursor',
        path: sourceSkill,
      });

      expect(existsSync(env.paths.cursor.skills + '/cursor-skill-to-remove')).toBe(true);

      await adapter.removeExtension('cursor-skill-to-remove');

      expect(existsSync(env.paths.cursor.skills + '/cursor-skill-to-remove')).toBe(false);
    });
  });

  describe('listExtensions()', () => {
    it('should list MCP servers from config', async () => {
addMcpToConfig(env.paths.cursor.config, 'cursor-listed', {
        type: 'command',
        command: 'npx cursor-list',
      });

      const extensions = await adapter.listExtensions();

      const mcpExt = extensions.find(e => e.name === 'cursor-listed' && e.type === 'mcp');
      expect(mcpExt).toBeDefined();
      expect(mcpExt?.agent).toBe('cursor');
    });

    it('should list skills from skills directory', async () => {
      createTestSkill(env.paths.cursor.skills, 'cursor-listable-skill');

      const extensions = await adapter.listExtensions();

      const skillExt = extensions.find(e => e.name === 'cursor-listable-skill' && e.type === 'skill');
      expect(skillExt).toBeDefined();
      expect(skillExt?.agent).toBe('cursor');
    });

    it('should return empty array when no extensions exist', async () => {
      const envEmpty = createTestEnvironment();
      const adapterEmpty = new CursorAdapter({
        ...envEmpty.config,
        agents: {
          'cursor': {
            enabled: true,
            configPath: '/non/existent/mcp.json',
            skillsPath: '/non/existent/skills',
          },
        },
      });

      const extensions = await adapterEmpty.listExtensions();

      expect(extensions).toEqual([]);
      envEmpty.cleanup();
    });
  });

  describe('getAgentInfoSync()', () => {
    it('should return agent info with correct paths', () => {
      const info = adapter.getAgentInfoSync();

      expect(info.type).toBe('cursor');
      expect(info.name).toBe('Cursor');
      expect(info.installed).toBe(true);
      expect(info.configPath).toBe(env.paths.cursor.config);
      expect(info.skillsPath).toBe(env.paths.cursor.skills);
    });
  });
});
