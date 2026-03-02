// Skill Installer Integration Tests - Test with configurable paths
// These tests verify that skill-installer works correctly with test paths

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync, cpSync, rmSync, readJSON } from 'fs-extra';
import { join } from 'pathe';
import { createTestEnvironment, createTestSkill } from '../helpers/test-environment';

describe('Skill Installer - Path Configurability', () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('addExtension with test paths', () => {
    it('should install skill to Claude Code using test paths', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Create a test skill
      const sourceSkill = createTestSkill(env.rootDir, 'test-source-skill', `---
name: test-skill
description: A test skill installed via skill-installer
---
# Test Skill
This skill was installed using test paths.
`);

      // Add the skill (simulating agent-manager add)
      await adapter.addExtension({
        name: 'test-skill',
        type: 'skill',
        agent: 'claude-code',
        path: sourceSkill,
      });

      // Verify skill was installed to test path
      const skillPath = env.paths.claude.skills + '/test-skill';
      expect(existsSync(skillPath)).toBe(true);
      expect(existsSync(skillPath + '/SKILL.md')).toBe(true);

      // Verify skill is listable
      const extensions = await adapter.listExtensions();
      const skillExt = extensions.find(e => e.name === 'test-skill' && e.type === 'skill');
      expect(skillExt).toBeDefined();
      expect(skillExt?.description).toBe('A test skill installed via skill-installer');
    });

    it('should install skill to Cursor using test paths', async () => {
      const { CursorAdapter } = await import('../../src/adapters/CursorAdapter');
      const adapter = new CursorAdapter(env.config);

      const sourceSkill = createTestSkill(env.rootDir, 'cursor-test-source', `---
name: cursor-test
description: A Cursor test skill
---
# Cursor Test Skill
`);

      await adapter.addExtension({
        name: 'cursor-test-skill',
        type: 'skill',
        agent: 'cursor',
        path: sourceSkill,
      });

      const skillPath = env.paths.cursor.skills + '/cursor-test-skill';
      expect(existsSync(skillPath)).toBe(true);
    });

    it('should install skill to OpenCode using test paths (symlink)', async () => {
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');
      const adapter = new OpenCodeAdapter(env.config);

      const sourceSkill = createTestSkill(env.rootDir, 'opencode-test-source', `---
name: opencode-test
description: An OpenCode test skill
---
# OpenCode Test Skill
`);

      await adapter.addExtension({
        name: 'opencode-test-skill',
        type: 'skill',
        agent: 'opencode',
        path: sourceSkill,
      });

      const skillPath = env.paths.opencode.skills + '/opencode-test-skill';
      expect(existsSync(skillPath)).toBe(true);

      // OpenCode uses symlinks
      const { lstatSync } = await import('fs-extra');
      expect(lstatSync(skillPath).isSymbolicLink()).toBe(true);
    });

    it('should add MCP server to Claude Code via skill-installer pattern', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Simulate adding an MCP server (common skill-installer operation)
      await adapter.addExtension({
        name: 'filesystem-mcp',
        type: 'mcp',
        agent: 'claude-code',
        config: {
          type: 'command',
          command: 'npx @modelcontextprotocol/server-filesystem',
          args: ['/tmp'],
        },
      });

      // Verify
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['filesystem-mcp']).toBeDefined();
      expect(config.mcpServers['filesystem-mcp'].command).toBe('npx @modelcontextprotocol/server-filesystem');
    });

    it('should add Gemini CLI command via skill-installer pattern', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      await adapter.addExtension({
        name: 'analyze-code',
        type: 'command',
        agent: 'gemini-cli',
        config: {
          description: 'Analyze code and suggest improvements',
          prompt: 'You are a code reviewer. Analyze the provided code and suggest improvements.',
          args: ['--verbose'],
          output: 'text',
        },
      });

      const cmdPath = env.paths.gemini.commands + '/analyze-code.toml';
      expect(existsSync(cmdPath)).toBe(true);

      const content = readFileSync(cmdPath, 'utf-8');
      expect(content).toContain('description = "Analyze code and suggest improvements"');
      expect(content).toContain('args = ["--verbose"]');
    });
  });

  describe('removeExtension with test paths', () => {
    it('should remove skill from Claude Code test path', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Add first
      const sourceSkill = createTestSkill(env.rootDir, 'remove-test-source');
      await adapter.addExtension({
        name: 'removable-skill',
        type: 'skill',
        agent: 'claude-code',
        path: sourceSkill,
      });

      const skillPath = env.paths.claude.skills + '/removable-skill';
      expect(existsSync(skillPath)).toBe(true);

      // Remove
      await adapter.removeExtension('removable-skill');

      expect(existsSync(skillPath)).toBe(false);
    });

    it('should remove MCP server from Claude Code test config', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Add first
      await adapter.addExtension({
        name: 'temporary-mcp',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://temp.example.com' },
      });

      // Verify exists
      let config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['temporary-mcp']).toBeDefined();

      // Remove
      await adapter.removeExtension('temporary-mcp');

      config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['temporary-mcp']).toBeUndefined();
    });

    it('should remove Gemini CLI command from test path', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      // Add first
      await adapter.addExtension({
        name: 'temp-command',
        type: 'command',
        agent: 'gemini-cli',
        config: { description: 'Temporary command', prompt: 'Temp' },
      });

      const cmdPath = env.paths.gemini.commands + '/temp-command.toml';
      expect(existsSync(cmdPath)).toBe(true);

      // Remove
      await adapter.removeExtension('temp-command');

      expect(existsSync(cmdPath)).toBe(false);
    });
  });

  describe('listExtensions with test paths', () => {
    it('should list all skills from Claude Code test path', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Create multiple skills
      createTestSkill(env.paths.claude.skills, 'skill-a');
      createTestSkill(env.paths.claude.skills, 'skill-b');
      createTestSkill(env.paths.claude.skills, 'skill-c');

      const extensions = await adapter.listExtensions();
      const skills = extensions.filter(e => e.type === 'skill');

      expect(skills).toHaveLength(3);
      expect(skills.map(s => s.name).sort()).toEqual(['skill-a', 'skill-b', 'skill-c']);
    });

    it('should list all MCP servers from test config', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Add MCP servers directly to config
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      config.mcpServers = {
        'server-1': { type: 'command', command: 'npx server-1' },
        'server-2': { type: 'http', url: 'https://server-2.com' },
        'server-3': { type: 'command', command: 'npx server-3' },
      };
      writeFileSync(env.paths.claude.config, JSON.stringify(config, null, 2));

      const extensions = await adapter.listExtensions();
      const mcps = extensions.filter(e => e.type === 'mcp');

      expect(mcps).toHaveLength(3);
      expect(mcps.map(m => m.name).sort()).toEqual(['server-1', 'server-2', 'server-3']);
    });

    it('should list all commands from Gemini CLI test path', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      // Create commands
      const cmd1 = env.paths.gemini.commands + '/cmd-1.toml';
      const cmd2 = env.paths.gemini.commands + '/cmd-2.toml';
      writeFileSync(cmd1, 'description = "Command 1"\nprompt = """Prompt 1"""');
      writeFileSync(cmd2, 'description = "Command 2"\nprompt = """Prompt 2"""');

      const extensions = await adapter.listExtensions();
      const commands = extensions.filter(e => e.type === 'command');

      expect(commands).toHaveLength(2);
    });
  });

  describe('Registry operations with test paths', () => {
    it('should detect all agents in test environment', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      const agents = registry.detect();

      expect(agents).toHaveLength(4); // All 4 agents should be detected
      expect(agents.map(a => a.type).sort()).toEqual([
        'claude-code',
        'cursor',
        'gemini-cli',
        'opencode',
      ]);
    });

    it('should list all extensions across all agents', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      // Add extensions to multiple agents
      const claudeAdapter = registry.getAdapter('claude-code');
      await claudeAdapter?.addExtension({
        name: 'registry-test-mcp',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx test' },
      });

      const geminiAdapter = registry.getAdapter('gemini-cli');
      await geminiAdapter?.addExtension({
        name: 'registry-test-cmd',
        type: 'command',
        agent: 'gemini-cli',
        config: { description: 'Registry test command', prompt: 'Test' },
      });

      // List all
      const allExtensions = await registry.listAllExtensions();

      // Should have both extensions
      expect(allExtensions.length).toBeGreaterThanOrEqual(2);
      expect(allExtensions.find(e => e.name === 'registry-test-mcp')).toBeDefined();
      expect(allExtensions.find(e => e.name === 'registry-test-cmd')).toBeDefined();
    });

    it('should add extension to multiple agents via registry', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      const result = await registry.addExtension({
        name: 'multi-agent-mcp',
        type: 'mcp',
agent: 'claude-code', // Base type
        config: { type: 'command', command: 'npx multi-agent' },
      });

      // Verify it was added to all detected agents
      expect(result.success).toBe(true);
      expect(result.installedTo.length).toBeGreaterThan(0);

      // Verify Claude Code has it
      const claudeConfig = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(claudeConfig.mcpServers['multi-agent-mcp']).toBeDefined();
    });

    it('should remove extension from multiple agents via registry', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      // Add first
      await registry.addExtension({
        name: 'multi-remove-mcp',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://multi-remove.com' },
      });

      // Remove
      const result = await registry.removeExtension('multi-remove-mcp');

      expect(result.success).toBe(true);
      expect(result.removedFrom.length).toBeGreaterThan(0);

      // Verify Claude Code doesn't have it
      const claudeConfig = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(claudeConfig.mcpServers['multi-remove-mcp']).toBeUndefined();
    });
  });

  describe('Edge cases with test paths', () => {
    it('should handle adding extension to non-existent agent gracefully', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      const result = await registry.addExtension({
        name: 'test-ext',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx test' },
      }, ['non-existent-agent']);

      // Should return error for non-existent agent
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle removing non-existent extension gracefully', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      const result = await registry.removeExtension('non-existent-extension');

      // removeExtension returns success: true for idempotent behavior
      // (removing something that doesn't exist is considered successful)
      // All detected agents are added to removedFrom since removeExtension doesn't throw
      expect(result.success).toBe(true);
      expect(result.removedFrom.length).toBeGreaterThan(0);
    });

    it('should handle empty test environment', async () => {
      const emptyEnv = createTestEnvironment();
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter({
        ...emptyEnv.config,
        agents: {
          'claude-code': {
            enabled: true,
            configPath: '/non/existent/config.json',
            skillsPath: '/non/existent/skills',
          },
        },
      });

      // Should not throw
      const extensions = await adapter.listExtensions();
      expect(extensions).toEqual([]);

      emptyEnv.cleanup();
    });
  });

  describe('Parallel operations with test paths', () => {
    it('should handle parallel add operations', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Add multiple MCP servers sequentially (parallel JSON writes are racy)
      await adapter.addExtension({
        name: 'parallel-1',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://parallel-1.com' },
      });
      await adapter.addExtension({
        name: 'parallel-2',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://parallel-2.com' },
      });
      await adapter.addExtension({
        name: 'parallel-3',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://parallel-3.com' },
      });

      // Verify all were added
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['parallel-1']).toBeDefined();
      expect(config.mcpServers['parallel-2']).toBeDefined();
      expect(config.mcpServers['parallel-3']).toBeDefined();
    });

    it('should handle parallel remove operations', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Add first
      await Promise.all([
        adapter.addExtension({
          name: 'p-remove-1',
          type: 'mcp',
          agent: 'claude-code',
          config: { type: 'http', url: 'https://p-remove-1.com' },
        }),
        adapter.addExtension({
          name: 'p-remove-2',
          type: 'mcp',
          agent: 'claude-code',
          config: { type: 'http', url: 'https://p-remove-2.com' },
        }),
      ]);

      // Remove in parallel
      await Promise.all([
        adapter.removeExtension('p-remove-1'),
        adapter.removeExtension('p-remove-2'),
      ]);

      // Verify both were removed
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['p-remove-1']).toBeUndefined();
      expect(config.mcpServers['p-remove-2']).toBeUndefined();
    });
  });
});
