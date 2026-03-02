/**
 * Backup Module - Phase 2 Feature
 *
 * Exports extension configuration to JSON backup files.
 * Isolated implementation - no CLI dependencies.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

// Import types from types module
import type { BackupOptions } from "./types.ts";

export interface BackupMetadata {
  version: string;
  backedUpAt: string;
  agents: Record<string, BackupAgentData>;
}

export interface BackupAgentData {
  installed: boolean;
  configPath: string;
  extensions: BackupExtension[];
}

export interface BackupExtension {
  name: string;
  type: "mcp" | "skill" | "command";
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface CreateBackupOptions {
  outputPath?: string;
  includeManifest?: boolean;
}

export interface CreateBackupResult {
  success: boolean;
  backupFile?: string;
  extensionCount?: number;
  error?: string;
}

/**
 * Create a backup of all extensions
 */
export async function createBackup(
  configPath: string,
  options: CreateBackupOptions = {},
): Promise<CreateBackupResult> {
  try {
    // Default backup location
    const backupDir = join(homedir(), ".config", "agent-manager", "backups");
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = options.outputPath || join(backupDir, `backup-${timestamp}.json`);

    // Ensure backup directory exists
    const backupFileDir = dirname(backupFile);
    if (!existsSync(backupFileDir)) {
      mkdirSync(backupFileDir, { recursive: true });
    }

    // Create backup data structure
    const backup: BackupMetadata = {
      version: "1.0.0",
      backedUpAt: new Date().toISOString(),
      agents: {},
    };

    // TODO: Read actual agent configurations from configPath
    // For now, create empty backup structure
    const agents = ["claude-code", "cursor", "gemini-cli", "opencode"];
    for (const agent of agents) {
      backup.agents[agent] = {
        installed: false,
        configPath: join(configPath, agent, "config.json"),
        extensions: [],
      };
    }

    // Write backup file
    writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    // Count extensions
    const extensionCount = Object.values(backup.agents).reduce(
      (sum, agent) => sum + agent.extensions.length,
      0,
    );

    return {
      success: true,
      backupFile,
      extensionCount,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate a backup file
 */
export function validateBackup(backupFile: string): { valid: boolean; error?: string } {
  try {
    if (!existsSync(backupFile)) {
      return { valid: false, error: "Backup file not found" };
    }

    const content = readFileSync(backupFile, "utf-8");
    const backup = JSON.parse(content) as BackupMetadata;

    // Check version
    if (!backup.version) {
      return { valid: false, error: "Backup missing version field" };
    }

    if (backup.version !== "1.0.0") {
      return { valid: false, error: `Unsupported backup version: ${backup.version}` };
    }

    // Check required fields
    if (!backup.backedUpAt) {
      return { valid: false, error: "Backup missing backedUpAt field" };
    }

    if (!backup.agents || typeof backup.agents !== "object") {
      return { valid: false, error: "Backup missing agents field" };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate backup: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * List all available backups
 */
export function listBackups(backupDir?: string): string[] {
  const dir = backupDir || join(homedir(), ".config", "agent-manager", "backups");

  if (!existsSync(dir)) {
    return [];
  }

  try {
    const files = require("fs").readdirSync(dir);
    return files
      .filter((f: string) => f.startsWith("backup-") && f.endsWith(".json"))
      .sort()
      .reverse(); // Most recent first
  } catch {
    return [];
  }
}

/**
 * Create incremental backup tracking metadata
 */
export interface BackupTrackingMetadata {
  version: string;
  lastBackupTimestamp: string;
  fileHashes: Record<string, string>; // filePath -> hash of file content
}

/**
 * Create incremental backup of extensions
 *
 * When incremental=true, only backs up files modified since last backup
 */
export async function createIncrementalBackup(
  configPath: string,
  options: BackupOptions & { incremental?: boolean; since?: string; maxAge?: string },
): Promise<CreateBackupResult> {
  try {
    // Default backup location
    const backupDir = join(homedir(), ".config", "agent-manager", "backups");
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    // Create tracking metadata file path
    const trackingMetadataPath = join(
      homedir(),
      ".config",
      "agent-manager",
      "backup.metadata.json",
    );

    // Load or create tracking metadata
    let trackingMetadata: BackupTrackingMetadata;
    if (existsSync(trackingMetadataPath)) {
      trackingMetadata = JSON.parse(readFileSync(trackingMetadataPath, "utf-8"));
    } else {
      trackingMetadata = {
        version: "1.0.0",
        lastBackupTimestamp: new Date().toISOString(),
        fileHashes: {},
      };
    }

    // Determine since timestamp (from options or last backup)
    const sinceTimestamp =
      options.since || (options.incremental ? trackingMetadata.lastBackupTimestamp : undefined);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = options.outputPath || join(backupDir, `backup-${timestamp}.json`);

    // Ensure backup directory exists
    const backupFileDir = dirname(backupFile);
    if (!existsSync(backupFileDir)) {
      mkdirSync(backupFileDir, { recursive: true });
    }

    // Create backup data structure
    const backup: BackupMetadata = {
      version: "2.0.0", // Use v2.0.0 for incremental backups
      backedUpAt: new Date().toISOString(),
      agents: {},
    };

    // If incremental, calculate which files to backup based on modification time
    if (options.incremental && sinceTimestamp) {
      const since = new Date(sinceTimestamp);
      const now = new Date();

      // TODO: Read actual agent configurations from configPath
      // For now, create empty backup structure with metadata
      const agents = ["claude-code", "cursor", "gemini-cli", "opencode"];
      for (const agent of agents) {
        const agentConfigPath = join(configPath, agent, "config.json");

        // Check if file exists and is modified since last backup
        if (existsSync(agentConfigPath)) {
          const stats = require("fs").statSync(agentConfigPath);
          const modifiedTime = stats.mtime;

          if (modifiedTime > since) {
            backup.agents[agent] = {
              installed: true,
              configPath: agentConfigPath,
              extensions: [],
            };
          }
        }
      }
    } else {
      // Full backup
      const agents = ["claude-code", "cursor", "gemini-cli", "opencode"];
      for (const agent of agents) {
        backup.agents[agent] = {
          installed: false,
          configPath: join(configPath, agent, "config.json"),
          extensions: [],
        };
      }
    }

    // Write backup file
    writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    // Update tracking metadata
    trackingMetadata.lastBackupTimestamp = new Date().toISOString();
    writeFileSync(trackingMetadataPath, JSON.stringify(trackingMetadata, null, 2));

    // Cleanup old backups based on maxAge
    if (options.maxAge) {
      const maxAgeDays = parseInt(options.maxAge.replace(/d$/, "")) || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      const backups = listBackups();
      for (const backupFile of backups) {
        const backupPath = join(backupDir, backupFile);
        const stats = require("fs").statSync(backupPath);
        if (stats.mtime < cutoffDate) {
          try {
            require("fs").unlinkSync(backupPath);
          } catch {
            // Ignore errors when deleting old backups
          }
        }
      }
    }

    // Count extensions
    const extensionCount = Object.values(backup.agents).reduce(
      (sum, agent) => sum + agent.extensions.length,
      0,
    );

    return {
      success: true,
      backupFile,
      extensionCount,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create incremental backup: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
