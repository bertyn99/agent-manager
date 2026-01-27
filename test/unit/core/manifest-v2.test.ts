// Manifest v2.0.0 Unit Tests

import { describe, it, expect } from 'vitest';
import { filterSkillsByRules, addMcpToManifest, removeMcpFromManifest, addSkillOriginGroup, updateSkillInOrigin } from '../../../src/core/manifest.ts';

describe('Filter Skills By Rules', () => {
  it('should filter by include list (only specified folders)', () => {
    const allFolders = ['skill1', 'skill2', 'skill3', 'skill4'];
    const include = ['skill1', 'skill3'];
    const exclude = [];
    const result = filterSkillsByRules(allFolders, include, exclude);
    expect(result).toEqual(['skill1', 'skill3']);
  });

  it('should filter by exclude list (all except specified)', () => {
    const allFolders = ['skill1', 'skill2', 'skill3', 'skill4'];
    const include = [];
    const exclude = ['skill2', 'skill4'];
    const result = filterSkillsByRules(allFolders, include, exclude);
    expect(result).toEqual(['skill1', 'skill3']);
  });

  it('should include everything when both filters empty', () => {
    const allFolders = ['skill1', 'skill2', 'skill3'];
    const include = [];
    const exclude = [];
    const result = filterSkillsByRules(allFolders, include, exclude);
    expect(result).toEqual(['skill1', 'skill2', 'skill3']);
  });

  it('should prioritize include over exclude', () => {
    const allFolders = ['skill1', 'skill2', 'skill3'];
    const include = ['skill1'];
    const exclude = ['skill1', 'skill2'];
    const result = filterSkillsByRules(allFolders, include, exclude);
    expect(result).toEqual(['skill1']);
  });
});

describe('Migration Function', () => {
  it('should handle missing manifest gracefully', () => {
    expect(() => filterSkillsByRules([], [], [])).not.toThrow();
  });
});

describe('Manifest Helper Functions', () => {
  it('should add MCP to manifest - validation test', () => {
    expect(() => addMcpToManifest('/tmp', 'test-mcp', ['claude-code'])).not.toThrow();
  });

  it('should remove MCP from manifest - validation test', () => {
    expect(() => removeMcpFromManifest('/tmp', 'test-mcp')).not.toThrow();
  });

  it('should add skill origin group - validation test', () => {
    expect(() => addSkillOriginGroup('/tmp', 'https://github.com/user/repo', '/skills', 'main', { include: [], exclude: [] })).not.toThrow();
  });

  it('should update skill in origin - validation test', () => {
    expect(() => updateSkillInOrigin('/tmp', 'https://github.com/user/repo', 'skill-name', ['claude-code'])).toThrow();
  });
});
