import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { createAgentRegistry } from "../../adapters/index.js";
import { readManifest } from "../../core/manifest.js";

export interface ListOptions {
  json?: boolean;
  verbose?: boolean;
  agent?: string;
  type?: string;
  status?: string;
  table?: boolean;
}

export async function runList(options: ListOptions) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  let extensions = await registry.listAllExtensions();

  let filtered = extensions;

  if (options.agent) {
    const targetAgents = options.agent.split(",").map((a) => a.trim());
    const validAgents = ["claude-code", "cursor", "gemini-cli", "opencode"];
    const invalidAgents = targetAgents.filter((a) => !validAgents.includes(a));
    if (invalidAgents.length > 0) {
      logger.error(`Invalid agent(s): ${invalidAgents.join(", ")}`);
      logger.info(`Valid agents: ${validAgents.join(", ")}`);
      process.exit(1);
    }
    filtered = filtered.filter((e) => targetAgents.includes(e.agent));
  }

  if (options.type) {
    const targetTypes = options.type.split(",").map((t) => t.trim());
    const validTypes = ["mcp", "skill", "command"];
    const invalidTypes = targetTypes.filter((t) => !validTypes.includes(t));
    if (invalidTypes.length > 0) {
      logger.error(`Invalid type(s): ${invalidTypes.join(", ")}`);
      logger.info(`Valid types: ${validTypes.join(", ")}`);
      process.exit(1);
    }
    filtered = filtered.filter((e) => targetTypes.includes(e.type));
  }

  if (options.status) {
    const targetStatus = options.status.toLowerCase();
    if (targetStatus !== "enabled" && targetStatus !== "disabled") {
      logger.error(`Invalid status: ${options.status}`);
      logger.info("Valid statuses: enabled, disabled");
      process.exit(1);
    }
    filtered = filtered.filter(
      (e) =>
        (targetStatus === "enabled" && e.enabled) || (targetStatus === "disabled" && !e.enabled),
    );
  }

  if (filtered.length === 0) {
    logger.warn("No extensions found after applying filters.");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (options.table !== false) {
    const tableData = filtered.map((e) => ({
      Name: e.name,
      Type: e.type,
      Agents: Array.from(
        new Set(filtered.filter((ex) => ex.name === e.name).map((ex) => ex.agent)),
      ).join(", "),
      Status: e.enabled ? "✓" : "✗",
      Source: e.source?.type || "local",
    }));
    console.table(tableData);
    return;
  }

  const byType: Record<string, Record<string, Set<string>>> = {
    mcp: {},
    command: {},
    skill: {},
  };

  for (const extension of extensions) {
    const type = extension.type;
    if (!byType[type]) {
      byType[type] = {};
    }
    if (!byType[type][extension.name]) {
      byType[type][extension.name] = new Set();
    }
    byType[type][extension.name].add(extension.agent);
  }

  const typeNames: Record<string, string> = {
    mcp: "MCP Servers",
    command: "Commands",
    skill: "Skills",
  };

  const typeIcons: Record<string, string> = {
    mcp: "🔌",
    command: "⚡",
    skill: "📝",
  };

  for (const [type, byName] of Object.entries(byType)) {
    const extensionNames = Object.keys(byName).sort();
    if (extensionNames.length === 0) continue;

    const extCount = extensionNames.length;
    logger.info(`\n${typeNames[type]} (${extCount})\n`);

    for (const name of extensionNames) {
      const agents = Array.from(byName[name]).sort();
      const agentTags = agents
        .map((a) => {
          const shortName = a.replace("-cli", "").replace("-code", "").replace("opencode", "oc");
          return `[${shortName}]`;
        })
        .join(" ");

      logger.log(`  ${typeIcons[type]} ${name}`);
      logger.log(`     ${agentTags}`);
      if (options.verbose) {
        const ext = extensions.find((e) => e.name === name);
        if (ext?.description) {
          logger.log(`     ${ext.description.slice(0, 60)}...`);
        }
      }
    }
  }

  try {
    const manifest = readManifest(config.home);
    if (manifest.version === "2.0.0") {
      logger.info("\n=== From Manifest (v2.0.0) ===\n");

      logger.info("MCP Servers by Agent:\n");
      const mcpByAgent: Record<string, string[]> = {
        "claude-code": [],
        cursor: [],
        "gemini-cli": [],
        opencode: [],
      };

      for (const [mcpName, mcpConfig] of Object.entries(manifest.mcp)) {
        for (const agent of mcpConfig.agents) {
          if (mcpByAgent[agent]) {
            mcpByAgent[agent].push(mcpName);
          }
        }
      }

      for (const [agent, mcps] of Object.entries(mcpByAgent)) {
        if (mcps.length > 0) {
          const agentName = agent
            .replace("-cli", "")
            .replace("-code", "")
            .replace("opencode", "oc");
          logger.log(`  [${agentName}]: ${mcps.join(", ")}`);
        }
      }

      logger.info("\nSkills by Origin:\n");
      for (const originGroup of manifest.skills) {
        // Skip malformed origin groups (missing required fields)
        if (!originGroup.origin || !originGroup.skills) {
          continue;
        }

        logger.log(`  ${originGroup.origin}`);
        if (originGroup.include?.length > 0) {
          logger.log(`    Include: ${originGroup.include.join(", ")}`);
        }
        if (originGroup.exclude?.length > 0) {
          logger.log(`    Exclude: ${originGroup.exclude.join(", ")}`);
        }
        logger.log(`    Skills (${originGroup.skills.length}):`);
        for (const skill of originGroup.skills) {
          const agentTags =
            skill.agents.length > 0 ? skill.agents.map((a) => `[${a}]`).join(" ") : "[]";
          logger.log(`      - ${skill.folderName} ${agentTags}`);
          if (skill.description && options.verbose) {
            logger.log(`        ${skill.description.slice(0, 50)}...`);
          }
        }
      }
    } else {
      // Legacy manifest format - not implemented for display
    }
  } catch {
    // Manifest doesn't exist or is old format - skip display
  }
}

export const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all extensions across detected agents",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
    },
    verbose: {
      type: "boolean",
      description: "Show detailed output",
      alias: "v",
    },
    table: {
      type: "boolean",
      description: "Display as table (default)",
    },
    agent: {
      type: "string",
      description: "Filter by agent (comma-separated)",
    },
    type: {
      type: "string",
      description: "Filter by type (mcp, skill, command)",
    },
    status: {
      type: "string",
      description: "Filter by status (enabled, disabled)",
    },
  },
  run({ args }) {
    runList(args as ListOptions);
  },
});
