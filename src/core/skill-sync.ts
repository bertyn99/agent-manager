// Skill Sync - Synchronize skills across all agents

import { logger } from '../utils/logger.js';
import { createAgentRegistry } from '../adapters/index.js';
import { loadConfigSync } from '../core/config.js';
import type { AgentManagerConfig, AgentType, Skill } from '../core/types.js';

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
 * Sync skills across all agents
 */
export async function syncSkills(
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

  logger.info('Syncing skills across agents...');
  
  const registry = createAgentRegistry(config);
  const agents = registry.detect();
  
  if (agents.length === 0) {
    result.details.push('No agents detected');
    return result;
  }

  // Get all skills from all agents
  const allSkills = await registry.listAllSkills();
  
  // Group skills by name
  const skillsByName: Record<string, Skill[]> = {};
  for (const skill of allSkills) {
    if (!skillsByName[skill.name]) {
      skillsByName[skill.name] = [];
    }
    skillsByName[skill.name].push(skill);
  }

  // For each skill, check if it's installed on all agents
  for (const [skillName, skills] of Object.entries(skillsByName)) {
    const installedAgents = new Set(skills.map(s => s.agent));
    const allAgents = Object.keys(config.agents).filter(a => config.agents[a].enabled);
    
    const missingAgents = allAgents.filter(a => !installedAgents.has(a as AgentType));
    
    if (missingAgents.length > 0) {
      result.skipped++;
      result.details.push(`"${skillName}" missing from: ${missingAgents.join(', ')}`);
      
      if (!options.dryRun) {
        logger.info(`Would sync "${skillName}" to: ${missingAgents.join(', ')}`);
      }
    } else {
      result.synced++;
    }
  }

  result.success = result.failed === 0;
  
  if (result.synced > 0) {
    logger.success(`${result.synced} skills are in sync`);
  }
  if (result.skipped > 0) {
    logger.warn(`${result.skipped} skills need syncing`);
  }

  return result;
}

/**
 * Upgrade a specific skill
 */
export async function upgradeSkill(
  skillName: string,
  config: AgentManagerConfig,
  options: { force?: boolean }
): Promise<{ success: boolean; message: string }> {
  logger.info(`Upgrading skill "${skillName}"...`);
  
  // Get the skill from the manifest or vendor directory
  const vendorSkillPath = `${config.vendorPath}/${skillName}`;
  
  // For now, just report that upgrade is not yet fully implemented
  return {
    success: false,
    message: 'Upgrade functionality requires full implementation',
  };
}

/**
 * Upgrade all skills
 */
export async function upgradeAllSkills(
  config: AgentManagerConfig,
  options: { force?: boolean }
): Promise<{ success: boolean; upgraded: number; failed: number }> {
  logger.info('Upgrading all skills...');
  
  return {
    success: false,
    upgraded: 0,
    failed: 0,
  };
}
