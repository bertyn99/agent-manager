// Extension Remover - Handles removing extensions from different agents

import { existsSync, unlinkSync } from 'fs-extra';
import { join } from 'pathe';
import { logger } from '../utils/logger.js';
import { createAgentRegistry } from '../adapters/index.js';
import type { AgentManagerConfig, AgentType } from '../core/types.js';
import { removeExtensionFromManifest } from './manifest.js';

export interface RemoveOptions {
  from?: AgentType[];
  force?: boolean;
}

export interface RemoveResult {
  success: boolean;
  extension: string;
  removedFrom: AgentType[];
  error?: string;
}

/**
 * Remove an extension from agents
 */
export async function removeExtension(
  extensionName: string,
  config: AgentManagerConfig,
  options: RemoveOptions
): Promise<RemoveResult> {
  const result: RemoveResult = {
    success: false,
    extension: extensionName,
    removedFrom: [],
  };

  // Determine target agents
  const targetAgents = options.from || Object.keys(config.agents) as AgentType[];
  
  logger.info(`Removing extension "${extensionName}"...`);
  logger.info(`Target agents: ${targetAgents.join(', ')}`);

  // Remove from each target agent
  for (const agentType of targetAgents) {
    if (!config.agents[agentType].enabled) {
      logger.warn(`${agentType} is disabled in config`);
      continue;
    }

    const removed = await removeFromAgent(extensionName, agentType, config, options);
    
    if (removed) {
      result.removedFrom.push(agentType);
      // Remove from manifest
      removeExtensionFromManifest(config.home, extensionName, agentType);
    }
  }

  result.success = result.removedFrom.length > 0;

  if (result.success) {
    logger.success(`Successfully removed from ${result.removedFrom.length} agent(s)`);
  } else {
    result.error = 'Extension not found in any target agent';
    logger.warn(result.error);
  }

  return result;
}

/**
 * Remove an extension from a specific agent
 */
async function removeFromAgent(
  extensionName: string,
  agentType: AgentType,
  config: AgentManagerConfig,
  options: RemoveOptions
): Promise<boolean> {
  const registry = createAgentRegistry(config);
  const adapter = registry.getAdapter(agentType);
  
  if (!adapter) {
    logger.warn(`No adapter found for agent: ${agentType}`);
    return false;
  }

  if (!adapter.detect()) {
    logger.warn(`${agentType} is not installed`);
    return false;
  }

  try {
    // Try to remove from adapter
    await adapter.removeExtension(extensionName);
    logger.success(`Removed from ${agentType}`);
    return true;
  } catch {
    // Check if it's a file-based extension (like OpenCode or Gemini CLI)
    if (agentType === 'opencode') {
      const agentConfig = config.agents['opencode'];
      if (agentConfig.skillsPath) {
        const extensionPath = join(agentConfig.skillsPath, `${extensionName}.md`);
        if (existsSync(extensionPath)) {
          unlinkSync(extensionPath);
          logger.success(`Removed from ${agentType}`);
          return true;
        }
      }
    }

    if (agentType === 'gemini-cli') {
      const agentConfig = config.agents['gemini-cli'];
      if (agentConfig.skillsPath) {
        const extensionPath = join(agentConfig.skillsPath, `${extensionName}.toml`);
        if (existsSync(extensionPath)) {
          unlinkSync(extensionPath);
          logger.success(`Removed from ${agentType}`);
          return true;
        }
      }
    }
  }

  return false;
}
