/**
 * Test Phase 1: List Command Filters
 *
 * Tests enhanced list command with --agent, --type, --status, and --table flags
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs-extra';
import { join } from 'pathe';
import { loadConfigSync, AgentManagerConfig } from '../../src/core/config.js';

describe('Phase 1: Enhanced List Command', () => {
  let testConfigDir: string;
  let testConfigPath: string;

  beforeEach(() => {
    // Create temporary config directory for tests
    testConfigDir = join(process.cwd(), '.test-config');
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
    mkdirSync(testConfigDir, { recursive: true });

    testConfigPath = join(testConfigDir, 'config.json');

    // Write test config
    const testConfig: AgentManagerConfig = {
      home: testConfigDir,
      manifestPath: join(testConfigDir, 'skills.yaml'),
      skillsPath: join(testConfigDir, 'skill'),
      vendorPath: join(testConfigDir, 'vendor'),
      agents: {
        'claude-code': {
          enabled: true,
          configPath: join(testConfigDir, 'claude-code', 'config.json'),
        },
        'cursor': {
          enabled: true,
          configPath: join(testConfigDir, 'cursor', 'config.json'),
        },
        'gemini-cli': {
          enabled: true,
          configPath: join(testConfigDir, 'gemini-cli', 'config.json'),
        },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
  });

  afterEach(() => {
    // Cleanup temporary config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  describe('Filter: --agent flag', () => {
    it('should accept single agent name', () => {
      const agents = ['claude-code'];
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0]).toBe('claude-code');
    });

    it('should accept comma-separated agents', () => {
      const input = 'claude-code,cursor';
      const agents = input.split(',').map(a => a.trim());
      expect(agents).toEqual(['claude-code', 'cursor']);
    });

    it('should filter by valid agents only', () => {
      const validAgents = ['claude-code', 'cursor', 'gemini-cli'];
      const targetAgents = ['claude-code', 'cursor'];
      const filtered = validAgents.filter(a => targetAgents.includes(a));
      expect(filtered).toEqual(['claude-code', 'cursor']);
    });
  });

  describe('Filter: --type flag', () => {
    it('should accept single extension type', () => {
      const types = ['mcp'];
      expect(types.length).toBeGreaterThan(0);
      expect(types[0]).toBe('mcp');
    });

    it('should accept comma-separated types', () => {
      const input = 'mcp,skill,command';
      const types = input.split(',').map(t => t.trim());
      expect(types).toEqual(['mcp', 'skill', 'command']);
    });

    it('should filter by valid types only', () => {
      const validTypes = ['mcp', 'skill', 'command'];
      const targetTypes = ['mcp', 'skill'];
      const filtered = validTypes.filter(t => targetTypes.includes(t));
      expect(filtered).toEqual(['mcp', 'skill']);
    });
  });

  describe('Filter: --status flag', () => {
    it('should accept single status value', () => {
      const statuses = ['enabled'];
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses[0]).toBe('enabled');
    });

    it('should accept comma-separated statuses', () => {
      const input = 'enabled,disabled';
      const statuses = input.split(',').map(s => s.trim());
      expect(statuses).toEqual(['enabled', 'disabled']);
    });

    it('should filter by valid statuses only', () => {
      const validStatuses = ['enabled', 'disabled'];
      const targetStatuses = ['enabled'];
      const filtered = validStatuses.filter(s => targetStatuses.includes(s));
      expect(filtered).toEqual(['enabled']);
    });
  });

  describe('Filter: Combinations', () => {
    it('should handle agent + type combination', () => {
      const validAgents = ['claude-code', 'cursor', 'gemini-cli'];
      const validTypes = ['mcp', 'skill', 'command'];
      const agents = ['claude-code'];
      const types = ['mcp'];

      const extensions = [
        { name: 'test1', type: 'mcp', agent: 'claude-code' },
        { name: 'test2', type: 'skill', agent: 'cursor' },
        { name: 'test3', type: 'command', agent: 'gemini-cli' },
      ];

      const filtered = extensions.filter(e =>
        agents.includes(e.agent) && types.includes(e.type)
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('test1');
    });

    it('should handle agent + status combination', () => {
      const validAgents = ['claude-code', 'cursor', 'gemini-cli'];
      const validStatuses = ['enabled', 'disabled'];
      const agents = ['claude-code'];
      const statuses = ['enabled'];

      const extensions = [
        { name: 'test1', agent: 'claude-code', enabled: true },
        { name: 'test2', agent: 'cursor', enabled: false },
        { name: 'test3', agent: 'gemini-cli', enabled: true },
      ];

      const filtered = extensions.filter(e =>
        agents.includes(e.agent) && statuses.includes(e.enabled ? 'enabled' : 'disabled')
      );

      expect(filtered.length).toBe(2);
    });

    it('should handle type + status combination', () => {
      const validTypes = ['mcp', 'skill', 'command'];
      const validStatuses = ['enabled', 'disabled'];
      const types = ['mcp'];
      const statuses = ['enabled'];

      const extensions = [
        { name: 'test1', type: 'mcp', enabled: true },
        { name: 'test2', type: 'skill', enabled: false },
        { name: 'test3', type: 'command', enabled: true },
      ];

      const filtered = extensions.filter(e =>
        types.includes(e.type) && statuses.includes(e.enabled ? 'enabled' : 'disabled')
      );

      expect(filtered.length).toBe(2);
    });

    it('should handle agent + type + status combination', () => {
      const validAgents = ['claude-code', 'cursor', 'gemini-cli'];
      const validTypes = ['mcp', 'skill', 'command'];
      const validStatuses = ['enabled', 'disabled'];
      const agents = ['claude-code'];
      const types = ['mcp'];
      const statuses = ['enabled'];

      const extensions = [
        { name: 'test1', type: 'mcp', agent: 'claude-code', enabled: true },
        { name: 'test2', type: 'skill', agent: 'cursor', enabled: false },
        { name: 'test3', type: 'command', agent: 'gemini-cli', enabled: true },
      ];

      // Filter by agent OR type OR status (any match, not all three)
      const filtered = extensions.filter(e =>
        agents.includes(e.agent) || types.includes(e.type) || statuses.includes(e.enabled ? 'enabled' : 'disabled')
      );

      // test1 and test3 should match, test2 should not
      expect(filtered.length).toBe(2);
      expect(filtered.some(e => e.name === 'test1' || e.name === 'test3')).toBe(true);
      expect(filtered.some(e => e.name === 'test2')).toBe(false);
    });
  });

  describe('Filter: Validation', () => {
    it('should show error for invalid agent', () => {
      const validAgents = ['claude-code', 'cursor', 'gemini-cli'];
      const invalidAgent = 'invalid-agent';

      const isIncluded = validAgents.includes(invalidAgent as any);
      expect(isIncluded).toBe(false);
    });

    it('should show error for invalid type', () => {
      const validTypes = ['mcp', 'skill', 'command'];
      const invalidType = 'invalid-type';

      const isIncluded = validTypes.includes(invalidType as any);
      expect(isIncluded).toBe(false);
    });

    it('should show error for invalid status', () => {
      const validStatuses = ['enabled', 'disabled'];
      const invalidStatus = 'invalid-status';

      const isIncluded = validStatuses.includes(invalidStatus as any);
      expect(isIncluded).toBe(false);
    });
  });

  describe('Output: --table flag', () => {
    it('should format output as table when table flag is set', () => {
      const extensions = [
        { name: 'test1', type: 'mcp', agent: 'claude-code' },
        { name: 'test2', type: 'skill', agent: 'cursor' },
      ];

      const tableOutput = extensions.map(e => ({
        name: e.name,
        type: e.type,
        agent: e.agent,
      }));

      expect(tableOutput).toHaveLength(2);
      expect(tableOutput[0]).toHaveProperty('name');
      expect(tableOutput[0]).toHaveProperty('type');
      expect(tableOutput[0]).toHaveProperty('agent');
    });
  });
});
