// Extension Sync - Synchronize/replicate extensions across agents

import { existsSync, cpSync, rmSync, readdirSync } from "node:fs";
import { join } from "pathe";
import { logger } from "../utils/logger.js";
import { createAgentRegistry } from "../adapters/index.js";
import type { AgentManagerConfig, AgentType, Extension, SkillEntry, SkillOriginGroup, UnifiedSkill } from "../core/types.js";
import { addExtensionToManifestBatch, readManifest } from "./manifest.js";
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
  const allEnabledAgents = (Object.keys(config.agents) as AgentType[]).filter(
    (a) => config.agents[a]?.enabled,
  );

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

  // Get extensions from source agents (parallel)
  const sourceExtensions: Extension[] = [];
  const sourceExtensionResults = await Promise.allSettled(
    sourceAgents.map(async (agentType) => {
      const adapter = registry.getAdapter(agentType);
      if (adapter && adapter.detect()) {
        return adapter.listExtensions();
      }
      return [];
    })
  );

  for (const extResult of sourceExtensionResults) {
    if (extResult.status === "fulfilled") {
      sourceExtensions.push(...extResult.value);
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
    const manifestInstalled = new Set<AgentType>(
      manifest.skills
        .flatMap((g) => g.skills ?? [])
        .filter((s): s is SkillEntry => !!s && s.name === extensionName)
        .flatMap((s) => s.agents ?? []),
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

    // Filter to compatible and available agents first
    const compatibleTargets = missingTargets.filter(agentType => {
      const adapter = registry.getAdapter(agentType);
      if (!adapter || !adapter.detect()) return false;
      
      const formats = extension?.formats || { mcp: { enabled: isMcp } };
      const canInstall = checkAgentCompatibility(agentType, formats);
      
      if (!canInstall) {
        result.skipped++;
        result.details.push(`"${extensionName}" - ${agentType} doesn't support this format`);
        return false;
      }
      return true;
    });

    // Handle dry-run
    if (options.dryRun) {
      for (const agentType of compatibleTargets) {
        logger.info(`[DRY RUN] Would install "${extensionName}" to ${agentType}`);
      }
      continue;
    }

    // Parallel installation to all compatible agents
    const installResults = await Promise.allSettled(
      compatibleTargets.map(async (agentType) => {
        const adapter = registry.getAdapter(agentType)!;
        await adapter.addExtension({
          name: extension?.name || extensionName,
          type: sourceExt.type as "mcp" | "skill" | "command",
          agent: agentType,
          description: extension?.description || sourceExt.description,
          path: isMcp ? undefined : sourcePath,
          config: sourceConfig,
          enabled: true,
        });
        return agentType;
      })
    );

    // Collect results
    const successfulAgents: AgentType[] = [];
    for (const installResult of installResults) {
      if (installResult.status === "fulfilled") {
        successfulAgents.push(installResult.value);
        result.added.push(installResult.value);
        logger.success(`Installed "${extensionName}" to ${installResult.value}`);
      } else {
        result.failed++;
        const errorMsg = installResult.reason?.message || String(installResult.reason);
        result.details.push(`"${extensionName}" installation failed: ${errorMsg}`);
      }
    }

    // Batch update manifest for all successful installations
    if (successfulAgents.length > 0) {
      addExtensionToManifestBatch(config.home, extensionName, successfulAgents, {
        description: extension?.description || sourceExt.description,
        path: isMcp ? undefined : sourcePath,
      });
    }
  }

  result.success = result.failed === 0;

  return result;
}

/**
 * Check if an agent supports a given extension format
 */
function checkAgentCompatibility(agentType: AgentType, formats: UnifiedSkill["formats"]): boolean {
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
  options?: { cachePath?: string; originGroup?: SkillOriginGroup; force?: boolean; silent?: boolean },
): Promise<{ success: boolean; message: string; name: string }> {
  const silent = options?.silent ?? false;
  
  if (!silent) {
    logger.info(`Upgrading extension "${extensionName}"...`);
  }

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
      name: extensionName,
    };
  }

  // Find the origin group for this skill
  const originGroup = options?.originGroup ?? manifest.skills.find((g) => g.skills?.some((s) => s?.name === extensionName));

  if (!originGroup || !originGroup.origin || originGroup.origin === "local") {
    return {
      success: false,
      message: `Extension "${extensionName}" has no remote origin (local or no origin)`,
      name: extensionName,
    };
  }

  if (!silent) {
    logger.info(`Found origin: ${originGroup.origin}`);
  }

  // Use provided cache path or clone fresh
  let cachePath: string | undefined = options?.cachePath;
  
  if (!cachePath) {
    // Re-clone the origin to get updates
    try {
      const clonedPath = await cloneSourceToCache(
        originGroup.origin,
        originGroup.branch || "main",
        config.home,
      );

      if (!clonedPath) {
        return {
          success: false,
          message: `Failed to fetch updates from ${originGroup.origin}`,
          name: extensionName,
        };
      }
      cachePath = clonedPath;
    } catch (error) {
        return {
          success: false,
          message: `Failed to fetch updates from ${originGroup.origin}: ${error}`,
          name: extensionName,
        };
    }
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
      name: extensionName,
    };
  }

  // Detect the extension format
  const extension = detectExtensionFormat(skillPath);
  if (!extension) {
    return {
      success: false,
      message: `Invalid extension format for "${extensionName}"`,
      name: extensionName,
    };
  }

  // Sync to all agents where this skill is installed (parallel)
  const registry = createAgentRegistry(config);
  
  const updateResults = await Promise.allSettled(
    skill.agents.map(async (agentType) => {
      const adapter = registry.getAdapter(agentType);
      if (!adapter || !adapter.detect()) {
        if (!silent) {
          logger.warn(`Agent ${agentType} not available, skipping`);
        }
        return null;
      }

      // Remove old version first
      // Remove old version first
      const agentSkillsPath = join(config.agents[agentType]?.skillsPath || "", skill.folderName);
      if (existsSync(agentSkillsPath)) {
        rmSync(agentSkillsPath, { recursive: true });
      }

      // Copy updated version
      cpSync(skillPath, agentSkillsPath, { recursive: true });
      if (!silent) {
        logger.success(`Updated "${extensionName}" for ${agentType}`);
      }
      return agentType;
    })
  );

  const updatedCount = updateResults.filter(r => r.status === "fulfilled" && r.value !== null).length;

  if (updatedCount > 0) {
    return {
      success: true,
      message: `Successfully upgraded "${extensionName}" for ${updatedCount} agent(s)`,
      name: extensionName,
    };
  }

  return {
    success: false,
    message: `No agents were updated for "${extensionName}"`,
    name: extensionName,
  };
}

/**
 * Extract short repo name from URL
 */
function getShortRepoName(url: string): string {
  try {
    const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (match) return match[1];
    // Generic URL parsing
    const urlObj = new URL(url.replace("git@", "https://"));
    const pathParts = urlObj.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (pathParts.length >= 2) {
      return `${pathParts[0]}/${pathParts[1]}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Upgrade all extensions - optimized to clone each repo ONCE
 * Groups output by repository for cleaner UX
 */
export async function upgradeAllExtensions(
  config: AgentManagerConfig,
  _options?: { force?: boolean },
): Promise<{ success: boolean; upgraded: number; failed: number }> {
  const manifest = readManifest(config.home);
  const result = { success: false, upgraded: 0, failed: 0 };

  // Collect all origin groups with installed skills
  const originsToProcess: SkillOriginGroup[] = [];
  
  for (const originGroup of manifest.skills) {
    if (!originGroup.origin || originGroup.origin === "local") continue;
    if (!originGroup.skills || !Array.isArray(originGroup.skills)) continue;

    const hasInstalledSkills = originGroup.skills.some(
      (s) => s.agents && s.agents.length > 0
    );
    
    if (hasInstalledSkills) {
      originsToProcess.push(originGroup);
    }
  }

  if (originsToProcess.length === 0) {
    logger.info("No extensions to upgrade");
    return { success: true, upgraded: 0, failed: 0 };
  }

  // Count total skills to upgrade
  const totalSkills = originsToProcess.reduce((acc, g) => {
    return acc + (g.skills?.filter(s => s.agents && s.agents.length > 0).length || 0);
  }, 0);

  logger.info(`Upgrading ${totalSkills} skills from ${originsToProcess.length} repositories...`);

  // Process each unique origin
  for (const originGroup of originsToProcess) {
    const repoName = getShortRepoName(originGroup.origin);
    const skillsToUpgrade = (originGroup.skills ?? []).filter(
      s => s.agents && s.agents.length > 0
    );

    if (skillsToUpgrade.length === 0) continue;

    // Show spinner while fetching repo
    logger.start(`Fetching ${repoName} (${skillsToUpgrade.length} skills)...`);
    
    // Clone the origin ONCE
    let cachePath: string | null = null;
    try {
      cachePath = await cloneSourceToCache(
        originGroup.origin,
        originGroup.branch || "main",
        config.home,
      );

      if (!cachePath) {
        logger.fail(`Failed to fetch ${repoName}`);
        result.failed += skillsToUpgrade.length;
        continue;
      }
    } catch (error) {
      logger.fail(`Failed to fetch ${repoName}: ${error}`);
      result.failed += skillsToUpgrade.length;
      continue;
    }

    // Filter skills by include/exclude rules
    const skillFolderNames = originGroup.skills.map((s) => s.folderName);
    const filteredFolderNames = filterSkillsByRules(
      skillFolderNames,
      originGroup.include || [],
      originGroup.exclude || [],
    );

    const filteredSkills = skillsToUpgrade.filter((s) =>
      filteredFolderNames.includes(s.folderName),
    );

    // Skip if no skills pass the filter
    if (filteredSkills.length === 0) {
      logger.success(`${repoName} (0 skills - all excluded by rules)`);
      continue;
    }
    // Track results for this repo
    const repoResults: { name: string; success: boolean }[] = [];

    // Upgrade all skills from this origin in PARALLEL
    const upgradeResults = await Promise.allSettled(
      filteredSkills.map(async (skill) => {
        const upgradeResult = await upgradeExtension(skill.name, config, {
          cachePath: cachePath!,
          originGroup,
          silent: true, // Suppress individual logging
        });
        return { name: skill.name, ...upgradeResult };
      })
    );

    // Collect results - track skill names for rejected promises
    for (let i = 0; i < upgradeResults.length; i++) {
      const upgradeResult = upgradeResults[i];
      const skillName = filteredSkills[i]?.name || "unknown";
      
      if (upgradeResult.status === "fulfilled") {
        repoResults.push({
          name: upgradeResult.value.name,
          success: upgradeResult.value.success,
        });
        if (upgradeResult.value.success) {
          result.upgraded++;
        } else {
          result.failed++;
        }
      } else {
        // Rejected promise - track the skill name
        repoResults.push({ name: skillName, success: false });
        result.failed++;
      }
    }

    // Show repo summary
    const succeeded = repoResults.filter(r => r.success);
    const failed = repoResults.filter(r => !r.success);
    
    if (failed.length === 0) {
      logger.success(`${repoName} (${succeeded.length}/${repoResults.length})`);
      // Show upgraded skills on separate lines
      for (const s of succeeded) {
        logger.log(`  ✓ ${s.name}`);
      }
    } else {
      logger.warn(`${repoName} (${succeeded.length}/${repoResults.length} upgraded, ${failed.length} failed)`);
      for (const s of succeeded) {
        logger.log(`  ✓ ${s.name}`);
      }
      for (const s of failed) {
        logger.log(`  ✗ ${s.name}`);
      }
    }
  }

  // Final summary
  logger.log("");
  if (result.failed === 0) {
    logger.success(`Upgraded ${result.upgraded} skills from ${originsToProcess.length} repositories`);
  } else {
    logger.warn(`Upgraded ${result.upgraded}, failed ${result.failed} from ${originsToProcess.length} repositories`);
  }

  result.success = result.failed === 0;
  return result;
}
