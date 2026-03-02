import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "pathe";
import { AgentAdapter, AgentType, DetectedAgent, Extension } from "../types.js";
import { AgentManagerConfig } from "../config.js";
import { commandManager, type CommandConfig } from "../core/command-manager.js";
import { transportValidator } from "../core/transport-validator.js";
import { logger } from "../utils/logger.js";

/**
 * Gemini CLI Adapter
 *
 * Manages:
 * - MCP servers in ~/.gemini/settings.json
 * - Commands in ~/.gemini/commands/*.toml
 */
export class GeminiAdapter implements AgentAdapter {
  readonly type: AgentType = "gemini-cli";
  readonly name = "Gemini CLI";

  constructor(private config: AgentManagerConfig) {}

  detect(): boolean {
    const agentConfig = this.config.agents["gemini-cli"];
    return existsSync(agentConfig.configPath);
  }

  async listExtensions(): Promise<Extension[]> {
    const agentConfig = this.config.agents["gemini-cli"];
    const extensions: Extension[] = [];

    // List MCP servers from settings.json
    if (existsSync(agentConfig.configPath)) {
      try {
        const settings = JSON.parse(readFileSync(agentConfig.configPath, "utf-8"));
        const mcpServers = settings.mcpServers || {};

        for (const [name, cfg] of Object.entries(mcpServers)) {
          extensions.push({
            name,
            type: "mcp",
            agent: "gemini-cli",
            description: `MCP server: ${name}`,
            config: cfg as Record<string, unknown>,
            enabled: true,
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    // List commands from commands/ directory using CommandManager
    const commandsPath = agentConfig.skillsPath;
    if (commandsPath && existsSync(commandsPath)) {
      const commands = commandManager.listCommands(commandsPath);

      for (const cmd of commands) {
        extensions.push({
          name: cmd.name,
          type: "command",
          agent: "gemini-cli",
          description: cmd.description || "Gemini command",
          config: {
            description: cmd.description,
            prompt: cmd.prompt,
            args: cmd.args,
            totalBudget: cmd.totalBudget,
            output: cmd.output,
          },
          enabled: true,
        });
      }
    }

    return extensions;
  }

  async addExtension(extension: Extension): Promise<void> {
    const agentConfig = this.config.agents["gemini-cli"];

    // Add MCP server to settings.json with validation
    if (extension.type === "mcp" && extension.config) {
      // Validate MCP config before storing
      const mcpConfig = extension.config as Record<string, unknown>;
      const transportType = (mcpConfig.type as string) || "http";

      const validation = transportValidator.validateTransportType(transportType);
      if (!validation.valid) {
        throw new Error(`Invalid MCP transport type: ${validation.errors.join(", ")}`);
      }

      const settings = existsSync(agentConfig.configPath)
        ? JSON.parse(readFileSync(agentConfig.configPath, "utf-8"))
        : { mcpServers: {} };

      settings.mcpServers = settings.mcpServers || {};
      settings.mcpServers[extension.name] = extension.config;

      writeFileSync(agentConfig.configPath, JSON.stringify(settings, null, 2));
    }

    // Add command to commands/ directory using CommandManager
    if (extension.type === "command" && extension.config) {
      const commandsPath = agentConfig.skillsPath;
      if (!commandsPath) {
        throw new Error("Gemini commands path not configured");
      }

      const config = extension.config as Record<string, unknown>;
      const commandConfig: CommandConfig = {
        name: extension.name,
        description: config.description as string,
        prompt: (config.prompt as string) || "",
        args: config.args as string[] | undefined,
        totalBudget: config.totalBudget as number | undefined,
        output: config.output as "text" | "json" | "streaming" | undefined,
      };

      const result = commandManager.addCommand(commandConfig, "gemini-cli", commandsPath);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Log warnings for special features
      if (result.warnings && result.warnings.length > 0) {
        for (const warning of result.warnings) {
          logger.warn(warning);
        }
      }
    }
  }

  async removeExtension(extensionName: string): Promise<void> {
    const agentConfig = this.config.agents["gemini-cli"];

    // Remove MCP server from settings.json
    if (existsSync(agentConfig.configPath)) {
      try {
        const settings = JSON.parse(readFileSync(agentConfig.configPath, "utf-8"));
        delete settings.mcpServers?.[extensionName];
        writeFileSync(agentConfig.configPath, JSON.stringify(settings, null, 2));
      } catch {
        // Ignore parse errors
      }
    }

    // Remove command from commands/ directory using CommandManager
    const commandsPath = agentConfig.skillsPath;
    if (commandsPath) {
      const result = commandManager.removeCommand(extensionName, "gemini-cli", commandsPath);

      if (!result.success && result.error) {
        logger.warn(`Failed to remove command: ${result.error}`);
      }
    }
  }

  async getAgentInfo(): Promise<DetectedAgent> {
    const agentConfig = this.config.agents["gemini-cli"];
    const installed = this.detect();
    const extensions = installed ? await this.listExtensions() : [];

    return {
      type: "gemini-cli",
      name: "Gemini CLI",
      installed,
      configPath: agentConfig.configPath,
      skillsPath: agentConfig.skillsPath,
      extensions: extensions,
    };
  }

  getAgentInfoSync(): DetectedAgent {
    const agentConfig = this.config.agents["gemini-cli"];
    const installed = this.detect();

    return {
      type: "gemini-cli",
      name: "Gemini CLI",
      installed,
      configPath: agentConfig.configPath,
      skillsPath: agentConfig.skillsPath,
      extensions: [],
    };
  }
}
