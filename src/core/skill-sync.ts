// Extension Sync - Synchronize/replicate extensions across agents

import { existsSync, cpSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, basename } from "pathe";
import { logger } from "../utils/logger.js";
import { createAgentRegistry } from "../adapters/index.js";
import type { AgentManagerConfig, AgentType, Extension, SkillEntry } from "../core/types.js";
import { addExtensionToManifest, readManifest } from "./manifest.js";
import { detectExtensionFormat } from "./skill-installer.js";
import { cloneSourceToCache } from "./manifest/sync.js";
import { filterSkillsByRules } from "./manifest/filter.js";

/**
 * Recursively search for a skill folder in a directory
 */
function findSkillFolderRecursively(basePath: string, folderName: string): string | null {
  // Check direct path first
  const directPath = join(basePath, folderName);
  if (existsSync(directPath)) {
    const skillMdPath = join(directPath, "SKILL.md");
    if (existsSync(skillMdPath)) {
      return directPath;
    }
  }

  // Search recursively
  try {
    const entries = readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = join(basePath, entry.name);
        const found = findSkillFolderRecursively(subPath, folderName);
        if (found) return found;
      }
    }
  } catch {
    // Ignore permission errors etc
  }

  return null;
}
export interface SyncOptions {
  dryRun?: boolean;
  from?: AgentType[];
  to?: AgentType[];
}

export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  failed: number;
  added: string[];
  details: string[];
}

/**
 * Sync/replicate extensions from source agents to target agents
 */
export async function syncExtensions(
  config: AgentManagerConfig,
  options: SyncOptions,
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    synced: 0,
    skipped: 0,
    failed: 0,
    added: [],
    details: [],
  };

  const registry = createAgentRegistry(config);
  const detectedAgents = registry.detect();

  if (detectedAgents.length === 0) {
    result.details.push("No agents detected");
    return result;
  }

  // Determine source and target agents
  const allEnabledAgents = Object.keys(config.agents).filter(
    (a) => config.agents[a].enabled,
  ) as AgentType[];

  const sourceAgents = options.from || allEnabledAgents;
  const targetAgents = options.to
    ? allEnabledAgents.filter((a) => options.to!.includes(a))
    : allEnabledAgents.filter((a) => !sourceAgents.includes(a));

  if (sourceAgents.length === 0) {
    result.details.push("No source agents specified or detected");
    return result;
  }

  if (targetAgents.length === 0) {
    result.details.push("No target agents (all agents already in source)");
    return result;
  }

  logger.info(`Syncing from: ${sourceAgents.join(", ")}`);
  logger.info(`Syncing to: ${targetAgents.join(", ")}`);

  // Get extensions from source agents
  const sourceExtensions: Extension[] = [];
  for (const agentType of sourceAgents) {
    const adapter = registry.getAdapter(agentType);
    if (adapter && adapter.detect()) {
      const extensions = await adapter.listExtensions();
      sourceExtensions.push(...extensions);
    }
  }

  if (sourceExtensions.length === 0) {
    result.details.push("No extensions found on source agents");
    return result;
  }

  // Group by name
  const extensionsByName: Record<string, Extension[]> = {};
  for (const extension of sourceExtensions) {
    if (!extensionsByName[extension.name]) {
      extensionsByName[extension.name] = [];
    }
    extensionsByName[extension.name].push(extension);
  }

  // For each extension, replicate to target agents
  for (const [extensionName, extensions] of Object.entries(extensionsByName)) {
    // Get the source extension info (prefer the first source agent)
    const sourceExt = extensions[0];

    // Check manifest to prevent duplicates
    const manifest = readManifest(config.home);
    const manifestInstalled = new Set(
      manifest.skills
        .filter((s) => s.name === extensionName)
        .flatMap((s) => s.agents.map((a) => a.agent)),
    );

    // Check what exists on disk
    const targetExtensions = await registry.listAllExtensions();
    const onDiskInstalled = new Set(
      targetExtensions
        .filter((e) => e.name === extensionName && targetAgents.includes(e.agent as AgentType))
        .map((e) => e.agent),
    );

    // Combine: if it's in manifest OR on disk, consider it "installed"
    const installedOnTarget = new Set([...manifestInstalled, ...onDiskInstalled]);

    const missingTargets = targetAgents.filter((a) => !installedOnTarget.has(a));

    if (missingTargets.length === 0) {
      result.synced++;
      if (manifestInstalled.size > onDiskInstalled.size) {
        result.details.push(
          `"${extensionName}" - already tracked in manifest (disk files may differ)`,
        );
      } else {
        result.details.push(`"${extensionName}" - already installed on target agents`);
      }
      continue;
    }

    // Get the source info
    const sourcePath = (sourceExt as Extension & { path?: string }).path;
    const sourceConfig = sourceExt.config;
    const isMcp = sourceExt.type === "mcp";

    // For MCP servers, we use config object; for skills, we need file path
    if (!isMcp && (!sourcePath || !existsSync(sourcePath))) {
      result.failed++;
      result.details.push(`"${extensionName}" - source path not found`);
      continue;
    }

    // Detect extension format for skills (MCP servers skip this)
    let extension: ReturnType<typeof detectExtensionFormat> | null = null;
    if (!isMcp && sourcePath) {
      extension = detectExtensionFormat(sourcePath);
      if (!extension) {
        result.failed++;
        result.details.push(`"${extensionName}" - invalid extension format`);
        continue;
      }
    }

    // Install to each missing target agent
    for (const agentType of missingTargets) {
      const adapter = registry.getAdapter(agentType);
      if (!adapter || !adapter.detect()) {
        continue;
      }

      // Check if agent supports this extension format
      const formats = extension?.formats || { mcp: { enabled: isMcp } };
      const canInstall = checkAgentCompatibility(agentType, formats);

      if (!canInstall) {
        result.skipped++;
        result.details.push(`"${extensionName}" - ${agentType} doesn't support this format`);
        continue;
      }

      if (options.dryRun) {
        logger.info(`[DRY RUN] Would install "${extensionName}" to ${agentType}`);
        continue;
      }

      try {
        await adapter.addExtension({
          name: extension?.name || extensionName,
          type: sourceExt.type as "mcp" | "skill" | "command",
          agent: agentType,
          description: extension?.description || sourceExt.description,
          path: isMcp ? undefined : sourcePath,
          config: sourceConfig,
          enabled: true,
        });

        // Track in manifest
        addExtensionToManifest(config.home, extensionName, agentType, {
          description: extension?.description || sourceExt.description,
          path: isMcp ? undefined : sourcePath,
        });

        result.added.push(agentType);
        logger.success(`Installed "${extensionName}" to ${agentType}`);
      } catch (error) {
        result.failed++;
        result.details.push(`"${extensionName}" to ${agentType}: ${String(error)}`);
      }
    }
  }

  result.success = result.failed === 0;

  return result;
}

/**
 * Check if an agent supports a given extension format
 */
function checkAgentCompatibility(agentType: AgentType, formats: Extension["formats"]): boolean {
  switch (agentType) {
    case "claude-code":
      // Claude Code supports both MCP servers and Agent Skills (SKILL.md format)
      return !!(formats.mcp?.enabled || formats.agentSkills?.enabled);
    case "cursor":
      // Cursor supports both MCP servers and Agent Skills (SKILL.md format in ~/.cursor/skills/)
      return !!(formats.mcp?.enabled || formats.agentSkills?.enabled);
    case "gemini-cli":
      return !!(
        formats.geminiCommand?.enabled ||
        formats.geminiAgent?.enabled ||
        formats.mcp?.enabled
      );
    case "opencode":
      return !!(formats.agentSkills?.enabled || formats.mcp?.enabled);
    case "vscode-copilot":
      return !!formats.vscode?.enabled;
    case "openai-codex":
      return !!formats.codex?.enabled;
    default:
      return false;
  }
}

/**
 * Upgrade a specific extension
 */
export async function upgradeExtension(
  extensionName: string,
  config: AgentManagerConfig,
  options: { force?: boolean },
): Promise<{ success: boolean; message: string }> {
  logger.info(`Upgrading extension "${extensionName}"...`);

  const manifest = readManifest(config.home);

  // Find the skill in the manifest
  const skill = manifest.skills
    .flatMap((g) => g.skills ?? [])
    .filter((s): s is SkillEntry => !!s)
    .find((s) => s.name === extensionName);

  if (!skill) {
    return {
      success: false,
      message: `Extension "${extensionName}" not found in manifest`,
    };
  }

  // Find the origin group for this skill
  const originGroup = manifest.skills.find((g) => g.skills?.some((s) => s?.name === extensionName));

  if (!originGroup || !originGroup.origin || originGroup.origin === "local") {
    return {
      success: false,
      message: `Extension "${extensionName}" has no remote origin (local or no origin)`,
    };
  }

  logger.info(`Found origin: ${originGroup.origin}`);

  // Re-clone the origin to get updates
  try {
    const cachePath = await cloneSourceToCache(
      originGroup.origin,
      originGroup.branch || "main",
      config.home,
    );

    if (!cachePath) {
      return {
        success: false,
        message: `Failed to fetch updates from ${originGroup.origin}`,
      };
    }

    // Find the skill in the updated cache - search recursively
    // First try the direct path from manifest
    let skillPath: string | null = null;
    const skillsPath = join(cachePath, originGroup.path || "skills");
    
    if (existsSync(skillsPath)) {
      skillPath = findSkillFolderRecursively(skillsPath, skill.folderName);
    }
    
    // If not found at manifest path, search entire cache
    if (!skillPath) {
      skillPath = findSkillFolderRecursively(cachePath, skill.folderName);
    }

    if (!skillPath) {
      return {
        success: false,
        message: `Skill folder "${skill.folderName}" not found in ${originGroup.origin}. The manifest may have incorrect origin/path, or the skill was removed from the repo.`,
      };
    }

    // Detect the extension format
    const extension = detectExtensionFormat(skillPath);
    if (!extension) {
      return {
        success: false,
        message: `Invalid extension format for "${extensionName}"`,
      };
    }

    // Sync to all agents where this skill is installed
    const registry = createAgentRegistry(config);
    let updatedCount = 0;

    for (const agentType of skill.agents) {
      const adapter = registry.getAdapter(agentType);
      if (!adapter || !adapter.detect()) {
        logger.warn(`Agent ${agentType} not available, skipping`);
        continue;
      }

      try {
        // Remove old version first
        const agentSkillsPath = join(config.agents[agentType]?.skillsPath || "", skill.folderName);
        if (existsSync(agentSkillsPath)) {
          rmSync(agentSkillsPath, { recursive: true });
        }

        // Copy updated version
        cpSync(skillPath, agentSkillsPath, { recursive: true });

        updatedCount++;
        logger.success(`Updated "${extensionName}" for ${agentType}`);
      } catch (error) {
        logger.error(`Failed to update ${agentType}: ${error}`);
      }
    }

    if (updatedCount > 0) {
      return {
        success: true,
        message: `Successfully upgraded "${extensionName}" for ${updatedCount} agent(s)`,
      };
    }

    return {
      success: false,
      message: `No agents were updated for "${extensionName}"`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Upgrade failed: ${error}`,
    };
  }
}

/**
 * Upgrade all extensions
 */
export async function upgradeAllExtensions(
  config: AgentManagerConfig,
  options: { force?: boolean },
): Promise<{ success: boolean; upgraded: number; failed: number }> {
  logger.info("Upgrading all extensions...");

  const manifest = readManifest(config.home);
  const result = { success: false, upgraded: 0, failed: 0 };

  // Process each origin group that has a remote origin
  for (const originGroup of manifest.skills) {
    // Skip entries without origin or local skills
    if (!originGroup.origin || originGroup.origin === "local") {
      continue;
    }

    // Skip entries without skills array
    if (!originGroup.skills || !Array.isArray(originGroup.skills)) {
      continue;
    }

    // Filter skills by include/exclude rules
    const skillFolderNames = originGroup.skills.map((s) => s.folderName);
    const filteredFolderNames = filterSkillsByRules(
      skillFolderNames,
      originGroup.include || [],
      originGroup.exclude || [],
    );

    // Only process skills that pass the filter
    const filteredSkills = originGroup.skills.filter((s) =>
      filteredFolderNames.includes(s.folderName),
    );

    for (const skill of filteredSkills) {
      // Only upgrade skills that are installed to at least one agent
      if (!skill.agents || skill.agents.length === 0) {
        continue;
      }

      const upgradeResult = await upgradeExtension(skill.name, config, { force: options.force });
      if (upgradeResult.success) {
        result.upgraded++;
      } else {
        result.failed++;
        logger.warn(`Failed to upgrade ${skill.name}: ${upgradeResult.message}`);
      }
    }
  }

  result.success = result.failed === 0;
  return result;
}
