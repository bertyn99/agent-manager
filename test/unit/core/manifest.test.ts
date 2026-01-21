// Manifest Unit Tests

import { describe, it, expect } from 'vitest';
import { join } from 'pathe';
import { readFileSync, writeFileSync } from 'fs-extra';
import { Manifest } from '../../src/core/manifest';
import { createMockConfig } from '../../helpers/mock-config';

describe('Manifest', () => {
  const manifest = new Manifest(createMockConfig());
  const manifestPath = manifest.getManifestPath();

  describe('readManifest', () => {
    it('should read and parse skills.yaml', () => {
      // Create a temporary manifest file
      const tempDir = join(manifestPath, '..', 'fixtures');
      const tempManifestPath = join(tempDir, 'test-manifest.yaml');
      
      writeFileSync(tempManifestPath, `
version: '1.0.0'
skills:
  - name: test-skill-1
    type: skill
    repo: https://github.com/user/test-skill-1
    source: local
  - name: test-skill-2
    type: skill
    repo: https://github.com/user/test-skill-2
    source: local
`);

      const result = manifest.readManifest();

      expect(result.version).toBe('1.0.0');
      expect(result.skills).toHaveLength(2);
      expect(result.skills[0]).toEqual({
        name: 'test-skill-1',
        type: 'skill',
        repo: 'https://github.com/user/test-skill-1',
        source: 'local',
      });
      expect(result.skills[1]).toEqual({
        name: 'test-skill-2',
        type: 'skill',
        repo: 'https://github.com/user/test-skill-2',
        source: 'local',
      });
    });

    it('should handle missing manifest gracefully', () => {
      const missingPath = join(manifestPath, '..', 'non-existent.yaml');
      
      const result = manifest.readManifest();

      expect(result.version).toBe('');
      expect(result.skills).toEqual([]);
    });
  });

  describe('addExtensionToManifest', () => {
    it('should add extension to manifest', () => {
      const tempDir = join(manifestPath, '..', 'fixtures');
      const tempManifestPath = join(tempDir, 'test-manifest.yaml');
      
      writeFileSync(tempManifestPath, `
version: '1.0.0'
skills:
  - name: test-skill-1
    type: skill
    repo: https://github.com/user/test-skill-1
    source: local
`);

      manifest.addExtensionToManifest({
        name: 'new-skill',
        type: 'skill',
        repo: 'https://github.com/user/new-skill',
        source: 'local',
      });

      const updated = manifest.readManifest();

      expect(updated.skills).toHaveLength(2);
      expect(updated.skills[1]).toEqual({
        name: 'new-skill',
        type: 'skill',
        repo: 'https://github.com/user/new-skill',
        source: 'local',
      });
    });

    it('should add source to existing extension', () => {
      const tempDir = join(manifestPath, '..', 'fixtures');
      const tempManifestPath = join(tempDir, 'test-manifest.yaml');
      
      writeFileSync(tempManifestPath, `
version: '1.0.0'
skills:
  - name: test-skill
    type: skill
    repo: https://github.com/user/test-skill
    source: local
`);

      manifest.addExtensionToManifest({
        name: 'test-skill',
        type: 'skill',
        repo: 'https://github.com/user/test-skill',
        source: 'git',
      });

      const updated = manifest.readManifest();

      expect(updated.skills[0]).toEqual({
        name: 'test-skill',
        type: 'skill',
        repo: 'https://github.com/user/test-skill',
        source: 'git',
      });
    });
  });

  describe('addSourceToManifest', () => {
    it('should add source to manifest', () => {
      const tempDir = join(manifestPath, '..', 'fixtures');
      const tempManifestPath = join(tempDir, 'test-manifest.yaml');
      
      writeFileSync(tempManifestPath, `
version: '1.0.0'
skills:
  - name: test-skill
    type: skill
    repo: https://github.com/user/test-skill
`);

      manifest.addSourceToManifest('test-skill');

      const updated = manifest.readManifest();

      expect(updated.skills[0]).toEqual({
        name: 'test-skill',
        type: 'skill',
        repo: 'https://github.com/user/test-skill',
        source: 'git',
      });
    });
  });

  describe('getManifestPath', () => {
    it('should return skills.yaml path', () => {
      const path = manifest.getManifestPath();
      expect(path).toBe(join('/mock/config/agent-manager/skills', 'skills.yaml'));
    });
  });
});
