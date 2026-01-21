import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from 'fs-extra';
import { readJSON } from 'fs-extra';
import { join } from 'pathe';
import { homedir } from 'os';
import { AgentAdapter, AgentType, DetectedAgent, Extension } from '../types.js';
import { AgentManagerConfig } from '../config.js';
import { transportValidator } from '../core/transport-validator.js';

/**
 * Claude Code Adapter
 *
 * Manages:
 * - MCP servers in ~/.claude/settings.json
 * - Agent Skills in ~/.claude/skills/
 */
export class ClaudeAdapter implements AgentAdapter {
  readonly type: AgentType = 'claude-code';
  readonly name = 'Claude Code';

  constructor(private config: AgentManagerConfig) {}

  detect(): boolean {
    const agentConfig = this.config.agents['claude-code'];
    // Check for settings.json or skills directory
    return existsSync(agentConfig.configPath) || existsSync(this.getSkillsPath());
  }

  getSkillsPath(): string {
    return join(homedir(), '.claude', 'skills');
  }

  parseFrontmatter(content: string): Record<string, string> {
    const frontmatter: Record<string, string> = {};
    const match = content.match(/^---\n([\s\S]*?)\n---/);

    if (match) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          frontmatter[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    return frontmatter;
  }

  async listExtensions(): Promise<Extension[]> {
    const agentConfig = this.config.agents['claude-code'];
    const extensions: Extension[] = [];

    // List MCP servers
    if (existsSync(agentConfig.configPath)) {
      try {
        const settings = await readJSON(agentConfig.configPath);
        const mcpServers = settings.mcpServers || {};

        for (const [name, cfg] of Object.entries(mcpServers)) {
          extensions.push({
            name,
            type: 'mcp',
            agent: 'claude-code',
            description: `MCP server: ${name}`,
            config: cfg as Record<string, unknown>,
            enabled: true,
          });
        }
      } catch {
        // Ignore errors reading settings
      }
    }

    // List Agent Skills
    const skillsPath = this.getSkillsPath();
    if (existsSync(skillsPath)) {
      for (const dir of readdirSync(skillsPath)) {
        const skillPath = join(skillsPath, dir);
        const skillMdPath = join(skillPath, 'SKILL.md');

        if (existsSync(skillMdPath)) {
          const content = readFileSync(skillMdPath, 'utf-8');
          const frontmatter = this.parseFrontmatter(content);

          extensions.push({
            name: frontmatter.name || dir,
            type: 'skill',
            agent: 'claude-code',
            description: frontmatter.description,
            path: skillPath,
            enabled: true,
          });
        }
      }
    }

    return extensions;
  }

  async addExtension(extension: Extension): Promise<void> {
    const agentConfig = this.config.agents['claude-code'];

    // Add MCP server with validation
    if (extension.type === 'mcp' && extension.config) {
      // Validate MCP config before storing
      const mcpConfig = extension.config as Record<string, unknown>;
      const transportType = mcpConfig.type as string || 'http';

      const validation = transportValidator.validateTransportType(transportType);
      if (!validation.valid) {
        throw new Error(`Invalid MCP transport type: ${validation.errors.join(', ')}`);
      }

      const settings = existsSync(agentConfig.configPath)
        ? await readJSON(agentConfig.configPath)
        : { mcpServers: {} };

      settings.mcpServers = settings.mcpServers || {};
      settings.mcpServers[extension.name] = extension.config;

      writeFileSync(
        agentConfig.configPath,
        JSON.stringify(settings, null, 2)
      );
      return;
    }

    // Add Agent Skill
    if (extension.type === 'skill' && extension.path) {
      const skillsPath = this.getSkillsPath();
      mkdirSync(skillsPath, { recursive: true });

      const targetPath = join(skillsPath, extension.name);
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true });
      }

      cpSync(extension.path, targetPath, { recursive: true });
      return;
    }

    throw new Error('Invalid extension type or missing config/path');
  }

  async removeExtension(extensionName: string): Promise<void> {
    const agentConfig = this.config.agents['claude-code'];

    // Remove from MCP config
    if (existsSync(agentConfig.configPath)) {
      try {
        const settings = await readJSON(agentConfig.configPath);
        if (settings.mcpServers?.[extensionName]) {
          delete settings.mcpServers[extensionName];
          writeFileSync(
            agentConfig.configPath,
            JSON.stringify(settings, null, 2)
          );
          return;
        }
      } catch {
        // Ignore errors
      }
    }

    // Remove Agent Skill
    const skillsPath = this.getSkillsPath();
    const skillPath = join(skillsPath, extensionName);
    if (existsSync(skillPath)) {
      rmSync(skillPath, { recursive: true });
    }
  }

  getAgentInfoSync(): DetectedAgent {
    const agentConfig = this.config.agents['claude-code'];
    const installed = this.detect();

    return {
      type: 'claude-code',
      name: 'Claude Code',
      installed,
      configPath: agentConfig.configPath,
      skillsPath: this.getSkillsPath(),
      extensions: [],
    };
  }
}
