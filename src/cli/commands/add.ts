import { defineCommand } from "citty";
import { logger } from "../../utils/logger.js";
import { loadConfigSync, ensureDirs } from "../../core/config.js";
import { addExtension, addGlobalSkill } from "../../core/skill-installer.js";
import type { AgentType } from "../../core/types.js";

export interface AddOptions {
  repo?: string;
  to?: string;
  dryRun?: boolean;
  nested?: boolean;
  include?: string;
  includeSelect?: boolean;
  excludeSelect?: boolean;
  exclude?: string;
  path?: string;
  global?: boolean;
}

const AVAILABLE_AGENTS = [
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "opencode", label: "OpenCode" },
];

const SKILL_MODE_OPTIONS = [
  { label: "Include (select what you want)", value: "include" },
  { label: "Exclude (select what you don't want)", value: "exclude" },
];

export async function runAdd(args: AddOptions) {
  const config = loadConfigSync();
  ensureDirs(config);

  let repoUrl = args.repo;
  if (!repoUrl) {
    repoUrl = (await logger.prompt("Enter repository URL:", {
      type: "text",
      placeholder: "https://github.com/owner/repo",
      required: true,
    })) as string;

    if (!repoUrl) {
      logger.info("Operation cancelled.");
      return;
    }
  }

  let targetAgents: AgentType[] | undefined;
  if (args.to) {
    targetAgents = args.to.split(",").map((a) => a.trim()) as AgentType[];
  } else {
    const selectedAgents = (await logger.prompt("Select target agent(s):", {
      type: "multiselect",
      options: AVAILABLE_AGENTS,
      required: false,
    })) as string[];

    if (!selectedAgents || selectedAgents.length === 0) {
      logger.info("No agents selected, will install to all detected agents.");
      targetAgents = undefined;
    } else {
      targetAgents = selectedAgents as AgentType[];
    }
  }

  let nested = args.nested;
  if (nested === undefined) {
    nested = (await logger.prompt("Is this a nested repository (extensions in subdirectories)?", {
      type: "confirm",
      initial: false,
    })) as boolean;
  }

  let nestedPath = args.path;
  if (!nestedPath) {
    nestedPath = (await logger.prompt("Path to skills (optional, press Enter to skip):", {
      type: "text",
      required: false,
    })) as string;
    if (nestedPath === "") {
      nestedPath = undefined;
    }
  }

  let skillMode: "include" | "exclude" | "skip" = "skip";
  let includeSkills: string[] | undefined;
  let excludeSkills: string[] | undefined;
  let includeSelect = args.includeSelect;
  let excludeSelect = args.excludeSelect;

  if (!args.include && !args.exclude && !args.includeSelect && !args.excludeSelect) {
    const modeResponse = (await logger.prompt("Select skills mode:", {
      type: "select",
      options: [
        { label: "Include (select what you want)", value: "include" },
        { label: "Exclude (select what you don't want)", value: "exclude" },
        { label: "Install all skills", value: "all" },
      ],
      initial: "all",
    })) as string;

    skillMode = (modeResponse || "all") as "include" | "exclude" | "skip";

    if (skillMode === "include") {
      includeSelect = true;
    } else if (skillMode === "exclude") {
      excludeSelect = true;
    }
  } else {
    if (args.include) {
      includeSkills = args.include.split(",").map((s) => s.trim());
    }
    if (args.exclude) {
      excludeSkills = args.exclude.split(",").map((s) => s.trim());
    }
  }

  let global = args.global;
  if (global === undefined) {
    global = (await logger.prompt("Install as global Claude skill?", {
      type: "confirm",
      initial: false,
    })) as boolean;
  }

  let dryRun = args.dryRun;
  if (dryRun === undefined) {
    const shouldPreview = (await logger.prompt("Preview changes before applying?", {
      type: "confirm",
      initial: true,
    })) as boolean;
    dryRun = shouldPreview !== false;
  }

  if (global) {
    if (targetAgents) {
      logger.warn("--global ignores agent selection, installing to Claude Code global skills");
    }
    const result = await addGlobalSkill(repoUrl, config, {
      dryRun,
      nested,
      include: includeSelect || excludeSelect ? undefined : includeSkills,
      exclude: includeSelect || excludeSelect ? undefined : excludeSkills,
      includeSelect,
      excludeSelect,
      path: nestedPath,
    });

    if (result.success) {
      logger.success(`Successfully added global skill(s) "${result.extension}"`);
      logger.info("Installed to: ~/.claude/skills/ (available to all Claude Code projects)");
    } else {
      logger.error(`Failed to add global skill: ${result.error}`);
      process.exit(1);
    }
    return;
  }

  const result = await addExtension(repoUrl, config, {
    to: targetAgents,
    dryRun,
    nested,
    include: includeSelect || excludeSelect ? undefined : includeSkills,
    exclude: includeSelect || excludeSelect ? undefined : excludeSkills,
    includeSelect,
    excludeSelect,
    path: nestedPath,
  });

  if (result.success) {
    logger.success(`Successfully added extension "${result.extension}"`);
    logger.info(`Installed to: ${result.installedTo.join(", ")}`);
    if (result.commit) {
      logger.info(`Commit: ${result.commit.slice(0, 7)}`);
    }
    if (result.tag) {
      logger.info(`Tag: ${result.tag}`);
    }
  } else {
    logger.error(`Failed to add extension: ${result.error}`);
    process.exit(1);
  }
}

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add an extension from a repository",
  },
  args: {
    repo: {
      type: "positional",
      description: "Repository URL or path",
      required: false,
    },
    to: {
      type: "string",
      description: "Target agents (comma-separated)",
    },
    dryRun: {
      type: "boolean",
      description: "Preview without applying",
    },
    nested: {
      type: "boolean",
      description: "Repository has nested extensions",
    },
    include: {
      type: "string",
      description: "Extensions to include (comma-separated)",
    },
    includeSelect: {
      type: "boolean",
      description: "Interactive selection for included extensions",
    },
    exclude: {
      type: "string",
      description: "Extensions to exclude (comma-separated)",
    },
    excludeSelect: {
      type: "boolean",
      description: "Interactive selection for excluded extensions",
    },
    path: {
      type: "string",
      description: "Subdirectory path",
    },
    global: {
      type: "boolean",
      description: "Install as Claude Code global skill",
    },
  },
  run({ args }) {
    runAdd(args as AddOptions);
  },
});
