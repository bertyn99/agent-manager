/**
 * Test Phase 2: Backup and Restore Modules
 * 
 * Tests backup creation, validation, and restore functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createBackup, validateBackup, listBackups } from './backup.js';
import { restoreFromBackup, previewRestore } from './restore.js';

describe('Phase 2: Backup Module', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `agent-manager-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('createBackup', () => {
    it('should create a backup file successfully', async () => {
      const result = await createBackup(testDir);
      
      expect(result.success).toBe(true);
      expect(result.backupFile).toBeDefined();
      expect(result.extensionCount).toBe(0);
      expect(existsSync(result.backupFile!)).toBe(true);
    });

    it('should use custom output path when provided', async () => {
      const customPath = join(testDir, 'custom-backup.json');
      const result = await createBackup(testDir, { outputPath: customPath });
      
      expect(result.success).toBe(true);
      expect(result.backupFile).toBe(customPath);
      expect(existsSync(customPath)).toBe(true);
    });

    it('should create valid backup JSON structure', async () => {
      const result = await createBackup(testDir);
      
      expect(result.success).toBe(true);
      
      const content = require('fs').readFileSync(result.backupFile!, 'utf-8');
      const backup = JSON.parse(content);
      
      expect(backup.version).toBe('1.0.0');
      expect(backup.backedUpAt).toBeDefined();
      expect(backup.agents).toBeDefined();
      expect(typeof backup.agents).toBe('object');
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid path
      const result = await createBackup('/invalid/path/that/does/not/exist');
      
      // Should still succeed as it creates the backup structure
      expect(result.success).toBe(true);
    });
  });

  describe('validateBackup', () => {
    it('should validate a correct backup file', async () => {
      const result = await createBackup(testDir);
      const validation = validateBackup(result.backupFile!);
      
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should reject non-existent backup file', () => {
      const validation = validateBackup(join(testDir, 'non-existent.json'));
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('not found');
    });

    it('should reject invalid JSON', () => {
      const invalidFile = join(testDir, 'invalid.json');
      writeFileSync(invalidFile, 'not valid json');
      
      const validation = validateBackup(invalidFile);
      
      expect(validation.valid).toBe(false);
    });

    it('should reject backup with wrong version', async () => {
      const result = await createBackup(testDir);
      const content = require('fs').readFileSync(result.backupFile!, 'utf-8');
      const backup = JSON.parse(content);
      backup.version = '2.0.0';
      writeFileSync(result.backupFile!, JSON.stringify(backup));
      
      const validation = validateBackup(result.backupFile!);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('version');
    });
  });

  describe('listBackups', () => {
    it('should return empty array when no backups exist', () => {
      const backups = listBackups(testDir);
      expect(backups).toEqual([]);
    });

    it('should list backup files in directory', async () => {
      await createBackup(testDir, { outputPath: join(testDir, 'backup-1.json') });
      await createBackup(testDir, { outputPath: join(testDir, 'backup-2.json') });
      
      const backups = listBackups(testDir);
      expect(backups.length).toBe(2);
      expect(backups[0]).toContain('backup-');
    });
  });
});

describe('Phase 2: Restore Module', () => {
  let testDir: string;
  let backupFile: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-manager-restore-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    const result = await createBackup(testDir);
    backupFile = result.backupFile!;
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('restoreFromBackup', () => {
    it('should restore from valid backup in dry-run mode', async () => {
      const result = await restoreFromBackup(backupFile, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.extensionsRestored).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });

    it('should fail for non-existent backup file', async () => {
      const result = await restoreFromBackup(join(testDir, 'non-existent.json'));
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('not found');
    });

    it('should validate backup format before restoring', async () => {
      // Create invalid backup
      const invalidBackup = join(testDir, 'invalid-backup.json');
      writeFileSync(invalidBackup, JSON.stringify({ version: '2.0.0', agents: {} }));
      
      const result = await restoreFromBackup(invalidBackup);
      
      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('version');
    });
  });

  describe('previewRestore', () => {
    it('should preview valid backup', () => {
      const preview = previewRestore(backupFile);
      
      expect(preview.error).toBeUndefined();
      expect(preview.agents).toBeDefined();
      expect(preview.totalExtensions).toBeGreaterThanOrEqual(0);
      expect(preview.extensionsByAgent).toBeDefined();
    });

    it('should return error for non-existent file', () => {
      const preview = previewRestore(join(testDir, 'non-existent.json'));
      
      expect(preview.error).toContain('not found');
      expect(preview.agents).toEqual([]);
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidFile = join(testDir, 'invalid.json');
      writeFileSync(invalidFile, 'not valid json');
      
      const preview = previewRestore(invalidFile);
      
      expect(preview.error).toBeDefined();
      expect(preview.agents).toEqual([]);
    });
  });
});
