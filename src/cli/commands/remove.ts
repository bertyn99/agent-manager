import { defineCommand } from "citty";
import { withDryRun } from "../../core/dry-run.js";
import { logger } from "../../utils/logger.js";
import { loadConfigSync } from "../../core/config.js";
import { removeExtension } from "../../core/skill-remover.js";
import type { AgentType } from "../../core/types.js";

export interface RemoveOptions {
  extension?: string;
  from?: string;
  dryRun?: boolean;
}

const AVAILABLE_AGENTS = [
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "opencode", label: "OpenCode" },
  { value: "vscode-copilot", label: "VS Code Copilot" },
  { value: "openai-codex", label: "OpenAI Codex" },
];

export async function runRemove(args: RemoveOptions) {
  let extensionName = args.extension;
  if (!extensionName) {
    extensionName = (await logger.prompt("Enter extension name to remove:", {
      type: "text",
      required: true,
    })) as string;

    if (!extensionName) {
      logger.info("Operation cancelled.");
      return;
    }
  }

  let targetAgents: AgentType[] | undefined;
  if (args.from) {
    targetAgents = args.from.split(",").map((a) => a.trim()) as AgentType[];
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
      targetAgents = selectedAgents as AgentType[];
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

  const result = await withDryRun("remove extension", dryRun, async () => {
    const config = loadConfigSync();
    return await removeExtension(extensionName!, config, {
      from: targetAgents,
      silent: !dryRun, // Silent when actually running (we log our own summary)
    });
  });

  if (!dryRun) {
    // Result already logged by skill-remover when not silent
    if (!result.success) {
      process.exit(1);
    }
  }
}

export const removeCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove an extension from agents",
  },
  args: {
    extension: {
      type: "positional",
      description: "Extension name to remove",
      required: false,
    },
    from: {
      type: "string",
      description: "Target agents (comma-separated)",
    },
    dryRun: {
      type: "boolean",
      description: "Preview without applying",
    },
  },
  run({ args }) {
    runRemove(args as RemoveOptions);
  },
});
