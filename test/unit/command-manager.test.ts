// CommandManager Unit Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, removeSync } from 'fs-extra';
import { join } from 'pathe';
import { homedir } from 'os';
import { commandManager } from '../../src/core/command-manager.js';

describe('CommandManager', () => {
  const testDir = join(homedir(), '.test-agent-manager-commands');
  const commandsPath = join(testDir, 'commands');

  beforeEach(() => {
    mkdirSync(commandsPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      removeSync(testDir);
    }
  });

  describe('toToml', () => {
    it('should generate TOML with all fields', () => {
      const config = {
        name: 'my-command',
        description: 'A useful command',
        prompt: 'You are helpful',
        args: ['--arg1', '--arg2'],
        totalBudget: 1.0,
        output: 'json' as const,
      };

      const toml = commandManager.toToml(config);

      expect(toml).toContain('description = "A useful command"');
      expect(toml).toContain('prompt = """');
      expect(toml).toContain('You are helpful');
      expect(toml).toContain('"""');
      expect(toml).toContain('args = ["--arg1", "--arg2"]');
      expect(toml).toContain('totalBudget = 1');
      expect(toml).toContain('output = "json"');
    });

    it('should generate minimal TOML', () => {
      const config = {
        name: 'minimal',
        prompt: 'Just a prompt',
      };

      const toml = commandManager.toToml(config);

      expect(toml).toContain('prompt = """');
      expect(toml).toContain('Just a prompt');
      expect(toml).toContain('"""');
      expect(toml).not.toContain('description');
      expect(toml).not.toContain('args');
    });

    it('should escape special characters in strings', () => {
      const config = {
        name: 'special',
        description: 'Contains "quotes" and\nnewlines',
        prompt: 'Tab\there',
      };

      const toml = commandManager.toToml(config);

      expect(toml).toContain('\\"');
      expect(toml).toContain('\\n');
      expect(toml).toContain('\\t');
    });

    it('should handle streaming output', () => {
      const config = {
        name: 'streaming',
        prompt: 'Stream response',
        output: 'streaming' as const,
      };

      const toml = commandManager.toToml(config);

      expect(toml).toContain('output = "streaming"');
    });
  });

  describe('addCommand', () => {
    it('should add a command and create file', () => {
      const config = {
        name: 'test-cmd',
        description: 'Test command',
        prompt: 'You are a test assistant',
        args: ['--test'],
      };

      const result = commandManager.addCommand(config, 'gemini-cli', commandsPath);

      expect(result.success).toBe(true);
      expect(result.name).toBe('test-cmd');
      expect(result.agent).toBe('gemini-cli');
      // Warnings is an empty array when no warnings, not undefined
      expect(result.warnings).toEqual([]);
      expect(result.error).toBeUndefined();

      // Verify file was created
      const filePath = join(commandsPath, 'test-cmd.toml');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should fail for empty name', () => {
      const config = {
        name: '',
        prompt: 'Test',
      };

      const result = commandManager.addCommand(config, 'gemini-cli', commandsPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail for empty prompt', () => {
      const config = {
        name: 'test',
        prompt: '',
      };

      const result = commandManager.addCommand(config, 'gemini-cli', commandsPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('removeCommand', () => {
    it('should remove an existing command', () => {
      // Create a command file manually
      const filePath = join(commandsPath, 'to-remove.toml');
      writeFileSync(filePath, 'prompt = "Test"');

      const result = commandManager.removeCommand('to-remove', 'gemini-cli', commandsPath);

      expect(result.success).toBe(true);

      // Verify file was removed
      expect(existsSync(filePath)).toBe(false);
    });

    it('should fail for non-existent command', () => {
      const result = commandManager.removeCommand('nonexistent', 'gemini-cli', commandsPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('listCommands', () => {
    it('should return empty array for empty directory', () => {
      const emptyPath = join(testDir, 'empty-commands');
      mkdirSync(emptyPath, { recursive: true });

      const commands = commandManager.listCommands(emptyPath);

      expect(commands).toEqual([]);
    });

    it('should skip non-toml files', () => {
      // Create a non-toml file
      writeFileSync(join(commandsPath, 'readme.txt'), 'This is not a command');

      const commands = commandManager.listCommands(commandsPath);

      expect(commands).toEqual([]);
    });
  });

  describe('detectSpecialFeatures', () => {
    it('should detect shell commands', () => {
      const warnings = commandManager.detectSpecialFeatures('Run !{ls -la} now');

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Shell command');
    });

    it('should detect file injection', () => {
      const warnings = commandManager.detectSpecialFeatures('Read @{/path/to/file}');

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('File injection');
    });

    it('should detect multiple features', () => {
      const warnings = commandManager.detectSpecialFeatures(
        'Run !{cmd} and read @{/file}'
      );

      expect(warnings.length).toBe(2);
    });

    it('should return empty array for clean prompts', () => {
      const warnings = commandManager.detectSpecialFeatures('Just a normal prompt');

      expect(warnings).toEqual([]);
    });

    it('should detect multiple shell commands', () => {
      const warnings = commandManager.detectSpecialFeatures(
        'Run !{cmd1} and then !{cmd2}'
      );

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Shell command detected');
    });

    it('should detect multiple file injections', () => {
      const warnings = commandManager.detectSpecialFeatures(
        'Read @{/file1} and @{/file2}'
      );

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('File injection detected');
    });
  });

  describe('escapeTomlString', () => {
    it('should escape backslashes', () => {
      const result = (commandManager as any).escapeTomlString('path\\to\\file');
      expect(result).toContain('\\\\');
    });

    it('should escape quotes', () => {
      const result = (commandManager as any).escapeTomlString('say "hello"');
      expect(result).toContain('\\"');
    });

    it('should escape newlines', () => {
      const result = (commandManager as any).escapeTomlString('line1\nline2');
      expect(result).toContain('\\n');
    });

    it('should escape tabs', () => {
      const result = (commandManager as any).escapeTomlString('col1\tcol2');
      expect(result).toContain('\\t');
    });

    it('should escape carriage returns', () => {
      const result = (commandManager as any).escapeTomlString('line1\rline2');
      expect(result).toContain('\\r');
    });
  });
});
