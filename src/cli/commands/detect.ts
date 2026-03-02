import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync, ensureDirs } from "../../core/config.js";
import { createAgentRegistry } from "../../adapters/index.js";

function runDetect() {
  logger.info("Detecting AI Agents...");

  const config = loadConfigSync();
  ensureDirs(config);
  const registry = createAgentRegistry(config);
  const agents = registry.detect();

  if (agents.length === 0) {
    logger.warn("No supported AI agents detected.");
    logger.info("Install Claude Code, Cursor, Gemini CLI, or OpenCode to get started.");
    return;
  }

  for (const agent of agents) {
    const status = agent.installed ? "✓ Installed" : "✗ Not installed";
    logger.info(`${agent.name}: ${status} (${agent.extensions.length} extensions)`);
  }

  logger.success(`Found ${agents.length} agent(s)`);
}

export const detectCommand = defineCommand({
  meta: {
    name: "detect",
    description: "Detect installed AI agents on the system",
  },
  run() {
    runDetect();
  },
});
