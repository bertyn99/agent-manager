import { defineCommand } from "citty";
import { existsSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "pathe";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { createAgentRegistry } from "../../adapters/index.js";
import { clearManifest } from "../../core/manifest.js";
import type { AgentType } from "../../core/types.js";

export interface CleanOptions {
  agent: string;
  skills?: boolean;
  mcp?: boolean;
  command?: boolean;
  all?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export async function runClean(args: CleanOptions) {
  const agentType = args.agent as AgentType;
  const config = loadConfigSync();

  if (!config.agents[agentType]) {
    logger.error(`Unknown agent: ${agentType}`);
    logger.info(`Available agents: claude-code, cursor, gemini-cli, opencode`);
    process.exit(1);
  }

  const agentConfig = config.agents[agentType];
  const registry = createAgentRegistry(config);
  const adapter = registry.getAdapter(agentType);

  if (!adapter || !adapter.detect()) {
    logger.warn(`${agentType} is not installed`);
    return;
  }

  const cleanSkills = args.all || args.skills || (!args.mcp && !args.command && !args.all);
  const cleanMcp = args.all || args.mcp || (!args.skills && !args.command && !args.all);
  const cleanCommands = args.all || args.command || false;

  const extensions = await adapter.listExtensions();
  const skills = extensions.filter((e) => e.type === "skill");
  const mcps = extensions.filter((e) => e.type === "mcp");
  const commands = extensions.filter((e) => e.type === "command");

  const totalToClean =
    (cleanSkills ? skills.length : 0) +
    (cleanMcp ? mcps.length : 0) +
    (cleanCommands ? commands.length : 0);

  if (totalToClean === 0) {
    logger.info(`${agentType} has no extensions matching the selected criteria`);
    return;
  }

  logger.info(`Extensions on ${agentType}:`);
  if (cleanSkills) logger.info(`  - Skills: ${skills.length}`);
  if (cleanMcp) logger.info(`  - MCP Servers: ${mcps.length}`);
  if (cleanCommands) logger.info(`  - Commands: ${commands.length}`);

  if (args.dryRun) {
    logger.info(`[DRY RUN] Would remove ${totalToClean} extensions`);
    return;
  }

  if (!args.force) {
    logger.warn(`This will remove ${totalToClean} extensions from ${agentType}`);
    logger.info(`Run with --force to skip this confirmation`);
    return;
  }

  if (cleanSkills && agentConfig.skillsPath && existsSync(agentConfig.skillsPath)) {
    const skillDirs = readdirSync(agentConfig.skillsPath);

    if (skillDirs.length > 0) {
      logger.info(`Removing ${skillDirs.length} skills from ${agentConfig.skillsPath}`);
      for (const skill of skillDirs) {
        const skillPath = join(agentConfig.skillsPath, skill);
        rmSync(skillPath, { recursive: true });
        logger.success(`Removed skill: ${skill}`);
      }
    }
  }

  if (cleanMcp && existsSync(agentConfig.configPath)) {
    try {
      const mcpConfig = JSON.parse(readFileSync(agentConfig.configPath, "utf-8"));

      if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
        const mcpNames = Object.keys(mcpConfig.mcpServers);
        logger.info(`Removing ${mcpNames.length} MCP servers from ${agentConfig.configPath}`);

        for (const name of mcpNames) {
          logger.success(`Removed MCP server: ${name}`);
        }

        mcpConfig.mcpServers = {};
        writeFileSync(agentConfig.configPath, JSON.stringify(mcpConfig, null, 2));
      } else {
        logger.info("No MCP servers to remove");
      }
    } catch (e) {
      logger.warn(`Could not clear MCP config: ${String(e)}`);
    }
  }

  if (cleanCommands && agentConfig.skillsPath && existsSync(agentConfig.skillsPath)) {
    const commandFiles = readdirSync(agentConfig.skillsPath).filter((f) => f.endsWith(".toml"));

    if (commandFiles.length > 0) {
      logger.info(`Removing ${commandFiles.length} commands from ${agentConfig.skillsPath}`);
      for (const cmd of commandFiles) {
        const cmdPath = join(agentConfig.skillsPath, cmd);
        rmSync(cmdPath);
        logger.success(`Removed command: ${cmd}`);
      }
    }
  }

  clearManifest(config.home, agentType);

  logger.success(`Cleaned ${totalToClean} extensions from ${agentType}`);
}

export const cleanCommand = defineCommand({
  meta: {
    name: "clean",
    description: "Clear all extensions from an agent",
  },
  args: {
    agent: {
      type: "positional",
      description: "Target agent",
      required: true,
    },
    skills: {
      type: "boolean",
      description: "Clean skills only",
    },
    mcp: {
      type: "boolean",
      description: "Clean MCP servers only",
    },
    command: {
      type: "boolean",
      description: "Clean commands only",
    },
    all: {
      type: "boolean",
      description: "Clean all extensions",
    },
    force: {
      type: "boolean",
      description: "Skip confirmation",
    },
    dryRun: {
      type: "boolean",
      description: "Preview without applying",
    },
  },
  run({ args }) {
    runClean(args as CleanOptions);
  },
});
