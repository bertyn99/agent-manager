#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { logger } from "../utils/logger.js";

import { detectCommand } from "./commands/detect.js";
import { listCommand } from "./commands/list.js";
import { addCommand } from "./commands/add.js";
import { removeCommand } from "./commands/remove.js";
import { removeRepoCommand } from "./commands/remove-repo.js";
import { syncCommand } from "./commands/sync.js";
import { cleanCommand } from "./commands/clean.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { doctorCommand } from "./commands/doctor.js";
import { manifestCommand } from "./commands/manifest.js";
import { mcpCommand } from "./commands/mcp.js";
import { commandCommand } from "./commands/command.js";

const mainCommand = defineCommand({
  meta: {
    name: "agent-manager",
    version: "2.0.0",
    description: "Universal CLI to manage extensions across AI coding agents",
  },
  args: {
    verbose: {
      type: "boolean",
      description: "Enable verbose output",
      alias: "v",
    },
  },
  run({ args }) {
    if (args.verbose) {
      logger.level = 4;
    }
    logger.info("Run with --help to see available commands");
  },
  subCommands: {
    detect: detectCommand,
    list: listCommand,
    doctor: doctorCommand,
    add: addCommand,
    remove: removeCommand,
    "remove-repo": removeRepoCommand,
    sync: syncCommand,
    clean: cleanCommand,
    upgrade: upgradeCommand,
    manifest: manifestCommand,
    mcp: mcpCommand,
    command: commandCommand,
  },
});

runMain(mainCommand);
