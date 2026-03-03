// Extension Remover - Handles removing extensions from different agents

import { existsSync, unlinkSync } from "node:fs";
import { join } from "pathe";
import { logger } from "../utils/logger.js";
import { createAgentRegistry } from "../adapters/index.js";
import type { AgentManagerConfig, AgentType } from "../core/types.js";
import {
  removeExtensionFromManifest,
  getSkillsByOrigin,
  removeAllSkillsFromOrigin,
} from "./manifest.js";

export interface RemoveOptions {
  from?: AgentType[];
  force?: boolean;
  silent?: boolean;
}

export interface RemoveResult {
  success: boolean;
  extension: string;
  removedFrom: AgentType[];
  error?: string;
}

export interface RemoveRepoResult {
  success: boolean;
  repo: string;
  removedSkills: string[];
  removedFrom: AgentType[];
  errors: string[];
}

/**
 * Remove an extension from agents
 */
export async function removeExtension(
  extensionName: string,
  config: AgentManagerConfig,
  options: RemoveOptions,
): Promise<RemoveResult> {
  const silent = options.silent ?? false;
  const result: RemoveResult = {
    success: false,
    extension: extensionName,
    removedFrom: [],
  };

  // Determine target agents
  const targetAgents = options.from || (Object.keys(config.agents) as AgentType[]);

  if (!silent) {
    logger.start(`Removing "${extensionName}" from ${targetAgents.length} agent(s)...`);
  }

  // Remove from each target agent (parallel)
  const removeResults = await Promise.allSettled(
    targetAgents.map(async (agentType) => {
      if (!config.agents[agentType]?.enabled) {
        return { agent: agentType, removed: false, reason: "disabled" };
      }

      const removed = await removeFromAgent(extensionName, agentType, config, options);
      if (removed) {
        removeExtensionFromManifest(config.home, extensionName, agentType);
      }
      return { agent: agentType, removed };
    })
  );

  // Collect results
  for (const removeResult of removeResults) {
    if (removeResult.status === "fulfilled" && removeResult.value.removed) {
      result.removedFrom.push(removeResult.value.agent);
    }
  }

  result.success = result.removedFrom.length > 0;

  if (!silent) {
    if (result.success) {
      logger.success(`Removed "${extensionName}" from ${result.removedFrom.length} agent(s)`);
      for (const agent of result.removedFrom) {
        logger.log(`  ✓ ${agent}`);
      }
    } else {
      result.error = "Extension not found in any target agent";
      logger.warn(result.error);
    }
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
  options: RemoveOptions,
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
    if (agentType === "opencode") {
      const agentConfig = config.agents?.["opencode"];
      if (!agentConfig) {
        return false;
      }

      if (agentConfig.skillsPath) {
        const extensionPath = join(agentConfig.skillsPath, `${extensionName}.md`);
        if (existsSync(extensionPath)) {
          unlinkSync(extensionPath);
          logger.success(`Removed from ${agentType}`);
          return true;
        }
      }
    }

    if (agentType === "gemini-cli") {
      const agentConfig = config.agents["gemini-cli"];
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

/**
 * Remove all skills from a repository on all agents
 */
export async function removeAllFromRepo(
  repo: string,
  config: AgentManagerConfig,
): Promise<RemoveRepoResult> {
  const result: RemoveRepoResult = {
    success: false,
    repo,
    removedSkills: [],
    removedFrom: [],
    errors: [],
  };

  logger.info(`Removing all skills from ${repo}...`);

  const existingSkills = getSkillsByOrigin(config.home, repo);

  if (existingSkills.length === 0) {
    result.errors.push(`No skills found for origin: ${repo}`);
    logger.warn(result.errors[0]);
    return result;
  }

  logger.info(`Found ${existingSkills.length} skills to remove`);

  const agentsSet = new Set<AgentType>();
  for (const skill of existingSkills) {
    for (const agent of skill.agents) {
      agentsSet.add(agent);
    }
  }
  result.removedFrom = Array.from(agentsSet);

  const registry = createAgentRegistry(config);

  for (const skill of existingSkills) {
    for (const agent of skill.agents) {
      try {
        const adapter = registry.getAdapter(agent);

        if (adapter && adapter.detect()) {
          await adapter.removeExtension(skill.name);
          logger.success(`Removed ${skill.name} from ${agent}`);
        } else {
          await removeFromAgent(skill.name, agent, config, {});
        }

        removeExtensionFromManifest(config.home, skill.name, agent);

        if (!result.removedSkills.includes(skill.name)) {
          result.removedSkills.push(skill.name);
        }
      } catch (error) {
        result.errors.push(`Failed to remove ${skill.name} from ${agent}: ${error}`);
      }
    }
  }

  removeAllSkillsFromOrigin(config.home, repo);

  result.success = result.removedSkills.length > 0 || existingSkills.length > 0;

  if (result.success) {
    if (result.removedSkills.length > 0) {
      logger.success(
        `Removed ${result.removedSkills.length} skills from ${result.removedFrom.length} agents`,
      );
    } else {
      logger.info(
        `Cleared ${existingSkills.length} orphaned skills from manifest (no agents assigned)`,
      );
    }
  } else {
    logger.error(`Failed to remove skills: ${result.errors.join(", ")}`);
  }

  return result;
}
