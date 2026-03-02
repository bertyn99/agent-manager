import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs-extra';
import { join } from 'pathe';
import { tmpdir } from 'os';
import type { AgentManagerConfig, AgentType } from '../../src/core/types.js';

export interface TestEnvironment {
  rootDir: string;
  config: AgentManagerConfig;
  paths: {
    claude: { config: string; skills: string };
    cursor: { config: string; skills: string };
    gemini: { config: string; commands: string };
    opencode: { config: string; skills: string };
  };
  cleanup: () => void;
}

export function createTestEnvironment(prefix = 'agm-test-'): TestEnvironment {
  const rootDir = mkdtempSync(join(tmpdir(), prefix));
  
  const paths = {
    claude: {
      config: join(rootDir, '.claude', 'settings.json'),
      skills: join(rootDir, '.claude', 'skills'),
    },
    cursor: {
      config: join(rootDir, '.cursor', 'mcp.json'),
      skills: join(rootDir, '.cursor', 'skills'),
    },
    gemini: {
      config: join(rootDir, '.gemini', 'settings.json'),
      commands: join(rootDir, '.gemini', 'commands'),
    },
    opencode: {
      config: join(rootDir, '.config', 'opencode', 'skills.yaml'),
      skills: join(rootDir, '.config', 'opencode', 'skill'),
    },
  };

  mkdirSync(join(rootDir, '.claude'), { recursive: true });
  mkdirSync(paths.claude.skills, { recursive: true });
  mkdirSync(join(rootDir, '.cursor'), { recursive: true });
  mkdirSync(paths.cursor.skills, { recursive: true });
  mkdirSync(join(rootDir, '.gemini'), { recursive: true });
  mkdirSync(paths.gemini.commands, { recursive: true });
  mkdirSync(join(rootDir, '.config', 'opencode'), { recursive: true });
  mkdirSync(paths.opencode.skills, { recursive: true });

  writeFileSync(paths.claude.config, JSON.stringify({ mcpServers: {} }, null, 2));
  writeFileSync(paths.cursor.config, JSON.stringify({ mcpServers: {} }, null, 2));
  writeFileSync(paths.gemini.config, JSON.stringify({ mcpServers: {} }, null, 2));
  writeFileSync(paths.opencode.config, JSON.stringify({ mcp: {} }, null, 2));

  const agentManagerDir = join(rootDir, '.config', 'agent-manager');
  mkdirSync(agentManagerDir, { recursive: true });
  mkdirSync(join(agentManagerDir, 'skill'), { recursive: true });
  mkdirSync(join(agentManagerDir, 'vendor'), { recursive: true });

  const config: AgentManagerConfig = {
    home: agentManagerDir,
    manifestPath: join(agentManagerDir, 'skills.yaml'),
    skillsPath: join(agentManagerDir, 'skill'),
    vendorPath: join(agentManagerDir, 'vendor'),
    agents: {
      'claude-code': {
        enabled: true,
        configPath: paths.claude.config,
        skillsPath: paths.claude.skills,
      },
      'cursor': {
        enabled: true,
        configPath: paths.cursor.config,
        skillsPath: paths.cursor.skills,
      },
      'gemini-cli': {
        enabled: true,
        configPath: paths.gemini.config,
        skillsPath: paths.gemini.commands,
      },
      'opencode': {
        enabled: true,
        configPath: paths.opencode.config,
        skillsPath: paths.opencode.skills,
      },
      'vscode-copilot': {
        enabled: false,
        configPath: join(rootDir, '.vscode', 'copilot-agents.json'),
      },
      'openai-codex': {
        enabled: false,
        configPath: join(rootDir, '.codex', 'config.json'),
      },
    },
  };

  const cleanup = () => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  };

  return { rootDir, config, paths, cleanup };
}

export function createTestSkill(skillsDir: string, skillName: string, content?: string): string {
  const skillPath = join(skillsDir, skillName);
  mkdirSync(skillPath, { recursive: true });
  
  const skillContent = content || `---
name: ${skillName}
description: Test skill for ${skillName}
---

# ${skillName}

This is a test skill.
`;
  
  writeFileSync(join(skillPath, 'SKILL.md'), skillContent);
  return skillPath;
}

export function addMcpToConfig(configPath: string, mcpName: string, mcpConfig: Record<string, unknown>): void {
  const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
  config.mcpServers = config.mcpServers || {};
  config.mcpServers[mcpName] = mcpConfig;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function createGeminiCommand(commandsDir: string, commandName: string, prompt = 'Test prompt'): string {
  const commandPath = join(commandsDir, `${commandName}.toml`);
  writeFileSync(commandPath, `description = "Test command"
prompt = """${prompt}"""
`);
  return commandPath;
}
