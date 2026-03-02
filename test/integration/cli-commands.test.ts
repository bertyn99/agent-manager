// CLI Integration Tests - Test commands end-to-end with temp directories

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readJSON } from 'fs-extra';
import { createTestEnvironment } from '../helpers/test-environment';

describe('CLI Integration - End-to-End Tests', () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('mcp add command - Claude Code', () => {
    it('should add MCP server to Claude Code config', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      await adapter.addExtension({
        name: 'cli-test-server',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx cli-test' },
      });

      // Verify
      expect(existsSync(env.paths.claude.config)).toBe(true);
      const configContent = readFileSync(env.paths.claude.config, 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.mcpServers['cli-test-server']).toBeDefined();
      expect(config.mcpServers['cli-test-server'].command).toBe('npx cli-test');
    });

    it('should add HTTP MCP server to Claude Code', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      await adapter.addExtension({
        name: 'http-mcp',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://mcp.cli-test.com' },
      });

      expect(existsSync(env.paths.claude.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['http-mcp'].url).toBe('https://mcp.cli-test.com');
    });
  });

  describe('mcp add command - Cursor', () => {
    it('should add MCP server to Cursor config', async () => {
      const { CursorAdapter } = await import('../../src/adapters/CursorAdapter');
      const adapter = new CursorAdapter(env.config);

      await adapter.addExtension({
        name: 'cursor-cli-server',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'command', command: 'npx cursor-mcp-cli' },
      });

      expect(existsSync(env.paths.cursor.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.cursor.config, 'utf-8'));
      expect(config.mcpServers['cursor-cli-server']).toBeDefined();
    });
  });

  describe('mcp add command - Gemini CLI', () => {
    it('should add MCP server to Gemini CLI config', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      await adapter.addExtension({
        name: 'gemini-cli-server',
        type: 'mcp',
        agent: 'gemini-cli',
        config: { type: 'command', command: 'npx gemini-mcp-cli' },
      });

      expect(existsSync(env.paths.gemini.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.gemini.config, 'utf-8'));
      expect(config.mcpServers['gemini-cli-server']).toBeDefined();
    });
  });

  describe('mcp add command - OpenCode', () => {
    it('should add MCP server to OpenCode config', async () => {
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');
      const adapter = new OpenCodeAdapter(env.config);

      await adapter.addExtension({
        name: 'opencode-cli-server',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://mcp.opencode-cli.com' },
      });

      const config = adapter.readOpenCodeConfig();
      expect(config?.mcp?.['opencode-cli-server']).toBeDefined();
      expect(config?.mcp?.['opencode-cli-server'].type).toBe('remote');
    });
  });

  describe('mcp remove command', () => {
    it('should remove MCP server from Claude Code', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      // Add first
      await adapter.addExtension({
        name: 'remove-me',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'http', url: 'https://remove.me' },
      });

      // Remove
      await adapter.removeExtension('remove-me');

      const config = JSON.parse(readFileSync(env.paths.claude.config, 'utf-8'));
      expect(config.mcpServers['remove-me']).toBeUndefined();
    });

    it('should remove MCP server from OpenCode', async () => {
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');
      const adapter = new OpenCodeAdapter(env.config);

      // Add first
      await adapter.addExtension({
        name: 'oc-remove-me',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://oc-remove.me' },
      });

      // Remove
      await adapter.removeExtension('oc-remove-me');

      const config = adapter.readOpenCodeConfig();
      expect(config?.mcp?.['oc-remove-me']).toBeUndefined();
    });
  });

  describe('mcp list command - should list all MCP servers', () => {
    it('should list MCP servers from all configured agents', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const { CursorAdapter } = await import('../../src/adapters/CursorAdapter');
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');

      const claudeAdapter = new ClaudeAdapter(env.config);
      const cursorAdapter = new CursorAdapter(env.config);
      const geminiAdapter = new GeminiAdapter(env.config);
      const opencodeAdapter = new OpenCodeAdapter(env.config);

      await claudeAdapter.addExtension({
        name: 'list-test-claude',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx claude-list' },
      });

      await cursorAdapter.addExtension({
        name: 'list-test-cursor',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'http', url: 'https://cursor-list.com' },
      });

      await geminiAdapter.addExtension({
        name: 'list-test-gemini',
        type: 'mcp',
        agent: 'gemini-cli',
        config: { type: 'command', command: 'npx gemini-list' },
      });

      await opencodeAdapter.addExtension({
        name: 'list-test-opencode',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://opencode-list.com' },
      });

      // List all extensions from each adapter
      const claudeExts = await claudeAdapter.listExtensions();
      const cursorExts = await cursorAdapter.listExtensions();
      const geminiExts = await geminiAdapter.listExtensions();
      const opencodeExts = await opencodeAdapter.listExtensions();

      // Verify
      expect(claudeExts.find(e => e.name === 'list-test-claude')).toBeDefined();
      expect(cursorExts.find(e => e.name === 'list-test-cursor')).toBeDefined();
      expect(geminiExts.find(e => e.name === 'list-test-gemini')).toBeDefined();
      expect(opencodeExts.find(e => e.name === 'list-test-opencode')).toBeDefined();
    });
  });

  describe('command add command - Gemini CLI', () => {
    it('should add command to Gemini CLI', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      await adapter.addExtension({
        name: 'test-cmd',
        type: 'command',
        agent: 'gemini-cli',
        config: {
          description: 'Test command from CLI',
          prompt: 'You are a test command',
        },
      });

      const cmdPath = env.paths.gemini.commands + '/test-cmd.toml';
      expect(existsSync(cmdPath)).toBe(true);

      const content = readFileSync(cmdPath, 'utf-8');
      expect(content).toContain('description = "Test command from CLI"');
    });
  });

  describe('command list command - Gemini CLI', () => {
    it('should list Gemini CLI commands', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      // Add some commands
      await adapter.addExtension({
        name: 'cmd-1',
        type: 'command',
        agent: 'gemini-cli',
        config: { description: 'Command 1', prompt: 'Prompt 1' },
      });

      await adapter.addExtension({
        name: 'cmd-2',
        type: 'command',
        agent: 'gemini-cli',
        config: { description: 'Command 2', prompt: 'Prompt 2' },
      });

      const extensions = await adapter.listExtensions();
      const commands = extensions.filter(e => e.type === 'command');

      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.name).sort()).toEqual(['cmd-1', 'cmd-2']);
    });
  });

  describe('detect command', () => {
    it('should detect all configured agents as installed', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      const agents = registry.detect();

      expect(agents.find(a => a.type === 'claude-code')).toBeDefined();
      expect(agents.find(a => a.type === 'cursor')).toBeDefined();
      expect(agents.find(a => a.type === 'gemini-cli')).toBeDefined();
      expect(agents.find(a => a.type === 'opencode')).toBeDefined();

      // All should be installed since we created the config files
      for (const agent of agents) {
        expect(agent.installed).toBe(true);
      }
    });
  });

  describe('list command', () => {
    it('should list all extensions across all agents', async () => {
      const { createAgentRegistry } = await import('../../src/adapters/index');
      const registry = createAgentRegistry(env.config);

      // Add some extensions
      const claudeAdapter = registry.getAdapter('claude-code');
      await claudeAdapter?.addExtension({
        name: 'list-test-mcp',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'command', command: 'npx test' },
      });

      // List all extensions
      const allExtensions = await registry.listAllExtensions();

      // Should have at least the MCP server we added
      const mcpExt = allExtensions.find(e => e.name === 'list-test-mcp');
      expect(mcpExt).toBeDefined();
      expect(mcpExt?.agent).toBe('claude-code');
    });
  });

  describe('Multiple agent operations in sequence', () => {
    it('should handle add/remove cycle across all agents', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const { CursorAdapter } = await import('../../src/adapters/CursorAdapter');
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');

      const claude = new ClaudeAdapter(env.config);
      const cursor = new CursorAdapter(env.config);
      const gemini = new GeminiAdapter(env.config);
      const opencode = new OpenCodeAdapter(env.config);

      // Add to all
      await Promise.all([
        claude.addExtension({
          name: 'cycle-test',
          type: 'mcp',
          agent: 'claude-code',
          config: { type: 'http', url: 'https://cycle.claude' },
        }),
        cursor.addExtension({
          name: 'cycle-test',
          type: 'mcp',
          agent: 'cursor',
          config: { type: 'http', url: 'https://cycle.cursor' },
        }),
        gemini.addExtension({
          name: 'cycle-test',
          type: 'mcp',
          agent: 'gemini-cli',
          config: { type: 'http', url: 'https://cycle.gemini' },
        }),
        opencode.addExtension({
          name: 'cycle-test',
          type: 'mcp',
          agent: 'opencode',
          config: { type: 'http', url: 'https://cycle.opencode' },
        }),
      ]);

      // Verify all have it
      const [claudeExts, cursorExts, geminiExts, opencodeExts] = await Promise.all([
        claude.listExtensions(),
        cursor.listExtensions(),
        gemini.listExtensions(),
        opencode.listExtensions(),
      ]);

      expect(claudeExts.find(e => e.name === 'cycle-test')).toBeDefined();
      expect(cursorExts.find(e => e.name === 'cycle-test')).toBeDefined();
      expect(geminiExts.find(e => e.name === 'cycle-test')).toBeDefined();
      expect(opencodeExts.find(e => e.name === 'cycle-test')).toBeDefined();

      // Remove from all
      await Promise.all([
        claude.removeExtension('cycle-test'),
        cursor.removeExtension('cycle-test'),
        gemini.removeExtension('cycle-test'),
        opencode.removeExtension('cycle-test'),
      ]);

      // Verify none have it
      const [claudeExts2, cursorExts2, geminiExts2, opencodeExts2] = await Promise.all([
        claude.listExtensions(),
        cursor.listExtensions(),
        gemini.listExtensions(),
        opencode.listExtensions(),
      ]);

      expect(claudeExts2.find(e => e.name === 'cycle-test')).toBeUndefined();
      expect(cursorExts2.find(e => e.name === 'cycle-test')).toBeUndefined();
      expect(geminiExts2.find(e => e.name === 'cycle-test')).toBeUndefined();
      expect(opencodeExts2.find(e => e.name === 'cycle-test')).toBeUndefined();
    });
  });
});

describe('CLI Error Handling', () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('Invalid transport type', () => {
    it('should reject invalid transport type for Claude Code', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      await expect(adapter.addExtension({
        name: 'invalid',
        type: 'mcp',
        agent: 'claude-code',
        config: { type: 'invalid-transport' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });

    it('should reject invalid transport type for Cursor', async () => {
      const { CursorAdapter } = await import('../../src/adapters/CursorAdapter');
      const adapter = new CursorAdapter(env.config);

      await expect(adapter.addExtension({
        name: 'invalid',
        type: 'mcp',
        agent: 'cursor',
        config: { type: 'invalid-transport' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });

    it('should reject invalid transport type for Gemini CLI', async () => {
      const { GeminiAdapter } = await import('../../src/adapters/GeminiAdapter');
      const adapter = new GeminiAdapter(env.config);

      await expect(adapter.addExtension({
        name: 'invalid',
        type: 'mcp',
        agent: 'gemini-cli',
        config: { type: 'invalid-transport' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });

    it('should reject invalid transport type for OpenCode', async () => {
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');
      const adapter = new OpenCodeAdapter(env.config);

      await expect(adapter.addExtension({
        name: 'invalid',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'invalid-transport' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });
  });

  describe('Missing extension config', () => {
    it('should throw error when adding extension without config', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      await expect(adapter.addExtension({
        name: 'no-config',
        type: 'mcp',
        agent: 'claude-code',
        config: undefined as any,
      })).rejects.toThrow();
    });

    it('should throw error when adding skill without path', async () => {
      const { ClaudeAdapter } = await import('../../src/adapters/ClaudeAdapter');
      const adapter = new ClaudeAdapter(env.config);

      await expect(adapter.addExtension({
        name: 'no-path',
        type: 'skill',
        agent: 'claude-code',
        path: undefined as any,
      })).rejects.toThrow();
    });
  });

  describe('Non-existent agent', () => {
    it('should handle gracefully when agent not configured', async () => {
      const { OpenCodeAdapter } = await import('../../src/adapters/OpenCodeAdapter');
      const adapter = new OpenCodeAdapter({
        ...env.config,
        agents: {},
      });

      // Should throw or handle gracefully
      await expect(adapter.addExtension({
        name: 'test',
        type: 'mcp',
        agent: 'opencode',
        config: { type: 'http', url: 'https://test.com' },
      })).rejects.toThrow('OpenCode is not configured');
    });
  });
});
