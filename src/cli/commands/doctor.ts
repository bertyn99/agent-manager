import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { createAgentRegistry } from "../../adapters/index.js";

export function runDoctor() {
  logger.info("Running health checks...");

  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  const agents = registry.detect();

  let checks = 0;
  let passed = 0;

  checks++;
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);
  if (majorVersion >= 18) {
    logger.success(`Node.js ${nodeVersion}`);
    passed++;
  } else {
    logger.error(`Node.js ${nodeVersion} (requires >=18)`);
  }

  for (const agent of agents) {
    checks++;
    if (agent.installed) {
      logger.success(`${agent.name} detected`);
      passed++;
    } else {
      logger.warn(`${agent.name} not found`);
    }
  }

  logger.info(`\n${passed}/${checks} checks passed.`);
}

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Run health checks on the CLI and environment",
  },
  run() {
    runDoctor();
  },
});
