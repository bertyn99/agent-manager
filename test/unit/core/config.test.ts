// Config Unit Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs-extra';
import { Config } from '../../../src/core/config';
import { createMockConfig } from '../../helpers/mock-config';

describe('Config', () => {
  const config = createMockConfig();
  const configManager = new Config(config);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadConfigSync', () => {
    it('should load config from file', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ home: '/test', agents: {} }));
      
      const result = configManager.loadConfigSync();
      
      expect(existsSpy).toHaveBeenCalled();
      expect(readSpy).toHaveBeenCalled();
      expect(result.home).toBe('/test');
      expect(result.agents).toEqual({});
    });
  });

  describe('saveConfig', () => {
    it('should write config to file', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
      
      configManager.saveConfig();
      
      expect(existsSpy).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalled();
      expect(mkdirSpy).toHaveBeenCalled();
    });
  });

  describe('ensureDirs', () => {
    it('should create directories if they do not exist', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
      
      configManager.ensureDirs();
      
      expect(mkdirSpy).toHaveBeenCalledWith(
        '/mock/config/agent-manager',
        { recursive: true }
      );
      expect(mkdirSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid default config', () => {
      const config = configManager.getDefaultConfig();
      
      expect(config.home).toBeDefined();
      expect(config.manifestPath).toBeDefined();
      expect(config.skillsPath).toBeDefined();
      expect(config.agents).toBeInstanceOf(Object);
      expect(Object.keys(config.agents)).toContain('claude-code');
      expect(Object.keys(config.agents)).toContain('cursor');
      expect(Object.keys(config.agents)).toContain('gemini-cli');
      expect(Object.keys(config.agents)).toContain('opencode');
    });
  });

  describe('getAgentConfig', () => {
    it('should throw error for unknown agent type', () => {
      expect(() => configManager.getAgentConfig('unknown-agent' as any)).toThrow('Unknown agent type: unknown-agent');
    });

    it('should return agent config for known agent', () => {
      const config = configManager.getAgentConfig('claude-code');
      
      expect(config.enabled).toBeDefined();
      expect(config.configPath).toBeDefined();
      expect(config.skillsPath).toBeDefined();
    });
  });
});
