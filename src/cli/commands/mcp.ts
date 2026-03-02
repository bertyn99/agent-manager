import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { createAgentRegistry } from "../../adapters/index.js";
import type { AgentType } from "../../core/types.js";

export interface MCPOptions {
  subcommand: string;
  name?: string;
  to?: string;
  command?: string;
  args?: string;
  url?: string;
  transport?: string;
  dryRun?: boolean;
}

const AVAILABLE_AGENTS = [
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "opencode", label: "OpenCode" },
];

export async function runMCP(args: MCPOptions) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);

  switch (args.subcommand) {
    case "list": {
      const extensions = await registry.listAllExtensions();
      const mcpServers = extensions.filter((e) => e.type === "mcp");

      if (mcpServers.length === 0) {
        logger.warn("No MCP servers found.");
        return;
      }

      logger.info(`\nMCP Servers (${mcpServers.length})\n`);

      const byAgent: Record<string, typeof mcpServers> = {};
      for (const mcp of mcpServers) {
        if (!byAgent[mcp.agent]) {
          byAgent[mcp.agent] = [];
        }
        byAgent[mcp.agent].push(mcp);
      }

      for (const [agent, servers] of Object.entries(byAgent)) {
        logger.info(`${agent.toUpperCase()}:`);
        for (const server of servers) {
          const icon = server.enabled ? "✓" : "✗";
          logger.log(`  ${icon} ${server.name}`);
          if (server.config) {
            const cfg = server.config as Record<string, unknown>;
            const transport = (cfg.type as string) || "unknown";
            logger.log(`     Transport: ${transport}`);
          }
        }
      }
      break;
    }

    case "add": {
      if (!args.name) {
        logger.error("MCP server name is required");
        process.exit(1);
      }

      const targetAgents = args.to ? args.to.split(",").map((a) => a.trim()) : undefined;

      const transportType = args.transport || "command";
      const mcpConfig: Record<string, unknown> = {
        type: transportType,
      };

      if (args.command) {
        mcpConfig.command = args.command;
      }

      if (args.args) {
        mcpConfig.args = args.args.split(",").map((a) => a.trim());
      }

      if (args.url) {
        mcpConfig.url = args.url;
      }

      const result = await registry.addExtension(
        {
          name: args.name,
          type: "mcp",
          agent: (targetAgents?.[0] as AgentType) || "gemini-cli",
          config: mcpConfig,
          enabled: true,
        },
        targetAgents,
      );

      if (result.success) {
        logger.success(`MCP server "${args.name}" added successfully`);
        logger.info(`Installed to: ${result.installedTo.join(", ")}`);
      } else {
        logger.error(`Failed to add MCP server: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "remove": {
      let serverName = args.name;
      if (!serverName) {
        serverName = (await logger.prompt("Enter MCP server name to remove:", {
          type: "text",
          required: true,
        })) as string;

        if (!serverName) {
          logger.info("Operation cancelled.");
          return;
        }
      }

      let targetAgents: string[] | undefined;
      if (args.to) {
        targetAgents = args.to.split(",").map((a) => a.trim());
      } else {
        const selectedAgents = (await logger.prompt("Select agent(s) to remove from:", {
          type: "multiselect",
          options: AVAILABLE_AGENTS,
          required: false,
        })) as string[];

        if (!selectedAgents || selectedAgents.length === 0) {
          logger.info("No agents selected, will remove from all agents.");
          targetAgents = undefined;
        } else {
          targetAgents = selectedAgents;
        }
      }

      let dryRun = args.dryRun;
      if (dryRun === undefined) {
        const shouldPreview = (await logger.prompt("Preview changes before applying?", {
          type: "confirm",
          initial: true,
        })) as boolean;

        dryRun = shouldPreview !== false;
      }

      if (dryRun) {
        logger.info(
          `[DRY-RUN] Would remove "${serverName}" from: ${targetAgents?.join(", ") || "all agents"}`,
        );
        return;
      }

      const result = await registry.removeExtension(serverName, targetAgents);

      if (result.success) {
        logger.success(`MCP server "${serverName}" removed successfully`);
        logger.info(`Removed from: ${result.removedFrom.join(", ")}`);
      } else {
        logger.error(`Failed to remove MCP server: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    default:
      logger.error(`Unknown MCP subcommand: ${args.subcommand}`);
      process.exit(1);
  }
}

export const mcpCommand = defineCommand({
  meta: {
    name: "mcp",
    description: "Manage MCP servers across AI agents",
  },
  args: {
    subcommand: {
      type: "positional",
      description: "Subcommand (list, add, remove)",
      required: true,
    },
    name: {
      type: "string",
      description: "MCP server name",
    },
    to: {
      type: "string",
      description: "Target agents (comma-separated)",
    },
    command: {
      type: "string",
      description: "Command to run MCP server",
    },
    args: {
      type: "string",
      description: "Comma-separated arguments",
    },
    url: {
      type: "string",
      description: "MCP server URL (for http transport)",
    },
    transport: {
      type: "string",
      description: "Transport type (stdio, http, sse, websocket)",
    },
    dryRun: {
      type: "boolean",
      description: "Preview without applying",
    },
  },
  run({ args }) {
    runMCP(args as MCPOptions);
  },
});
