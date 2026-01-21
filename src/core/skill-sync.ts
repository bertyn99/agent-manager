// Extension Sync - Synchronize extensions across all agents

import { logger } from '../utils/logger.js';
import { createAgentRegistry } from '../adapters/index.js';
import { loadConfigSync } from '../core/config.js';
import type { AgentManagerConfig, AgentType, Extension } from '../core/types.js';

export interface SyncOptions {
  dryRun?: boolean;
  agents?: AgentType[];
}

export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  failed: number;
  details: string[];
}

/**
 * Sync extensions across all agents
 */
export async function syncExtensions(
  config: AgentManagerConfig,
  options: SyncOptions
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    synced: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  logger.info('Syncing extensions across agents...');
  
  const registry = createAgentRegistry(config);
  const agents = registry.detect();
  
  if (agents.length === 0) {
    result.details.push('No agents detected');
    return result;
  }

  // Get all extensions from all agents
  const allExtensions = await registry.listAllExtensions();
  
  // Group extensions by name
  const extensionsByName: Record<string, Extension[]> = {};
  for (const extension of allExtensions) {
    if (!extensionsByName[extension.name]) {
      extensionsByName[extension.name] = [];
    }
    extensionsByName[extension.name].push(extension);
  }

  // For each extension, check if it's installed on all agents
  for (const [extensionName, extensions] of Object.entries(extensionsByName)) {
    const installedAgents = new Set(extensions.map(e => e.agent));
    const allAgents = Object.keys(config.agents).filter(a => config.agents[a].enabled);
    
    const missingAgents = allAgents.filter(a => !installedAgents.has(a as AgentType));
    
    if (missingAgents.length > 0) {
      result.skipped++;
      result.details.push(`"${extensionName}" missing from: ${missingAgents.join(', ')}`);
      
      if (!options.dryRun) {
        logger.info(`Would sync "${extensionName}" to: ${missingAgents.join(', ')}`);
      }
    } else {
      result.synced++;
    }
  }

  result.success = result.failed === 0;
  
  if (result.synced > 0) {
    logger.success(`${result.synced} extensions are in sync`);
  }
  if (result.skipped > 0) {
    logger.warn(`${result.skipped} extensions need syncing`);
  }

  return result;
}

/**
 * Upgrade a specific extension
 */
export async function upgradeExtension(
  extensionName: string,
  config: AgentManagerConfig,
  options: { force?: boolean }
): Promise<{ success: boolean; message: string }> {
  logger.info(`Upgrading extension "${extensionName}"...`);
  
  // Get the extension from the manifest or vendor directory
  const vendorExtensionPath = `${config.vendorPath}/${extensionName}`;
  
  // For now, just report that upgrade is not yet fully implemented
  return {
    success: false,
    message: 'Upgrade functionality requires full implementation',
  };
}

/**
 * Upgrade all extensions
 */
export async function upgradeAllExtensions(
  config: AgentManagerConfig,
  options: { force?: boolean }
): Promise<{ success: boolean; upgraded: number; failed: number }> {
  logger.info('Upgrading all extensions...');
  
  return {
    success: false,
    upgraded: 0,
    failed: 0,
  };
}
