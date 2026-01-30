/**
 * Restore Module - Phase 2 Feature
 * 
 * Imports extension configuration from JSON backup files.
 * Isolated implementation - no CLI dependencies.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { BackupMetadata, BackupExtension } from './backup.js';

export interface RestoreOptions {
  dryRun?: boolean;
}

export interface RestoreResult {
  success: boolean;
  extensionsRestored?: number;
  skipped?: number;
  failed?: number;
  errors?: string[];
}

/**
 * Restore extensions from a backup file
 */
export async function restoreFromBackup(
  backupFile: string,
  options: RestoreOptions = {}
): Promise<RestoreResult> {
  const errors: string[] = [];
  
  try {
    // Validate backup file exists
    if (!existsSync(backupFile)) {
      return {
        success: false,
        failed: 0,
        errors: [`Backup file not found: ${backupFile}`]
      };
    }

    // Read and parse backup
    const content = readFileSync(backupFile, 'utf-8');
    const backup: BackupMetadata = JSON.parse(content);

    // Validate backup format
    if (!backup.version || backup.version !== '1.0.0') {
      return {
        success: false,
        failed: 0,
        errors: [`Invalid backup version: ${backup.version || 'missing'}`]
      };
    }

    if (!backup.agents || typeof backup.agents !== 'object') {
      return {
        success: false,
        failed: 0,
        errors: ['Invalid backup format: missing agents data']
      };
    }

    // Count extensions to restore
    let extensionsToRestore = 0;
    for (const agentData of Object.values(backup.agents)) {
      extensionsToRestore += agentData.extensions.length;
    }

    if (options.dryRun) {
      return {
        success: true,
        extensionsRestored: 0,
        skipped: extensionsToRestore,
        failed: 0,
        errors: []
      };
    }

    // TODO: Actually restore extensions to agents
    // For now, just count what would be restored
    let restored = 0;
    let failed = 0;

    for (const [agentName, agentData] of Object.entries(backup.agents)) {
      for (const extension of agentData.extensions) {
        try {
          // TODO: Implement actual restoration logic
          // This would involve:
          // 1. Checking if agent is installed
          // 2. Adding extension to agent's configuration
          // 3. Validating extension configuration
          
          restored++;
        } catch (error) {
          failed++;
          errors.push(`Failed to restore ${extension.name} to ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return {
      success: failed === 0,
      extensionsRestored: restored,
      skipped: 0,
      failed,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    return {
      success: false,
      failed: 0,
      errors: [`Restore failed: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * Preview what would be restored from a backup
 */
export function previewRestore(backupFile: string): {
  agents: string[];
  totalExtensions: number;
  extensionsByAgent: Record<string, number>;
  error?: string;
} {
  try {
    if (!existsSync(backupFile)) {
      return {
        agents: [],
        totalExtensions: 0,
        extensionsByAgent: {},
        error: 'Backup file not found'
      };
    }

    const content = readFileSync(backupFile, 'utf-8');
    const backup: BackupMetadata = JSON.parse(content);

    const agents = Object.keys(backup.agents);
    const extensionsByAgent: Record<string, number> = {};
    let totalExtensions = 0;

    for (const [agentName, agentData] of Object.entries(backup.agents)) {
      const count = agentData.extensions.length;
      extensionsByAgent[agentName] = count;
      totalExtensions += count;
    }

    return {
      agents,
      totalExtensions,
      extensionsByAgent
    };

  } catch (error) {
    return {
      agents: [],
      totalExtensions: 0,
      extensionsByAgent: {},
      error: `Failed to preview restore: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
