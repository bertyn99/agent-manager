// GeminiAdapter Unit Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs-extra';
import { GeminiAdapter } from '../../../src/adapters/GeminiAdapter';
import { createMockConfig } from '../../helpers/mock-config';
import { createTestEnvironment, createGeminiCommand, addMcpToConfig } from '../../helpers/test-environment';

describe('GeminiAdapter', () => {
  const config = createMockConfig();
  const adapter = new GeminiAdapter(config);

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('gemini-cli');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('Gemini CLI');
    });
  });
});

describe('GeminiAdapter - File Operations', () => {
  let env: ReturnType<typeof createTestEnvironment>;
  let adapter: GeminiAdapter;

  beforeEach(() => {
    env = createTestEnvironment();
    adapter = new GeminiAdapter(env.config);
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('detect()', () => {
    it('should detect Gemini CLI when config exists', () => {
      expect(adapter.detect()).toBe(true);
    });

    it('should not detect when config path does not exist', () => {
      const adapterNoGemini = new GeminiAdapter({
        ...env.config,
        agents: {
          'gemini-cli': {
            enabled: true,
            configPath: '/non/existent/path/settings.json',
            skillsPath: '/non/existent/path/commands',
          },
        },
      });
      expect(adapterNoGemini.detect()).toBe(false);
    });
  });

  describe('listExtensions() - MCP servers', () => {
    it('should list MCP servers from config', async () => {
      addMcpToConfig(env.paths.gemini.config, 'gemini-mcp', {
        type: 'command',
        command: 'npx gemini-mcp',
      });

      const extensions = await adapter.listExtensions();

      const mcpExt = extensions.find(e => e.name === 'gemini-mcp' && e.type === 'mcp');
      expect(mcpExt).toBeDefined();
      expect(mcpExt?.agent).toBe('gemini-cli');
    });

    it('should return empty array when no MCP servers exist', async () => {
      const extensions = await adapter.listExtensions();
      expect(extensions.filter(e => e.type === 'mcp')).toEqual([]);
    });
  });

  describe('listExtensions() - Commands', () => {
    it('should list commands from commands directory', async () => {
      createGeminiCommand(env.paths.gemini.commands, 'test-command', 'Test prompt');

      const extensions = await adapter.listExtensions();

      const cmdExt = extensions.find(e => e.name === 'test-command' && e.type === 'command');
      expect(cmdExt).toBeDefined();
      expect(cmdExt?.agent).toBe('gemini-cli');
      expect(cmdExt?.description).toBe('Test command');
    });

    it('should list multiple commands', async () => {
      createGeminiCommand(env.paths.gemini.commands, 'command-1', 'Prompt 1');
      createGeminiCommand(env.paths.gemini.commands, 'command-2', 'Prompt 2');

      const extensions = await adapter.listExtensions();
      const commands = extensions.filter(e => e.type === 'command');

      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.name).sort()).toEqual(['command-1', 'command-2']);
    });

    it('should return empty array when no commands exist', async () => {
      const envNoCommands = createTestEnvironment();
      const adapterNoCommands = new GeminiAdapter({
        ...envNoCommands.config,
        agents: {
          'gemini-cli': {
            enabled: true,
            configPath: envNoCommands.paths.gemini.config,
            skillsPath: '/non/existent/commands',
          },
        },
      });

      const extensions = await adapterNoCommands.listExtensions();

      expect(extensions.filter(e => e.type === 'command')).toEqual([]);
      envNoCommands.cleanup();
    });
  });

  describe('addExtension() - MCP servers', () => {
    it('should add MCP server to config', async () => {
      await adapter.addExtension({
        name: 'gemini-server',
        type: 'mcp',
        agent: 'gemini-cli',
        config: { type: 'command', command: 'npx gemini-mcp' },
      });

      expect(existsSync(env.paths.gemini.config)).toBe(true);
      const config = JSON.parse(readFileSync(env.paths.gemini.config, 'utf-8'));
      expect(config.mcpServers['gemini-server']).toBeDefined();
      expect(config.mcpServers['gemini-server'].command).toBe('npx gemini-mcp');
    });

    it('should add HTTP MCP server to config', async () => {
      await adapter.addExtension({
        name: 'gemini-http',
        type: 'mcp',
        agent: 'gemini-cli',
        config: { type: 'http', url: 'https://mcp.gemini.example.com' },
      });

      const config = JSON.parse(readFileSync(env.paths.gemini.config, 'utf-8'));
      expect(config.mcpServers['gemini-http']).toBeDefined();
      expect(config.mcpServers['gemini-http'].url).toBe('https://mcp.gemini.example.com');
    });

    it('should throw error for invalid transport type', async () => {
      await expect(adapter.addExtension({
        name: 'invalid-server',
        type: 'mcp',
        agent: 'gemini-cli',
        config: { type: 'invalid' as any },
      })).rejects.toThrow('Invalid MCP transport type');
    });
  });

  describe('addExtension() - Commands', () => {
    it('should add command to commands directory', async () => {
      await adapter.addExtension({
        name: 'new-command',
        type: 'command',
        agent: 'gemini-cli',
        config: {
          description: 'A new command',
          prompt: 'You are helpful',
        },
      });

      const cmdPath = env.paths.gemini.commands + '/new-command.toml';
      expect(existsSync(cmdPath)).toBe(true);
      const content = readFileSync(cmdPath, 'utf-8');
      expect(content).toContain('description = "A new command"');
      expect(content).toContain('prompt = """');
      expect(content).toContain('You are helpful');
    });

    it('should add command with all options', async () => {
      await adapter.addExtension({
        name: 'full-command',
        type: 'command',
        agent: 'gemini-cli',
        config: {
          description: 'Full featured command',
          prompt: 'You are a coder',
          args: ['--verbose', '--debug'],
          output: 'json',
          totalBudget: 0.5,
        },
      });

      const cmdPath = env.paths.gemini.commands + '/full-command.toml';
      const content = readFileSync(cmdPath, 'utf-8');
      expect(content).toContain('description = "Full featured command"');
      expect(content).toContain('args = ["--verbose", "--debug"]');
      expect(content).toContain('totalBudget = 0.5');
    });

    it('should replace existing command', async () => {
      createGeminiCommand(env.paths.gemini.commands, 'existing-cmd', 'Original prompt');

      await adapter.addExtension({
        name: 'existing-cmd',
        type: 'command',
        agent: 'gemini-cli',
        config: {
          description: 'Updated command',
          prompt: 'Updated prompt',
        },
      });

      const cmdPath = env.paths.gemini.commands + '/existing-cmd.toml';
      const content = readFileSync(cmdPath, 'utf-8');
      expect(content).toContain('Updated command');
      expect(content).toContain('Updated prompt');
      expect(content).not.toContain('Original prompt');
    });

    it('should throw error when commands path not configured', async () => {
      const adapterNoPath = new GeminiAdapter({
        ...env.config,
        agents: {
          'gemini-cli': {
            enabled: true,
            configPath: env.paths.gemini.config,
            skillsPath: undefined,
          },
        },
      });

      await expect(adapterNoPath.addExtension({
        name: 'cmd-no-path',
        type: 'command',
        agent: 'gemini-cli',
        config: { prompt: 'Test' },
      })).rejects.toThrow('Gemini commands path not configured');
    });
  });

  describe('removeExtension() - MCP servers', () => {
    it('should remove MCP server from config', async () => {
      addMcpToConfig(env.paths.gemini.config, 'gemini-to-remove', {
        type: 'http',
        url: 'https://remove.example.com',
      });

      await adapter.removeExtension('gemini-to-remove');

      const config = JSON.parse(readFileSync(env.paths.gemini.config, 'utf-8'));
      expect(config.mcpServers['gemini-to-remove']).toBeUndefined();
    });

    it('should handle removing non-existent server gracefully', async () => {
      await expect(adapter.removeExtension('non-existent')).resolves.not.toThrow();
    });
  });

  describe('removeExtension() - Commands', () => {
    it('should remove command from commands directory', async () => {
      createGeminiCommand(env.paths.gemini.commands, 'cmd-to-remove', 'Prompt');

      expect(existsSync(env.paths.gemini.commands + '/cmd-to-remove.toml')).toBe(true);

      await adapter.removeExtension('cmd-to-remove');

      expect(existsSync(env.paths.gemini.commands + '/cmd-to-remove.toml')).toBe(false);
    });

    it('should handle removing non-existent command gracefully', async () => {
      await expect(adapter.removeExtension('non-existent-cmd')).resolves.not.toThrow();
    });
  });

  describe('getAgentInfoSync()', () => {
    it('should return agent info with correct paths', () => {
      const info = adapter.getAgentInfoSync();

      expect(info.type).toBe('gemini-cli');
      expect(info.name).toBe('Gemini CLI');
      expect(info.installed).toBe(true);
      expect(info.configPath).toBe(env.paths.gemini.config);
      expect(info.skillsPath).toBe(env.paths.gemini.commands);
    });
  });

  describe('getAgentInfo()', () => {
    it('should return agent info with extensions', async () => {
      createGeminiCommand(env.paths.gemini.commands, 'info-cmd', 'Prompt');

      const info = await adapter.getAgentInfo();

      expect(info.type).toBe('gemini-cli');
      expect(info.installed).toBe(true);
      expect(info.extensions.length).toBeGreaterThan(0);
      expect(info.extensions[0].name).toBe('info-cmd');
    });
  });
});
