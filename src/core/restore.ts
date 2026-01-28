// Restore Module - Import extension configuration
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs-extra';
import { join } from 'pathe';
import { load as yamlLoad } from 'js-yaml';
import { logger } from '../utils/logger.js';
import { loadConfigSync } from '../core/config.js';
import { createAgentRegistry } from '../adapters/index.js';
import type { AgentManagerConfig, AgentType } from '../core/types.js';
import type { BackupMetadata, BackupExtension } from './backup.js';

export interface RestoreOptions {
  dryRun?: boolean;
}

export interface RestoreResult {
  success: boolean;
  extensionsRestored: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Restore extensions from a backup file
 */
export async function restoreFromBackup(
  config: AgentManagerConfig,
  backupPath: string,
  options: RestoreOptions = {}
): Promise<RestoreResult> {
  logger.info(`Restoring from: ${backupPath}`);

  if (options?.dryRun) {
    logger.info('[DRY RUN] Would restore extensions from backup');
    logger.info(`Backup file: ${backupPath}`);
    return {
      success: true,
      extensionsRestored: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
  }

  if (!existsSync(backupPath)) {
    logger.error(`Backup file not found: ${backupPath}`);
    return {
      success: false,
      extensionsRestored: 0,
      skipped: 0,
      failed: 0,
      errors: [`Backup file not found: ${backupPath}`],
    };
  }

  let backup: BackupMetadata;
  try {
    backup = JSON.parse(readFileSync(backupPath, 'utf-8')) as BackupMetadata;
  } catch (error) {
    logger.error(`Failed to parse backup file: ${String(error)}`);
    return {
      success: false,
      extensionsRestored: 0,
      skipped: 0,
      failed: 0,
      errors: [`Failed to parse backup: ${String(error)}`],
    };
  }

  // Validate backup version
  if (backup.version !== '1.0.0') {
    logger.warn(`Backup version ${backup.version} may not be compatible with current agent-manager`);
    logger.info('Current version: 1.0.0');
  }

  const registry = createAgentRegistry(config);
  const detectedAgents = registry.detect();

  let totalRestored = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  // Restore extensions for each agent
  for (const [agentType, agentData] of Object.entries(backup.agents)) {
    if (!detectedAgents.find(a => a.type === agentType)) {
      logger.warn(`Agent ${agentType} not installed, skipping ${agentData.extensions.length} extensions`);
      totalSkipped += agentData.extensions.length;
      continue;
    }

    const adapter = registry.getAdapter(agentType);
    if (!adapter) {
      logger.warn(`No adapter found for ${agentType}, skipping ${agentData.extensions.length} extensions`);
      errors.push(`No adapter for ${agentType}`);
      continue;
    }

    for (const ext of agentData.extensions) {
      try {
        await adapter.addExtension({
          name: ext.name,
          type: ext.type,
          enabled: ext.enabled,
          config: ext.config as Record<string, unknown>,
        }, [agentType]);

        totalRestored++;
        logger.success(`Restored: ${ext.name} to ${agentType}`);
      } catch (error) {
        logger.error(`Failed to restore ${ext.name}: ${String(error)}`);
        errors.push(`Failed to restore ${ext.name}: ${String(error)}`);
      }
    }
  }

  logger.success(`Restore complete`);
  logger.info(`Restored: ${totalRestored} extensions`);
  if (totalSkipped > 0) {
    logger.info(`Skipped: ${totalSkipped} extensions`);
  }
  if (errors.length > 0) {
    logger.error(`Errors: ${errors.join(', ')}`);
  }

  return {
    success: errors.length === 0,
    extensionsRestored: totalRestored,
    skipped: totalSkipped,
    failed: errors.length,
    errors,
  };
}
