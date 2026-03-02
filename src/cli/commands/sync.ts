import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync, ensureDirs } from "../../core/config.js";
import { syncExtensions } from "../../core/skill-sync.js";
import type { AgentType } from "../../core/types.js";

export interface SyncOptions {
  from?: string;
  to?: string;
  dryRun?: boolean;
}

export async function runSync(args: SyncOptions) {
  const config = loadConfigSync();
  ensureDirs(config);

  const sourceAgents = args.from
    ? (args.from.split(",").map((a) => a.trim()) as AgentType[])
    : undefined;

  const targetAgentsArg = args.to
    ? (args.to.split(",").map((a) => a.trim()) as AgentType[])
    : undefined;

  const result = await syncExtensions(config, {
    from: sourceAgents,
    to: targetAgentsArg,
    dryRun: args.dryRun,
  });

  if (result.synced > 0) {
    logger.success(`Synced ${result.synced} extensions`);
  }
  if (result.added.length > 0) {
    logger.info(`Added to: ${result.added.join(", ")}`);
  }
  if (result.skipped > 0) {
    logger.info(`${result.skipped} extensions already exist on target agents`);
  }
  if (result.failed > 0) {
    logger.warn(`${result.failed} extensions failed to sync`);
  }

  if (result.details.length > 0) {
    logger.info("Details:");
    for (const detail of result.details) {
      logger.log(`  - ${detail}`);
    }
  }
}

export const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Synchronize extensions across agents",
  },
  args: {
    from: {
      type: "string",
      description: "Source agents (comma-separated)",
    },
    to: {
      type: "string",
      description: "Target agents (comma-separated)",
    },
    dryRun: {
      type: "boolean",
      description: "Preview without applying",
    },
  },
  run({ args }) {
    runSync(args as SyncOptions);
  },
});
