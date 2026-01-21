// Core Tests - Config, Logger, and Utilities

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, removeSync } from 'fs-extra';
import { join } from 'pathe';
import { homedir } from 'os';

// Mock logger before importing
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    start: vi.fn(),
    fatal: vi.fn(),
    box: vi.fn(),
    prompt: vi.fn(),
  },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  start: vi.fn(),
  fatal: vi.fn(),
  box: vi.fn(),
  prompt: vi.fn(),
  createSilentLogger: vi.fn(),
  withSpinner: vi.fn(),
}));

describe('Config Module', () => {
  const testDir = join(homedir(), '.test-agent-manager');
  
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });
  
  afterEach(() => {
    if (existsSync(testDir)) {
      removeSync(testDir);
    }
  });

  it('should export required functions', async () => {
    const { loadConfigSync, getDefaultConfig, ensureDirs, saveConfig } = await import('../core/config.js');
    
    expect(typeof loadConfigSync).toBe('function');
    expect(typeof getDefaultConfig).toBe('function');
    expect(typeof ensureDirs).toBe('function');
    expect(typeof saveConfig).toBe('function');
  });

  it('should return default config when no config file exists', async () => {
    const { loadConfigSync, getDefaultConfig } = await import('../core/config.js');
    
    const config = loadConfigSync('/nonexistent/path/config.json');
    const defaultConfig = getDefaultConfig();
    
    expect(config.home).toBeDefined();
    expect(config.manifestPath).toBeDefined();
    expect(config.skillsPath).toBeDefined();
    expect(config.vendorPath).toBeDefined();
    expect(config.agents).toBeDefined();
  });

  it('should load config from file if exists', async () => {
    const { loadConfigSync } = await import('../core/config.js');
    
    const testConfigPath = join(testDir, 'test-skills.json');
    const testConfig = {
      home: testDir,
      manifestPath: join(testDir, 'skills.yaml'),
      skillsPath: join(testDir, 'skill'),
      vendorPath: join(testDir, 'vendor'),
      agents: {
        'claude-code': {
          enabled: true,
          configPath: join(testDir, '.claude', 'settings.json'),
        },
      },
    };
    
    writeFileSync(testConfigPath, JSON.stringify(testConfig));
    
    const loadedConfig = loadConfigSync(testConfigPath);
    
    expect(loadedConfig.home).toBe(testDir);
    expect(loadedConfig.agents['claude-code']).toBeDefined();
  });
});

describe('Logger Module', () => {
  it('should export logger functions', async () => {
    const { logger, info, warn, error, success, debug, log, start } = await import('../utils/logger.js');
    
    expect(logger).toBeDefined();
    expect(typeof info).toBe('function');
    expect(typeof warn).toBe('function');
    expect(typeof error).toBe('function');
    expect(typeof success).toBe('function');
    expect(typeof debug).toBe('function');
    expect(typeof log).toBe('function');
    expect(typeof start).toBe('function');
  });

  it('should have createSilentLogger function', async () => {
    const { createSilentLogger } = await import('../utils/logger.js');
    
    // Function should exist
    expect(typeof createSilentLogger).toBe('function');
  });
});

describe('Git Utilities', () => {
  it('should export git functions', async () => {
    const { 
      cloneRepo, 
      pullRepo, 
      checkoutBranch, 
      getCurrentCommit,
      getLatestTag,
      isRepoDirty,
      getRepoStatus,
      parseRepoUrl,
      isValidRepo,
    } = await import('../utils/git.js');
    
    expect(typeof cloneRepo).toBe('function');
    expect(typeof pullRepo).toBe('function');
    expect(typeof checkoutBranch).toBe('function');
    expect(typeof getCurrentCommit).toBe('function');
    expect(typeof getLatestTag).toBe('function');
    expect(typeof isRepoDirty).toBe('function');
    expect(typeof getRepoStatus).toBe('function');
    expect(typeof parseRepoUrl).toBe('function');
    expect(typeof isValidRepo).toBe('function');
  });

  it('should parse GitHub URL correctly', async () => {
    const { parseRepoUrl } = await import('../utils/git.js');
    
    const result = parseRepoUrl('https://github.com/owner/repo');
    
    expect(result.url).toBe('https://github.com/owner/repo');
    expect(result.org).toBe('owner');
    expect(result.repo).toBe('repo');
    expect(result.branch).toBe('main');
  });

  it('should parse SSH URL correctly', async () => {
    const { parseRepoUrl } = await import('../utils/git.js');
    
    const result = parseRepoUrl('git@github.com:owner/repo.git');
    
    expect(result.org).toBe('owner');
    expect(result.repo).toBe('repo');
  });
});

describe('Skill Installer', () => {
  it('should export required functions', async () => {
    const { 
      parseSkillMd, 
      parseSkillJson, 
      detectSkillFormat,
      addSkill,
    } = await import('../core/skill-installer.js');
    
    expect(typeof parseSkillMd).toBe('function');
    expect(typeof parseSkillJson).toBe('function');
    expect(typeof detectSkillFormat).toBe('function');
    expect(typeof addSkill).toBe('function');
  });

  it('should parse SKILL.md frontmatter', async () => {
    const { parseSkillMd } = await import('../core/skill-installer.js');
    
    const content = `---
name: test-skill
description: A test skill
version: 1.0.0
author: Test Author
---

# Test Skill
This is a test skill.
`;
    
    const frontmatter = parseSkillMd(content);
    
    expect(frontmatter.name).toBe('test-skill');
    expect(frontmatter.description).toBe('A test skill');
    expect(frontmatter.version).toBe('1.0.0');
    expect(frontmatter.author).toBe('Test Author');
  });

  it('should parse skill.json', async () => {
    const { parseSkillJson } = await import('../core/skill-installer.js');
    
    const json = JSON.stringify({
      name: 'test-skill',
      description: 'A test skill',
    });
    
    const result = parseSkillJson(json);
    
    expect(result.name).toBe('test-skill');
    expect(result.description).toBe('A test skill');
  });
});

describe('Skill Remover', () => {
  it('should export removeSkill function', async () => {
    const { removeSkill } = await import('../core/skill-remover.js');
    
    expect(typeof removeSkill).toBe('function');
  });
});

describe('Skill Sync', () => {
  it('should export sync and upgrade functions', async () => {
    const { syncSkills, upgradeSkill, upgradeAllSkills } = await import('../core/skill-sync.js');
    
    expect(typeof syncSkills).toBe('function');
    expect(typeof upgradeSkill).toBe('function');
    expect(typeof upgradeAllSkills).toBe('function');
  });
});
