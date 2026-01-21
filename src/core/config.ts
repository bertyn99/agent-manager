// Agent Manager Configuration
// Supports JSON config files with environment variable overrides

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs-extra';
import { join, dirname } from 'pathe';
import { homedir } from 'os';
import { z } from 'zod';
import type { AgentManagerConfig } from './types.js';

// Re-export validators
export * from './validators.js';

// Re-export types
export type { AgentManagerConfig };

// Configuration schema
export const AgentManagerConfigSchema = z.object({
  home: z.string().default('~/.config/agent-manager'),
  manifestPath: z.string().default('~/.config/agent-manager/skills.yaml'),
  skillsPath: z.string().default('~/.config/agent-manager/skill'),
  vendorPath: z.string().default('~/.config/agent-manager/vendor'),
  agents: z.record(z.object({
    enabled: z.boolean().default(true),
    configPath: z.string(),
    skillsPath: z.string().optional(),
  })).default({}),
});

/**
 * Expand ~ to home directory
 */
function expandHome(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Get the default configuration
 */
export function getDefaultConfig(): AgentManagerConfig {
  const home = process.env.AGENT_MANAGER_HOME || join(homedir(), '.config', 'agent-manager');
  const resolvedHome = expandHome(home);
  
  return {
    home: resolvedHome,
    manifestPath: join(resolvedHome, 'skills.yaml'),
    skillsPath: join(resolvedHome, 'skill'),
    vendorPath: join(resolvedHome, 'vendor'),
    agents: {
      'claude-code': {
        enabled: true,
        configPath: join(homedir(), '.claude', 'settings.json'),
        skillsPath: join(homedir(), '.claude', 'skills'),
      },
      'cursor': {
        enabled: true,
        configPath: join(homedir(), '.cursor', 'mcp.json'),
        skillsPath: join(homedir(), '.cursor', 'skills'),
      },
      'gemini-cli': {
        enabled: true,
        configPath: join(homedir(), '.gemini', 'settings.json'),
        skillsPath: join(homedir(), '.gemini', 'commands'),
      },
      'opencode': {
        enabled: true,
        configPath: join(homedir(), '.config', 'opencode', 'skills.yaml'),
        skillsPath: join(homedir(), '.config', 'opencode', 'skill'),
      },
      'vscode-copilot': {
        enabled: true,
        configPath: join(homedir(), '.vscode', 'copilot-agents.json'),
      },
      'openai-codex': {
        enabled: true,
        configPath: join(homedir(), '.codex', 'config.json'),
      },
    },
  };
}

/**
 * Load configuration synchronously (backward compatible)
 */
export function loadConfigSync(configPath?: string): AgentManagerConfig {
  const path = configPath || getDefaultConfig().manifestPath;
  
  if (!existsSync(path)) {
    return getDefaultConfig();
  }
  
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    const result = AgentManagerConfigSchema.parse(parsed);
    // Ensure all required fields are present
    const defaultConfig = getDefaultConfig();
    return {
      home: result.home || defaultConfig.home,
      manifestPath: result.manifestPath || defaultConfig.manifestPath,
      skillsPath: result.skillsPath || defaultConfig.skillsPath,
      vendorPath: result.vendorPath || defaultConfig.vendorPath,
      agents: result.agents as Record<string, AgentConfig> || defaultConfig.agents,
    };
  } catch {
    return getDefaultConfig();
  }
}

/**
 * Load configuration asynchronously using c12
 * Supports JSON, YAML, TOML formats
 */
export async function loadConfig(configPath?: string): Promise<AgentManagerConfig> {
  // For now, use the sync version which is more stable
  return loadConfigSync(configPath);
}

/**
 * Save configuration to file
 */
export function saveConfig(config: AgentManagerConfig): void {
  const path = config.manifestPath;
  const dir = dirname(path);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Convert config to JSON for saving
  const configData = {
    home: config.home,
    manifestPath: config.manifestPath,
    skillsPath: config.skillsPath,
    vendorPath: config.vendorPath,
    agents: {} as Record<string, unknown>,
  };

  for (const [type, agentConfig] of Object.entries(config.agents)) {
    configData.agents[type] = {
      enabled: agentConfig.enabled,
      configPath: agentConfig.configPath,
      skillsPath: agentConfig.skillsPath,
    };
  }

  writeFileSync(path, JSON.stringify(configData, null, 2));
}

/**
 * Ensure all required directories exist
 */
export function ensureDirs(config: AgentManagerConfig): void {
  mkdirSync(config.skillsPath, { recursive: true });
  mkdirSync(config.vendorPath, { recursive: true });

  // Ensure agent config directories exist
  for (const [, agentConfig] of Object.entries(config.agents)) {
    const configDir = dirname(agentConfig.configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    if (agentConfig.skillsPath && !existsSync(agentConfig.skillsPath)) {
      mkdirSync(agentConfig.skillsPath, { recursive: true });
    }
  }
}
