/**
 * Tests for Incremental Backup Feature
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

import { createIncrementalBackup, validateBackup, listBackups } from "./backup";
import type { BackupOptions } from "./types";

describe("Incremental Backup", () => {
  const testBackupDir = join(homedir(), ".config", "agent-manager", "test-backups");
  const testMetadataPath = join(homedir(), ".config", "agent-manager", "test-backup-metadata.json");
  const testConfigPath = join(homedir(), ".config", "agent-manager", "test-config");

  beforeEach(() => {
    // Clean up test directories
    if (existsSync(testBackupDir)) {
      rmSync(testBackupDir, { recursive: true });
    }
    if (existsSync(testMetadataPath)) {
      rmSync(testMetadataPath);
    }
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true });
    }

    // Create test directories
    mkdirSync(testBackupDir, { recursive: true });
    mkdirSync(testConfigPath, { recursive: true });
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(testBackupDir)) {
      rmSync(testBackupDir, { recursive: true });
    }
    if (existsSync(testMetadataPath)) {
      rmSync(testMetadataPath);
    }
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath, { recursive: true });
    }
  });

  describe("createIncrementalBackup()", () => {
    it("should create a full backup when incremental=false", async () => {
      const options: BackupOptions = {
        incremental: false,
        outputPath: join(testBackupDir, "backup-full.json"),
      };

      const result = await createIncrementalBackup(testConfigPath, options);

      expect(result.success).toBe(true);
      expect(result.backupFile).toBeDefined();
      expect(result.extensionCount).toBe(0);
      expect(existsSync(result.backupFile!)).toBe(true);

      const backupContent = JSON.parse(readFileSync(result.backupFile!, "utf-8"));
      expect(backupContent.version).toBe("2.0.0");
    });

    it("should create an incremental backup when incremental=true", async () => {
      // Create a previous backup metadata
      const metadata = {
        version: "1.0.0",
        lastBackupTimestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        fileHashes: {},
      };
      writeFileSync(testMetadataPath, JSON.stringify(metadata, null, 2));

      // Create a config file that was modified recently
      const configPath = join(testConfigPath, "claude-code", "config.json");
      mkdirSync(join(testConfigPath, "claude-code"), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ test: "data" }, null, 2));

      const options: BackupOptions = {
        incremental: true,
        outputPath: join(testBackupDir, "backup-incremental.json"),
      };

      const result = await createIncrementalBackup(testConfigPath, options);

      expect(result.success).toBe(true);
      expect(result.backupFile).toBeDefined();
    });

    it("should create empty incremental backup when no files modified", async () => {
      // Create a previous backup metadata with recent timestamp
      const metadata = {
        version: "1.0.0",
        lastBackupTimestamp: new Date().toISOString(), // Very recent
        fileHashes: {},
      };
      writeFileSync(testMetadataPath, JSON.stringify(metadata, null, 2));

      const options: BackupOptions = {
        incremental: true,
        outputPath: join(testBackupDir, "backup-empty.json"),
      };

      const result = await createIncrementalBackup(testConfigPath, options);

      expect(result.success).toBe(true);
      expect(result.extensionCount).toBe(0);
    });

    it("should use since timestamp from options if provided", async () => {
      const since = new Date(Date.now() - 172800000).toISOString(); // 2 days ago

      // Create a config file modified recently
      const configPath = join(testConfigPath, "claude-code", "config.json");
      mkdirSync(join(testConfigPath, "claude-code"), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ test: "recent" }, null, 2));

      const options: BackupOptions = {
        incremental: true,
        since,
        outputPath: join(testBackupDir, "backup-since.json"),
      };

      const result = await createIncrementalBackup(testConfigPath, options);

      expect(result.success).toBe(true);
      expect(result.backupFile).toBeDefined();
    });

    it("should create backup with provided options", async () => {
      const outputPath = join(testBackupDir, "backup-options.json");
      const options: BackupOptions = {
        incremental: false,
        outputPath,
      };

      const result = await createIncrementalBackup(testConfigPath, options);

      expect(result.success).toBe(true);
      expect(result.backupFile).toBeDefined();
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe("validateBackup()", () => {
    it("should validate a correct backup file", () => {
      const backupPath = join(testBackupDir, "backup-test.json");
      const validBackup = {
        version: "1.0.0",
        backedUpAt: new Date().toISOString(),
        agents: {},
      };
      writeFileSync(backupPath, JSON.stringify(validBackup));

      const result = validateBackup(backupPath);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject backup with missing version", () => {
      const backupPath = join(testBackupDir, "backup-no-version.json");
      const invalidBackup = {
        backedUpAt: new Date().toISOString(),
        agents: {},
      };
      writeFileSync(backupPath, JSON.stringify(invalidBackup));

      const result = validateBackup(backupPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("version");
    });

    it("should reject backup with wrong version", () => {
      const backupPath = join(testBackupDir, "backup-wrong-version.json");
      const invalidBackup = {
        version: "0.9.0",
        backedUpAt: new Date().toISOString(),
        agents: {},
      };
      writeFileSync(backupPath, JSON.stringify(invalidBackup));

      const result = validateBackup(backupPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("version");
    });

    it("should reject missing backup file", () => {
      const result = validateBackup("/nonexistent/backup.json");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("listBackups()", () => {
    it("should return empty array when no backups exist", () => {
      const backups = listBackups(testBackupDir);
      expect(backups).toEqual([]);
    });

    it("should list all backup files sorted by date", () => {
      // Create backup files with different dates
      const backup1 = join(testBackupDir, "backup-2025-01-01.json");
      const backup2 = join(testBackupDir, "backup-2025-01-02.json");
      const backup3 = join(testBackupDir, "backup-2025-01-03.json");

      writeFileSync(backup1, JSON.stringify({ test: 1 }));
      writeFileSync(backup2, JSON.stringify({ test: 2 }));
      writeFileSync(backup3, JSON.stringify({ test: 3 }));

      const backups = listBackups(testBackupDir);

      expect(backups).toHaveLength(3);
      expect(backups[0]).toContain("backup-2025-01-03.json"); // Most recent first
      expect(backups[2]).toContain("backup-2025-01-01.json"); // Oldest last
    });

    it("should only return backup files", () => {
      const backupFile = join(testBackupDir, "backup-test.json");
      const otherFile = join(testBackupDir, "other.json");

      writeFileSync(backupFile, JSON.stringify({ test: 1 }));
      writeFileSync(otherFile, JSON.stringify({ test: 2 }));

      const backups = listBackups(testBackupDir);

      expect(backups).toHaveLength(1);
      expect(backups[0]).toContain("backup-test.json");
    });
  });
});
