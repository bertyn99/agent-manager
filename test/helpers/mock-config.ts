// Mock Configuration Factory for Agent Manager Tests

import type { AgentManagerConfig, AgentConfig, AgentType } from '../../src/core/types.js';

/**
 * Create a mock AgentManagerConfig with all agents configured
 * Supports partial overrides for specific agents or fields
 */
export function createMockConfig(overrides?: Partial<AgentManagerConfig>): AgentManagerConfig {
  const defaultConfig: AgentManagerConfig = {
    home: '/mock/config/agent-manager',
    manifestPath: '/mock/config/agent-manager/skills.yaml',
    skillsPath: '/mock/config/agent-manager/skill',
    vendorPath: '/mock/config/agent-manager/vendor',
    agents: {
      'claude-code': {
        enabled: true,
        configPath: '/mock/.claude/settings.json',
        skillsPath: '/mock/.claude/skills',
      },
      'cursor': {
        enabled: true,
        configPath: '/mock/.cursor/mcp.json',
        skillsPath: '/mock/.cursor/skills',
      },
      'gemini-cli': {
        enabled: true,
        configPath: '/mock/.gemini/settings.json',
        skillsPath: '/mock/.gemini/commands',
      },
      'opencode': {
        enabled: true,
        configPath: '/mock/.config/opencode/skills.yaml',
        skillsPath: '/mock/.config/opencode/skill',
      },
      'vscode-copilot': {
        enabled: true,
        configPath: '/mock/.vscode/copilot-agents.json',
      },
      'openai-codex': {
        enabled: true,
        configPath: '/mock/.codex/config.json',
      },
    },
  };

  // Apply overrides for top-level config fields
  if (overrides?.home) defaultConfig.home = overrides.home;
  if (overrides?.manifestPath) defaultConfig.manifestPath = overrides.manifestPath;
  if (overrides?.skillsPath) defaultConfig.skillsPath = overrides.skillsPath;
  if (overrides?.vendorPath) defaultConfig.vendorPath = overrides.vendorPath;

  // Apply overrides for specific agents
  if (overrides?.agents) {
    for (const [agentType, agentConfig] of Object.entries(overrides.agents)) {
      const config = defaultConfig.agents[agentType as AgentType];
      if (config) {
        defaultConfig.agents[agentType as AgentType] = {
          ...config,
          ...agentConfig,
        };
      }
    }
  }

  return defaultConfig;
}

/**
 * Create a mock config for a specific agent type
 * Supports partial overrides for the agent's config
 */
export function createMockAgentConfig(
  agentType: AgentType,
  overrides?: Partial<AgentConfig>
): AgentConfig {
  const mockConfig = createMockConfig();
  const agentConfig = mockConfig.agents[agentType];

  if (!agentConfig) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  return {
    ...agentConfig,
    ...overrides,
  };
}

/**
 * Create a mock config with a specific agent disabled
 */
export function createMockConfigWithDisabledAgent(disabledAgent: AgentType): AgentManagerConfig {
  const config = createMockConfig();
  config.agents[disabledAgent].enabled = false;
  return config;
}
