// Integration Tests for SkillInstaller
// Tests detection and installation with real fixture repositories

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname } from 'pathe';
import {
  detectExtensionFormat,
  detectPluginsFolder,
  detectSkillsInFolder,
  parseExtensionMd,
} from '../../src/core/skill-installer';
import * as fs from 'fs-extra';

// Paths to fixture repositories
const FIXTURES_PATH = join(__dirname, '..', 'fixtures', 'repos');

describe('Integration: Skill Detection with Fixtures', () => {
  // Verify fixtures exist before running tests
  describe('Fixture Setup', () => {
    it('should have single-skill-with-sm fixture', () => {
      const path = join(FIXTURES_PATH, 'single-skill-with-sm', 'SKILL.md');
      expect(fs.existsSync(path)).toBe(true);
    });

    it('should have multi-plugin-marketplace fixture with 2 plugins', () => {
      const pluginsPath = join(FIXTURES_PATH, 'multi-plugin-marketplace', 'plugins');
      expect(fs.existsSync(pluginsPath)).toBe(true);

      const pluginA = join(pluginsPath, 'plugin-a', '.claude-plugin', 'plugin.json');
      const pluginB = join(pluginsPath, 'plugin-b', '.claude-plugin', 'plugin.json');
      expect(fs.existsSync(pluginA)).toBe(true);
      expect(fs.existsSync(pluginB)).toBe(true);
    });

    it('should have multi-skill-skills-folder fixture with 2 skills', () => {
      const skillsPath = join(FIXTURES_PATH, 'multi-skill-skills-folder', 'skills');
      expect(fs.existsSync(skillsPath)).toBe(true);

      const skillC = join(skillsPath, 'skill-c', 'SKILL.md');
      const skillD = join(skillsPath, 'skill-d', 'SKILL.md');
      expect(fs.existsSync(skillC)).toBe(true);
      expect(fs.existsSync(skillD)).toBe(true);
    });
  });

  describe('Single Skill with SKILL.md at Root', () => {
    const repoPath = join(FIXTURES_PATH, 'single-skill-with-sm');

    it('should detect SKILL.md format', () => {
      const result = detectExtensionFormat(repoPath);

      expect(result).not.toBeNull();
      expect(result?.formats.agentSkills?.enabled).toBe(true);
      expect(result?.formats.agentSkills?.path).toBe('SKILL.md');
    });

    it('should parse frontmatter correctly', () => {
      const skillMdPath = join(repoPath, 'SKILL.md');
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const frontmatter = parseExtensionMd(content);

      expect(frontmatter.name).toBe('my-single-skill');
      expect(frontmatter.description).toBe('A single skill with SKILL.md at root');
      expect(frontmatter.version).toBe('1.0.0');
      expect(frontmatter.author).toBe('Test Author');
      expect(frontmatter.license).toBe('MIT');
      expect(frontmatter.tags).toEqual(['test', 'single', 'skill']);
    });

    it('should not detect as plugin marketplace', () => {
      const plugins = detectPluginsFolder(repoPath);
      expect(plugins).toEqual([]);
    });

    it('should not detect skills in skills/ folder (does not exist)', () => {
      const skills = detectSkillsInFolder(join(repoPath, 'skills'));
      expect(skills).toEqual([]);
    });
  });

  describe('Multi-Plugin Marketplace with plugins/ Folder', () => {
    const repoPath = join(FIXTURES_PATH, 'multi-plugin-marketplace');

    it('should not detect SKILL.md at root', () => {
      const result = detectExtensionFormat(repoPath);
      // The root has no SKILL.md, so detectExtensionFormat returns null
      expect(result).toBeNull();
    });

    it('should detect multiple plugins in plugins/ folder', () => {
      const plugins = detectPluginsFolder(repoPath);

      expect(plugins).toHaveLength(2);
      expect(plugins).toContain('plugin-a');
      expect(plugins).toContain('plugin-b');
    });

    it('should detect plugin.json in each plugin', () => {
      const pluginAPath = join(repoPath, 'plugins', 'plugin-a', '.claude-plugin', 'plugin.json');
      const pluginBPath = join(repoPath, 'plugins', 'plugin-b', '.claude-plugin', 'plugin.json');

      expect(fs.existsSync(pluginAPath)).toBe(true);
      expect(fs.existsSync(pluginBPath)).toBe(true);

      const pluginAContent = JSON.parse(fs.readFileSync(pluginAPath, 'utf-8'));
      expect(pluginAContent.name).toBe('plugin-a');
      expect(pluginAContent.description).toBe('First plugin in marketplace');
    });

    it('should not detect skills in skills/ folder (does not exist)', () => {
      const skills = detectSkillsInFolder(join(repoPath, 'skills'));
      expect(skills).toEqual([]);
    });
  });

  describe('Multi-Skill Repo with skills/ Folder', () => {
    const repoPath = join(FIXTURES_PATH, 'multi-skill-skills-folder');

    it('should not detect SKILL.md at root', () => {
      const result = detectExtensionFormat(repoPath);
      expect(result).toBeNull();
    });

    it('should not detect as plugin marketplace (no plugins/ folder)', () => {
      const plugins = detectPluginsFolder(repoPath);
      expect(plugins).toEqual([]);
    });

    it('should detect multiple skills in skills/ folder', () => {
      const skills = detectSkillsInFolder(join(repoPath, 'skills'));

      expect(skills).toHaveLength(2);
      expect(skills).toContain('skill-c');
      expect(skills).toContain('skill-d');
    });

    it('should parse each skill correctly', () => {
      const skillCPath = join(repoPath, 'skills', 'skill-c');
      const result = detectExtensionFormat(skillCPath);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('skill-c');
      expect(result?.description).toBe('First skill in skills folder structure');
      expect(result?.version).toBe('1.0.0');
    });
  });

  describe('Frontmatter Parsing Edge Cases', () => {
    it('should handle empty frontmatter', () => {
      const content = `---
---

# No Frontmatter
`;
      const frontmatter = parseExtensionMd(content);
      expect(frontmatter).toEqual({});
    });

    it('should handle frontmatter with only name', () => {
      const content = `---
name: test
---

# Test
`;
      const frontmatter = parseExtensionMd(content);
      expect(frontmatter.name).toBe('test');
      expect(frontmatter.description).toBeUndefined();
    });

    it('should handle quoted values', () => {
      const content = `---
name: "quoted name"
description: 'single quoted'
---

# Test
`;
      const frontmatter = parseExtensionMd(content);
      expect(frontmatter.name).toBe('quoted name');
      expect(frontmatter.description).toBe('single quoted');
    });

    it('should handle array values', () => {
      const content = `---
tags: [one, two, three]
---

# Test
`;
      const frontmatter = parseExtensionMd(content);
      expect(frontmatter.tags).toEqual(['one', 'two', 'three']);
    });

    it('should handle boolean values', () => {
      const content = `---
enabled: true
disabled: false
---

# Test
`;
      const frontmatter = parseExtensionMd(content);
      expect(frontmatter.enabled).toBe(true);
      expect(frontmatter.disabled).toBe(false);
    });
  });
});

describe('Integration: Detection Logic Edge Cases', () => {
  describe('Empty or Non-Existent Paths', () => {
    it('should return empty array for non-existent plugins path', () => {
      const plugins = detectPluginsFolder('/non/existent/path');
      expect(plugins).toEqual([]);
    });

    it('should return empty array for non-existent skills folder', () => {
      const skills = detectSkillsInFolder('/non/existent/path');
      expect(skills).toEqual([]);
    });

    it('should return null for non-existent path in detectExtensionFormat', () => {
      // Path with no SKILL.md, no extension.json, no gemini-command.toml
      const result = detectExtensionFormat('/non/existent/path');
      expect(result).toBeNull();
    });
  });

  describe('Empty Directory', () => {
    it('should return empty array for empty plugins folder', () => {
      // Create a temp empty directory
      const tempDir = fs.mkdtempSync('/tmp/agent-manager-test-');
      const emptyPluginsPath = join(tempDir, 'plugins');
      fs.mkdirSync(emptyPluginsPath);

      const plugins = detectPluginsFolder(tempDir);
      expect(plugins).toEqual([]);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });

    it('should return empty array for empty skills folder', () => {
      const tempDir = fs.mkdtempSync('/tmp/agent-manager-test-');
      const emptySkillsPath = join(tempDir, 'skills');
      fs.mkdirSync(emptySkillsPath);

      const skills = detectSkillsInFolder(emptySkillsPath);
      expect(skills).toEqual([]);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true });
    });
  });
});

describe('Integration: Real-World Scenarios', () => {
  describe('Claude Code Plugin Marketplace Structure', () => {
    // Simulates plugin marketplaces with plugins/ folder
    const repoPath = join(FIXTURES_PATH, 'multi-plugin-marketplace');

    it('should detect plugins using plugins/ folder pattern', () => {
      const plugins = detectPluginsFolder(repoPath);

      expect(plugins.length).toBeGreaterThan(0);
      expect(plugins).toContain('plugin-a');
      expect(plugins).toContain('plugin-b');
    });

    it('should verify each plugin has .claude-plugin/plugin.json', () => {
      const plugins = detectPluginsFolder(repoPath);

      for (const pluginName of plugins) {
        const pluginJsonPath = join(repoPath, 'plugins', pluginName, '.claude-plugin', 'plugin.json');
        expect(fs.existsSync(pluginJsonPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
        expect(content.name).toBe(pluginName);
      }
    });
  });

  describe('Flat Skills Folder Structure', () => {
    // Simulates repos with skills directly in skills/ folder
    const repoPath = join(FIXTURES_PATH, 'multi-skill-skills-folder');

    it('should detect skills using skills/ folder pattern', () => {
      const skills = detectSkillsInFolder(join(repoPath, 'skills'));

      expect(skills.length).toBeGreaterThan(0);
      expect(skills).toContain('skill-c');
      expect(skills).toContain('skill-d');
    });

    it('should be able to get full extension info for each skill', () => {
      const skillNames = detectSkillsInFolder(join(repoPath, 'skills'));

      for (const skillName of skillNames) {
        const skillPath = join(repoPath, 'skills', skillName);
        const extension = detectExtensionFormat(skillPath);

        expect(extension).not.toBeNull();
        expect(extension?.name).toBe(skillName);
        expect(extension?.formats.agentSkills?.enabled).toBe(true);
      }
    });
  });
});
