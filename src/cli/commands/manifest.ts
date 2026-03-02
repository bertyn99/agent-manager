import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import {
  readManifest,
  importFromOpenCodeManifest,
  clearManifest,
  syncFromSources,
} from "../../core/manifest.js";

export interface ManifestOptions {
  json?: boolean;
  import?: string;
  clear?: boolean;
  sync?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
}

export async function runManifest(args: ManifestOptions) {
  const config = loadConfigSync();

  if (args.clear) {
    logger.warn("Clearing agent-manager manifest...");
    clearManifest(config.home);
    logger.success("Manifest cleared");
    return;
  }

  if (args.sync) {
    logger.info("Syncing skills from configured sources...");
    const result = await syncFromSources(config.home, {
      dryRun: args.dryRun,
      verbose: args.verbose,
    });

    if (result.success) {
      logger.success("Sync complete");
    }

    if (result.details.length > 0 && args.verbose) {
      logger.info("Details:");
      for (const detail of result.details) {
        logger.log("  - " + detail);
      }
    }
    return;
  }

  if (args.import) {
    logger.info(`Importing from ${args.import}...`);
    const { imported, skipped } = importFromOpenCodeManifest(config.home, args.import);
    logger.success(`Imported ${imported} sources, skipped ${skipped} duplicates`);
    return;
  }

  const manifest = readManifest(config.home);

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  logger.info("Agent Manager Manifest");
  logger.info(`Version: ${manifest.version}`);
  logger.info(`Updated: ${manifest.updated}`);

  if (manifest.version === "2.0.0") {
    const mcpEntries = Object.entries(manifest.mcp);
    logger.info(`\nMCP Servers (${mcpEntries.length}):`);

    if (mcpEntries.length === 0) {
      logger.log("  (none)");
    } else {
      for (const [mcpName, mcpConfig] of mcpEntries) {
        logger.log(`  - ${mcpName}`);
        logger.log(`    Agents: ${mcpConfig.agents.join(", ")}`);
      }
    }

    logger.info(`\nSkills by Origin (${manifest.skills.length}):`);

    if (manifest.skills.length === 0) {
      logger.log("  (none)");
    } else {
      for (const originGroup of manifest.skills) {
        // Skip malformed origin groups (missing required fields)
        if (!originGroup.origin || !originGroup.skills) {
          continue;
        }

        logger.log(`  - ${originGroup.origin}`);
        logger.log(`    Path: ${originGroup.path}, Branch: ${originGroup.branch || "main"}`);
        if (originGroup.include?.length) {
          logger.log(`    Include: ${originGroup.include.join(", ")}`);
        }
        if (originGroup.exclude?.length) {
          logger.log(`    Exclude: ${originGroup.exclude.join(", ")}`);
        }
        logger.log(`    Skills (${originGroup.skills.length}):`);
        for (const skill of originGroup.skills) {
          const agentTags = skill.agents.length > 0 ? skill.agents.join(", ") : "(none)";
          logger.log(`      - ${skill.name} [${agentTags}]`);
          if (skill.description && args.verbose) {
            logger.log(`        ${skill.description.slice(0, 60)}...`);
          }
        }
      }
    }
  } else {
    const legacyManifest = manifest as Record<string, unknown>;

    logger.info(`\nSources (${legacyManifest.sources?.length || 0}):`);

    if (legacyManifest.sources?.length) {
      for (const source of legacyManifest.sources as Array<Record<string, unknown>>) {
        logger.log(`  - ${source.repo}`);
        logger.log(`    Path: ${source.path}, Branch: ${source.branch}`);
        if (source.include?.length) {
          logger.log(`    Include: ${(source.include as string[]).join(", ")}`);
        }
        if (source.exclude?.length) {
          logger.log(`    Exclude: ${(source.exclude as string[]).join(", ")}`);
        }
      }
    } else {
      logger.log("  (none)");
    }

    logger.info(`\nSkills (${legacyManifest.skills?.length || 0}):`);

    if (legacyManifest.skills?.length) {
      for (const skill of legacyManifest.skills as Array<Record<string, unknown>>) {
        logger.log(`  - ${skill.name}`);
        if (skill.description) {
          logger.log(`    ${String(skill.description).slice(0, 50)}...`);
        }
        const agents =
          (skill.agents as Array<Record<string, string>>)?.map((a) => a.agent).join(", ") ||
          "(none)";
        logger.log(`    Agents: ${agents}`);
      }
    } else {
      logger.log("  (none)");
    }
  }
}

export const manifestCommand = defineCommand({
  meta: {
    name: "manifest",
    description:
      "Show or manage agent-manager manifest (v2.0.0 - MCPs separated, skills grouped by origin)",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
    },
    import: {
      type: "string",
      description: "Import from OpenCode skills.yaml",
    },
    clear: {
      type: "boolean",
      description: "Clear the manifest (use with caution)",
    },
    sync: {
      type: "boolean",
      description: "Sync skills from origin repositories using include/exclude filters (v2.0.0)",
    },
    verbose: {
      type: "boolean",
      description: "Show detailed sync output (v2.0.0)",
    },
    dryRun: {
      type: "boolean",
      description: "Preview sync changes without applying",
      alias: "d",
    },
  },
  run({ args }) {
    runManifest(args as ManifestOptions);
  },
});
