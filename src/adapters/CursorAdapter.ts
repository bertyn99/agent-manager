import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { readJSON } from "fs-extra/esm";
import { join } from "pathe";
import { AgentAdapter, AgentType, DetectedAgent, Extension } from "../types.js";
import { AgentManagerConfig } from "../config.js";
import { transportValidator } from "../core/transport-validator.js";

/**
 * Cursor Adapter
 *
 * Manages:
 * - MCP servers in ~/.cursor/mcp.json
 * - Agent Skills in ~/.cursor/skills/
 */
export class CursorAdapter implements AgentAdapter {
  readonly type: AgentType = "cursor";
  readonly name = "Cursor";

  constructor(private config: AgentManagerConfig) {}

  detect(): boolean {
    const agentConfig = this.config.agents["cursor"];
    return existsSync(agentConfig.configPath);
  }

  getSkillsPath(): string {
    return this.config.agents["cursor"].skillsPath || "";
  }

  parseFrontmatter(content: string): Record<string, string> {
    const frontmatter: Record<string, string> = {};
    const match = content.match(/^---\n([\s\S]*?)\n---/);

    if (match) {
      const lines = match[1].split("\n");
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          frontmatter[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }

    return frontmatter;
  }

  async listExtensions(): Promise<Extension[]> {
    const agentConfig = this.config.agents["cursor"];
    const extensions: Extension[] = [];

    // List MCP servers
    if (existsSync(agentConfig.configPath)) {
      try {
        const mcpConfig = await readJSON(agentConfig.configPath);
        const mcpServers = mcpConfig.mcpServers || {};

        for (const [name, cfg] of Object.entries(mcpServers)) {
          extensions.push({
            name,
            type: "mcp",
            agent: "cursor",
            description: `MCP server: ${name}`,
            config: cfg as Record<string, unknown>,
            enabled: true,
          });
        }
      } catch {
        // Ignore errors reading MCP config
      }
    }

    // List Agent Skills
    const skillsPath = this.getSkillsPath();
    if (existsSync(skillsPath)) {
      for (const dir of readdirSync(skillsPath)) {
        const skillPath = join(skillsPath, dir);
        const skillMdPath = join(skillPath, "SKILL.md");

        if (existsSync(skillMdPath)) {
          const content = readFileSync(skillMdPath, "utf-8");
          const frontmatter = this.parseFrontmatter(content);

          extensions.push({
            name: frontmatter.name || dir,
            type: "skill",
            agent: "cursor",
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
    const agentConfig = this.config.agents["cursor"];

    // Add MCP server with validation
    if (extension.type === "mcp" && extension.config) {
      // Validate MCP config before storing
      const mcpConfig = extension.config as Record<string, unknown>;
      const transportType = (mcpConfig.type as string) || "http";

      const validation = transportValidator.validateTransportType(transportType);
      if (!validation.valid) {
        throw new Error(`Invalid MCP transport type: ${validation.errors.join(", ")}`);
      }

      const mcpConfigFile = existsSync(agentConfig.configPath)
        ? await readJSON(agentConfig.configPath)
        : { mcpServers: {} };

      mcpConfigFile.mcpServers = mcpConfigFile.mcpServers || {};
      mcpConfigFile.mcpServers[extension.name] = extension.config;

      writeFileSync(agentConfig.configPath, JSON.stringify(mcpConfigFile, null, 2));
      return;
    }

    // Add Agent Skill
    if (extension.type === "skill" && extension.path) {
      const skillsPath = this.getSkillsPath();
      mkdirSync(skillsPath, { recursive: true });

      const targetPath = join(skillsPath, extension.name);
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true });
      }

      cpSync(extension.path, targetPath, { recursive: true });
      return;
    }

    throw new Error("Invalid extension type or missing config/path");
  }

  async removeExtension(extensionName: string): Promise<void> {
    const agentConfig = this.config.agents["cursor"];

    // Remove from MCP config
    if (existsSync(agentConfig.configPath)) {
      try {
        const mcpConfig = await readJSON(agentConfig.configPath);
        if (mcpConfig.mcpServers?.[extensionName]) {
          delete mcpConfig.mcpServers[extensionName];
          writeFileSync(agentConfig.configPath, JSON.stringify(mcpConfig, null, 2));
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
    const agentConfig = this.config.agents["cursor"];
    const installed = this.detect();

    return {
      type: "cursor",
      name: "Cursor",
      installed,
      configPath: agentConfig.configPath,
      skillsPath: this.getSkillsPath(),
      extensions: [],
    };
  }
}
