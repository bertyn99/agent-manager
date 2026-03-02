import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { upgradeExtension, upgradeAllExtensions } from "../../core/skill-sync.js";

export interface UpgradeOptions {
  extension?: string;
  all?: boolean;
  force?: boolean;
}

export async function runUpgrade(args: UpgradeOptions) {
  const config = loadConfigSync();

  if (!args.all && !args.extension) {
    logger.error("Error: Must specify either <EXTENSION> or --all");
    return;
  }

  if (args.all) {
    const result = await upgradeAllExtensions(config, { force: args.force });
    logger.info(`Upgraded: ${result.upgraded}, Failed: ${result.failed}`);
  } else {
    const result = await upgradeExtension(args.extension!, config, { force: args.force });
    logger.info(result.message);
  }
}

export const upgradeCommand = defineCommand({
  meta: {
    name: "upgrade",
    description: "Upgrade an extension to the latest version",
  },
  args: {
    extension: {
      type: "positional",
      description: "Extension name to upgrade",
      required: false,
    },
    all: {
      type: "boolean",
      description: "Upgrade all extensions",
    },
    force: {
      type: "boolean",
      description: "Force upgrade without confirmation",
    },
  },
  run({ args }) {
    runUpgrade(args as UpgradeOptions);
  },
});
