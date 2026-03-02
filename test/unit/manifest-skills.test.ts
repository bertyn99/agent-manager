import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, mkdtempSync, existsSync, readFileSync } from 'fs-extra';
import { join } from 'pathe';
import { tmpdir } from 'os';
import { load as yamlLoad } from 'js-yaml';

vi.mock('../../src/utils/logger', () => ({
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
}));

const { getSkillsByOrigin, addExtensionToManifest, removeAllSkillsFromOrigin } = await import('../../src/core/manifest.js');
import type { AgentManagerConfig } from '../../src/core/types.js';

describe('Manifest - Skills Management', () => {
  let testDir: string;
  let config: AgentManagerConfig;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'manifest-test-'));

    config = {
      home: join(testDir, '.config', 'agent-manager'),
      manifestPath: join(testDir, '.config', 'agent-manager', 'skills.yaml'),
      skillsPath: join(testDir, '.config', 'agent-manager', 'skill'),
      vendorPath: join(testDir, '.config', 'agent-manager', 'vendor'),
      agents: {
        'claude-code': { enabled: true, configPath: '', skillsPath: '' },
        'cursor': { enabled: true, configPath: '', skillsPath: '' },
        'gemini-cli': { enabled: true, configPath: '', skillsPath: '' },
        'opencode': { enabled: true, configPath: '', skillsPath: '' },
        'vscode-copilot': { enabled: false, configPath: '', skillsPath: '' },
        'openai-codex': { enabled: false, configPath: '', skillsPath: '' },
      },
    };

    mkdirSync(join(testDir, '.config', 'agent-manager'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should add skills to manifest with correct origin', () => {
    addExtensionToManifest(config.home, 'skill-a', 'claude-code', {
      repo: 'https://github.com/test/repo',
      description: 'Test skill A',
    });

    const manifestPath = join(config.home, 'manifest.yaml');
    expect(existsSync(manifestPath)).toBe(true);

    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = yamlLoad(content) as any;

    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0].origin).toBe('https://github.com/test/repo');
    expect(manifest.skills[0].skills).toHaveLength(1);
    expect(manifest.skills[0].skills[0].name).toBe('skill-a');
    expect(manifest.skills[0].skills[0].agents).toContain('claude-code');
  });

  it('should add multiple skills to same origin', () => {
    addExtensionToManifest(config.home, 'skill-a', 'claude-code', {
      repo: 'https://github.com/test/repo',
    });
    addExtensionToManifest(config.home, 'skill-b', 'claude-code', {
      repo: 'https://github.com/test/repo',
    });

    const skills = getSkillsByOrigin(config.home, 'https://github.com/test/repo');
    
    expect(skills).toHaveLength(2);
    expect(skills.map(s => s.name)).toContain('skill-a');
    expect(skills.map(s => s.name)).toContain('skill-b');
  });

  it('should get skills by origin', () => {
    addExtensionToManifest(config.home, 'skill-a', 'claude-code', {
      repo: 'https://github.com/test/repo',
    });
    addExtensionToManifest(config.home, 'skill-b', 'cursor', {
      repo: 'https://github.com/test/repo',
    });
    addExtensionToManifest(config.home, 'skill-c', 'claude-code', {
      repo: 'https://github.com/test/other',
    });

    const skills = getSkillsByOrigin(config.home, 'https://github.com/test/repo');
    
    expect(skills).toHaveLength(2);
  });

  it('should remove all skills from origin', () => {
    addExtensionToManifest(config.home, 'skill-a', 'claude-code', {
      repo: 'https://github.com/test/repo',
    });
    addExtensionToManifest(config.home, 'skill-b', 'claude-code', {
      repo: 'https://github.com/test/repo',
    });
    addExtensionToManifest(config.home, 'skill-c', 'cursor', {
      repo: 'https://github.com/test/other',
    });

    const result = removeAllSkillsFromOrigin(config.home, 'https://github.com/test/repo');
    
    expect(result.removed).toHaveLength(2);
    expect(result.removed.map(s => s.name)).toContain('skill-a');
    expect(result.removed.map(s => s.name)).toContain('skill-b');
    expect(result.agents).toContain('claude-code');
    expect(result.agents).not.toContain('cursor');

    const remainingSkills = getSkillsByOrigin(config.home, 'https://github.com/test/repo');
    expect(remainingSkills).toHaveLength(0);
  });

  it('should return empty when removing non-existent origin', () => {
    const result = removeAllSkillsFromOrigin(config.home, 'https://github.com/non/existent');
    
    expect(result.removed).toHaveLength(0);
    expect(result.agents).toHaveLength(0);
  });

  it('should handle local origin when no repo provided', () => {
    addExtensionToManifest(config.home, 'my-local-skill', 'claude-code', {
      repo: undefined,
    });

    const skills = getSkillsByOrigin(config.home, 'local');
    
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-local-skill');
  });
});

describe('Manifest - Skills Origin Groups', () => {
  let testDir: string;
  let config: AgentManagerConfig;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'origin-test-'));

    config = {
      home: join(testDir, '.config', 'agent-manager'),
      manifestPath: join(testDir, '.config', 'agent-manager', 'skills.yaml'),
      skillsPath: join(testDir, '.config', 'agent-manager', 'skill'),
      vendorPath: join(testDir, '.config', 'agent-manager', 'vendor'),
      agents: {
        'claude-code': { enabled: true, configPath: '', skillsPath: '' },
        'cursor': { enabled: true, configPath: '', skillsPath: '' },
        'gemini-cli': { enabled: true, configPath: '', skillsPath: '' },
        'opencode': { enabled: true, configPath: '', skillsPath: '' },
        'vscode-copilot': { enabled: false, configPath: '', skillsPath: '' },
        'openai-codex': { enabled: false, configPath: '', skillsPath: '' },
      },
    };

    mkdirSync(join(testDir, '.config', 'agent-manager'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should maintain separate origin groups', () => {
    addExtensionToManifest(config.home, 'skill-a', 'claude-code', {
      repo: 'https://github.com/org/repo-a',
    });
    addExtensionToManifest(config.home, 'skill-b', 'claude-code', {
      repo: 'https://github.com/org/repo-b',
    });

    const skillsA = getSkillsByOrigin(config.home, 'https://github.com/org/repo-a');
    const skillsB = getSkillsByOrigin(config.home, 'https://github.com/org/repo-b');

    expect(skillsA).toHaveLength(1);
    expect(skillsA[0].name).toBe('skill-a');
    expect(skillsB).toHaveLength(1);
    expect(skillsB[0].name).toBe('skill-b');
  });

  it('should track multiple agents per skill', () => {
    addExtensionToManifest(config.home, 'shared-skill', 'claude-code', {
      repo: 'https://github.com/test/repo',
    });
    addExtensionToManifest(config.home, 'shared-skill', 'cursor', {
      repo: 'https://github.com/test/repo',
    });

    const skills = getSkillsByOrigin(config.home, 'https://github.com/test/repo');
    
    expect(skills).toHaveLength(1);
    expect(skills[0].agents).toContain('claude-code');
    expect(skills[0].agents).toContain('cursor');
  });
});
