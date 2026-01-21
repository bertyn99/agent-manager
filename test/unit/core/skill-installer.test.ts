// SkillInstaller Unit Tests

import { describe, it, expect } from 'vitest';
import { SkillInstaller } from '../../src/core/skill-installer';
import { createMockConfig } from '../../helpers/mock-config';

describe('SkillInstaller', () => {
  const config = createMockConfig();
  const installer = new SkillInstaller(config);

  describe('parseExtensionMd', () => {
    it('should parse frontmatter correctly', () => {
      const content = `---
name: test-skill
description: A test skill
version: 1.0.0
---

# Test Skill
This is a test.
`;
      
      const frontmatter = installer.parseExtensionMd(content);
      
      expect(frontmatter.name).toBe('test-skill');
      expect(frontmatter.description).toBe('A test skill');
      expect(frontmatter.version).toBe('1.0.0');
    });

    it('should return empty object for content without frontmatter', () => {
      const content = '# Test Skill\nNo frontmatter here.';
      
      const frontmatter = installer.parseExtensionMd(content);
      
      expect(frontmatter).toEqual({});
    });
  });

  describe('parseExtensionJson', () => {
    it('should parse JSON extension correctly', () => {
      const json = {
        name: 'test-server',
        command: 'npx',
        args: ['@server/test']
      };
      
      const result = installer.parseExtensionJson(JSON.stringify(json));
      
      expect(result.name).toBe('test-server');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['@server/test']);
    });

    it('should handle invalid JSON', () => {
      const json = { invalid: 'field' };
      
      const result = installer.parseExtensionJson(JSON.stringify(json));
      
      expect(result).toEqual({ name: json.invalid });
    });
  });

  describe('detectExtensionFormat', () => {
    it('should detect valid repo format', () => {
      const repoUrl = 'https://github.com/user/repo';
      const result = installer.detectExtensionFormat(repoUrl);
      
      expect(result.format).toBe('directory');
    });

    it('should detect valid zip format', () => {
      const repoUrl = 'https://github.com/user/repo/archive.zip';
      const result = installer.detectExtensionFormat(repoUrl);
      
      expect(result.format).toBe('zip');
    });

    it('should detect invalid format', () => {
      const repoUrl = 'https://github.com/user/repo/file.txt';
      const result = installer.detectExtensionFormat(repoUrl);
      
      expect(result.format).toBe('unknown');
    });
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(installer.type).toBe('skill-installer');
    });

    it('should have correct name', () => {
      expect(installer.name).toBe('SkillInstaller');
    });
  });

  describe('null handling', () => {
    it('should handle undefined agent config gracefully in addExtension', async () => {
      const configNoAgent = createMockConfig({
        agents: undefined
      });
      const installerNoAgent = new SkillInstaller(configNoAgent);
      
      await expect(installerNoAgent.addExtension({
        name: 'test-skill',
        type: 'skill',
        agent: 'claude-code',
        repoUrl: 'https://github.com/test/skill',
      })).rejects.toThrow('Agent config for claude-code not found');
    });

    it('should handle undefined agent config gracefully in removeExtension', async () => {
      const configNoAgent = createMockConfig({
        agents: undefined
      });
      const installerNoAgent = new SkillInstaller(configNoAgent);
      
      await expect(installerNoAgent.removeExtension('test-skill', 'claude-code')).resolves.not.toThrow();
    });
  });
});
