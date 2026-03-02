import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { createAgentRegistry } from "../../adapters/index.js";
import type { AgentType } from "../../core/types.js";

export interface CommandOptions {
  subcommand: string;
  name?: string;
  to?: string;
  description?: string;
  prompt?: string;
  output?: string;
  args?: string;
  totalBudget?: number;
}

export async function runCommand(args: CommandOptions) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);

  switch (args.subcommand) {
    case "list": {
      const extensions = await registry.listAllExtensions();
      const commands = extensions.filter((e) => e.type === "command");

      if (commands.length === 0) {
        logger.warn("No commands found.");
        return;
      }

      logger.info(`\nCommands (${commands.length})\n`);

      const byAgent: Record<string, typeof commands> = {};
      for (const cmd of commands) {
        if (!byAgent[cmd.agent]) {
          byAgent[cmd.agent] = [];
        }
        byAgent[cmd.agent].push(cmd);
      }

      for (const [agent, cmds] of Object.entries(byAgent)) {
        logger.info(`${agent.toUpperCase()}:`);
        for (const cmd of cmds) {
          const icon = cmd.enabled ? "✓" : "✗";
          logger.log(`  ${icon} ${cmd.name}`);
          if (cmd.description) {
            logger.log(`     ${cmd.description.slice(0, 60)}`);
          }
        }
      }
      break;
    }

    case "add": {
      if (!args.name) {
        logger.error("Command name is required");
        process.exit(1);
      }

      if (!args.prompt) {
        logger.error("Command prompt is required");
        process.exit(1);
      }

      const targetAgents = args.to ? args.to.split(",").map((a) => a.trim()) : undefined;

      const commandConfig: Record<string, unknown> = {
        name: args.name,
        description: args.description || "",
        prompt: args.prompt,
      };

      if (args.args) {
        commandConfig.args = args.args.split(",").map((a) => a.trim());
      }

      if (args.totalBudget) {
        commandConfig.totalBudget = args.totalBudget;
      }

      if (args.output) {
        commandConfig.output = args.output;
      }

      const result = await registry.addExtension(
        {
          name: args.name,
          type: "command",
          agent: (targetAgents?.[0] as AgentType) || "gemini-cli",
          config: commandConfig,
          enabled: true,
        },
        targetAgents,
      );

      if (result.success) {
        logger.success(`Command "${args.name}" added successfully`);
        logger.info(`Installed to: ${result.installedTo.join(", ")}`);
      } else {
        logger.error(`Failed to add command: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "remove": {
      if (!args.name) {
        logger.error("Command name is required");
        process.exit(1);
      }

      const targetAgents = args.to ? args.to.split(",").map((a) => a.trim()) : undefined;

      const result = await registry.removeExtension(args.name, targetAgents);

      if (result.success) {
        logger.success(`Command "${args.name}" removed successfully`);
        logger.info(`Removed from: ${result.removedFrom.join(", ")}`);
      } else {
        logger.error(`Failed to remove command: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    default:
      logger.error(`Unknown command subcommand: ${args.subcommand}`);
      process.exit(1);
  }
}

export const commandCommand = defineCommand({
  meta: {
    name: "command",
    description: "Manage Gemini CLI commands",
  },
  args: {
    subcommand: {
      type: "positional",
      description: "Subcommand (list, add, remove)",
      required: true,
    },
    name: {
      type: "string",
      description: "Command name",
    },
    to: {
      type: "string",
      description: "Target agents (comma-separated)",
    },
    description: {
      type: "string",
      description: "Command description",
    },
    prompt: {
      type: "string",
      description: "Command prompt",
    },
    output: {
      type: "string",
      description: "Output format (text, json)",
    },
    args: {
      type: "string",
      description: "Comma-separated arguments",
    },
    totalBudget: {
      type: "string",
      description: "Total budget for the command",
    },
  },
  run({ args }) {
    runCommand(args as unknown as CommandOptions);
  },
});
