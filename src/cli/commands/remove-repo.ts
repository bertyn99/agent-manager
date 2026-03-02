import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { removeAllFromRepo } from "../../core/skill-remover.js";

export interface RemoveRepoOptions {
  repo?: string;
}

export async function runRemoveRepo(args: RemoveRepoOptions) {
  let repoUrl = args.repo;

  if (!repoUrl) {
    repoUrl = (await logger.prompt("Enter repository URL to remove all skills from:", {
      type: "text",
      required: true,
    })) as string;

    if (!repoUrl) {
      logger.info("Operation cancelled.");
      return;
    }
  }

  const config = loadConfigSync();
  const result = await removeAllFromRepo(repoUrl, config);

  if (result.success) {
    logger.success(
      `Successfully removed ${result.removedSkills.length} skills from ${result.repo}`,
    );
    logger.info(`Removed from agents: ${result.removedFrom.join(", ")}`);
    if (result.errors.length > 0) {
      logger.warn("Errors encountered:");
      for (const error of result.errors) {
        logger.error(error);
      }
    }
  } else {
    logger.error(`Failed to remove skills: ${result.errors.join(", ")}`);
    process.exit(1);
  }
}

export const removeRepoCommand = defineCommand({
  meta: {
    name: "remove-repo",
    description: "Remove all skills from a repository on all agents",
  },
  args: {
    repo: {
      type: "positional",
      description: "Repository URL to remove all skills from",
      required: false,
    },
  },
  run({ args }) {
    runRemoveRepo(args as RemoveRepoOptions);
  },
});
