// Extension Installer - Handles installing extensions to different agents

import {
  existsSync,
  readFileSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  lstatSync,
  unlinkSync,
  rmSync,
  symlinkSync,
  readdirSync,
} from "node:fs";
import { removeSync } from "fs-extra/esm";
import { join, basename, dirname } from "pathe";
import { homedir } from "os";
import { load as yamlLoad } from "js-yaml";
import { logger } from "../utils/logger.js";
import prompts from "prompts";
import { cloneRepo, parseRepoUrl } from "./git.js";
import { createAgentRegistry } from "../adapters/index.js";
import type { AgentManagerConfig, AgentType, Extension, UnifiedSkill } from "../core/types.js";
import { parse as parseToml } from "smol-toml";
import { addExtensionToManifest, readManifest, type AgentManagerManifest } from "./manifest.js";

export interface AddOptions {
  to?: AgentType[];
  only?: string[];
  depth?: number;
  branch?: string;
  dryRun?: boolean;
  nested?: boolean;
  include?: string[];
  exclude?: string[];
  includeSelect?: boolean;
  excludeSelect?: boolean;
  path?: string;
  silent?: boolean;
}

export interface AddResult {
  success: boolean;
  extension: string;
  installedTo: AgentType[];
  commit?: string;
  tag?: string;
  error?: string;
}

/**
 * Parse SKILL.md frontmatter to extract extension metadata
 */
export function parseExtensionMd(content: string): Record<string, unknown> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  try {
    // Simple YAML parsing for frontmatter
    const frontmatter = frontmatterMatch[1];
    const result: Record<string, unknown> = {};

    for (const line of frontmatter.split("\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        // Remove quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Handle arrays
        if (value.startsWith("[") && value.endsWith("]")) {
          const arrayValue = value
            .slice(1, -1)
            .split(",")
            .map((v) => v.trim().replace(/^["']|["']$/g, ""));
          result[key] = arrayValue as unknown;
          continue;
        }

        // Handle booleans
        if (value === "true") {
          result[key] = true;
          continue;
        }
        if (value === "false") {
          result[key] = false;
          continue;
        }

        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Parse extension.json file
 */
export function parseExtensionJson(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Check if a directory contains an extension
 */
export function detectExtensionFormat(repoPath: string): UnifiedSkill | null {
  // Check for SKILL.md
  const skillMdPath = join(repoPath, "SKILL.md");
  if (existsSync(skillMdPath)) {
    const content = readFileSync(skillMdPath, "utf-8");
    const frontmatter = parseExtensionMd(content);

    return {
      name: String(frontmatter.name || basename(repoPath)),
      description: String(frontmatter.description || ""),
      license: frontmatter.license as string | undefined,
      version: frontmatter.version as string | undefined,
      author: frontmatter.author as string | undefined,
      formats: {
        agentSkills: {
          enabled: true,
          path: "SKILL.md",
        },
      },
      content: {
        readme: content,
      },
      source: {
        type: "git",
        repo: repoPath,
      },
    };
  }

  // Check for extension.json
  const extensionJsonPath = join(repoPath, "extension.json");
  if (existsSync(extensionJsonPath)) {
    const content = readFileSync(extensionJsonPath, "utf-8");
    const extension = parseExtensionJson(content);
    return extension as unknown as UnifiedSkill;
  }

  // Check for gemini-command.toml (Gemini CLI commands)
  const geminiTomlPath = join(repoPath, "gemini-command.toml");
  if (existsSync(geminiTomlPath)) {
    const content = readFileSync(geminiTomlPath, "utf-8");
    const toml = parseToml(content);
    const extensionName = basename(repoPath)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    return {
      name: String(toml.name || extensionName),
      description: String(toml.description || ""),
      formats: {
        geminiCommand: {
          enabled: true,
          name: String(toml.name || extensionName),
          description: String(toml.description || ""),
        },
      },
      content: {
        prompt: toml.prompt as string | undefined,
      },
      source: {
        type: "git",
        repo: repoPath,
      },
    };
  }

  return null;
}

/**
 * Detect skills in a specific subfolder of a repository
 * Returns skill names with their subfolder prefix (e.g., "skills/nuxt")
 */
export function detectSkillsInSubfolder(repoPath: string, subfolder: string): string[] {
  const folderPath = join(repoPath, subfolder);
  if (!existsSync(folderPath)) {
    return [];
  }

  const skills: string[] = [];
  for (const dir of readdirSync(folderPath)) {
    const skillPath = join(folderPath, dir);
    if (existsSync(join(skillPath, "SKILL.md"))) {
      // Return with subfolder prefix for proper path construction
      skills.push(`${subfolder}/${dir}`);
    }
  }
  return skills;
}

/**
 * Detect if a repository is a multi-extension repo (has extensions/, skills/, plugins/, or packages/ subdirectory)
 * Checks multiple common folder patterns and returns skills with their subfolder paths
 */
export function detectMultiExtensionRepo(repoPath: string): string[] {
  const subfolders = ["skills", "extensions", "plugins", "packages"];
  const allSkills: string[] = [];

  for (const subfolder of subfolders) {
    const skills = detectSkillsInSubfolder(repoPath, subfolder);
    allSkills.push(...skills);
  }

  return allSkills;
}

/**
 * Detect skills in a flat skills folder (skills directly in folder, not in subdirectories)
 * This handles repos like jezweb/claude-skills where skills are in skills/ directly
 * Returns skill names without subfolder prefix (for root-level skills)
 */
export function detectSkillsInFolder(folderPath: string): string[] {
  if (!existsSync(folderPath)) {
    return [];
  }

  const skills: string[] = [];
  for (const dir of readdirSync(folderPath)) {
    const skillPath = join(folderPath, dir);
    if (existsSync(join(skillPath, "SKILL.md"))) {
      skills.push(dir);
    }
  }
  return skills;
}

/**
 * Detect plugins in a plugins/ folder (Claude Code plugin marketplace structure)
 * Looks for plugins in plugins/{name}/.claude-plugin/plugin.json format
 */
export function detectPluginsFolder(repoPath: string): string[] {
  const pluginsPath = join(repoPath, "plugins");
  if (!existsSync(pluginsPath)) {
    return [];
  }

  const plugins: string[] = [];
  for (const dir of readdirSync(pluginsPath)) {
    const pluginPath = join(pluginsPath, dir);
    // Check if it's a directory with .claude-plugin/plugin.json
    if (
      lstatSync(pluginPath).isDirectory() &&
      existsSync(join(pluginPath, ".claude-plugin", "plugin.json"))
    ) {
      plugins.push(dir);
    }
  }

  return plugins;
}

/**
 * Filter extensions based on include/exclude options
 */
function filterExtensions(
  allExtensions: string[],
  include?: string[],
  exclude?: string[],
): string[] {
  let filtered = allExtensions;

  if (include && include.length > 0) {
    filtered = filtered.filter((e) => include.includes(e));
  }

  if (exclude && exclude.length > 0) {
    filtered = filtered.filter((e) => !exclude.includes(e));
  }

  return filtered;
}

/**
 * Read OpenCode skills.yaml manifest
 */
function readOpenCodeManifest(config: AgentManagerConfig): Record<string, unknown> | null {
  const manifestPath = config.agents?.["opencode"]?.configPath;
  if (!manifestPath || !existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = readFileSync(manifestPath, "utf-8");
    return yamlLoad(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Add source to OpenCode manifest (for multi-skill repos)
 */
function addSourceToManifest(
  config: AgentManagerConfig,
  repo: string,
  skillsPath: string,
  plugins?: string[],
  options?: { include?: string[]; exclude?: string[] },
): void {
  const manifestPath = config.agents?.["opencode"]?.configPath;
  if (!manifestPath) {
    // OpenCode not configured, skip
    return;
  }
  const manifest = readOpenCodeManifest(config) || { sources: [], customized: [], local: [] };

  if (!Array.isArray((manifest as Record<string, unknown>).sources)) {
    (manifest as Record<string, unknown>).sources = [];
  }

  // Check if source already exists
  const sources = (manifest as { sources: Array<{ repo: string }> }).sources;
  if (sources.some((s) => s.repo === repo)) {
    logger.warn(`Source ${repo} already exists in manifest`);
    return;
  }

  // Add new source
  const newSource: Record<string, unknown> = {
    repo,
    path: skillsPath,
    branch: "main",
    include: options?.include?.length ? options.include : ["*"],
    exclude: options?.exclude,
  };

  if (plugins && plugins.length > 0) {
    newSource.plugins = plugins;
  }

  const manifestTyped = manifest as { sources: Array<Record<string, unknown>> };
  manifestTyped.sources.push(newSource);

  // Write manifest
  writeFileSync(manifestPath, require("js-yaml").dump(manifest));
  logger.success(`Added ${repo} to OpenCode manifest`);
}

/**
 * Install an extension to a specific agent
 */
async function installToAgent(
  extension: UnifiedSkill,
  agentType: AgentType,
  repoPath: string,
  config: AgentManagerConfig,
  options: AddOptions,
): Promise<boolean> {
  const registry = createAgentRegistry(config);
  const adapter = registry.getAdapter(agentType);

  if (!adapter) {
    logger.warn(`No adapter found for agent: ${agentType}`);
    return false;
  }

  if (!adapter.detect()) {
    logger.warn(`${agentType} is not installed`);
    return false;
  }

  // Check if extension format is supported for this agent
  const formats = extension.formats;
  let installed = false;

  try {
    // Install to Claude Code / Cursor (MCP servers)
    if ((agentType === "claude-code" || agentType === "cursor") && formats.mcp?.enabled) {
      const mcpConfig = formats.mcp;

      if (mcpConfig.type === "http" && mcpConfig.url) {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Would add MCP server: ${extension.name}`);
        } else {
          await adapter.addExtension({
            name: extension.name,
            type: "mcp",
            agent: agentType,
            description: extension.description,
            config: {
              url: mcpConfig.url,
              headers: mcpConfig.headers || {},
            },
          });
          logger.success(`Added MCP server to ${agentType}`);
        }
        installed = true;
      } else if (mcpConfig.type === "command" && mcpConfig.command) {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Would add MCP command: ${extension.name}`);
        } else {
          await adapter.addExtension({
            name: extension.name,
            type: "mcp",
            agent: agentType,
            description: extension.description,
            config: {
              command: mcpConfig.command,
              args: mcpConfig.args || [],
            },
          });
          logger.success(`Added MCP command to ${agentType}`);
        }
        installed = true;
      }
    }

    // Install to Gemini CLI (commands)
    if (agentType === "gemini-cli" && formats.geminiCommand?.enabled) {
      const geminiConfig = formats.geminiCommand;
      const agentConfig = config.agents["gemini-cli"];

      if (agentConfig.skillsPath && !options.dryRun) {
        const destPath = join(agentConfig.skillsPath, `${geminiConfig.name}.toml`);
        const extensionContent = generateGeminiToml(extension);
        mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, extensionContent);
        logger.success(`Added Gemini command: ${geminiConfig.name}`);
        installed = true;
      } else if (options.dryRun) {
        logger.info(`[DRY RUN] Would add Gemini command: ${geminiConfig.name}`);
        installed = true;
      }
    }

    // Install to OpenCode (skills)
    if (agentType === "opencode" && formats.agentSkills?.enabled) {
      const agentConfig = config.agents?.["opencode"];
      if (!agentConfig) {
        return false;
      }

      if (agentConfig.skillsPath) {
        const skillMdPath = join(repoPath, formats.agentSkills.path || "SKILL.md");
        if (existsSync(skillMdPath)) {
          // For OpenCode, we use symlinks (like agent-manager-v2)
          const targetPath = join(agentConfig.skillsPath, extension.name);

          if (options.dryRun) {
            logger.info(`[DRY RUN] Would symlink ${extension.name} to ${targetPath}`);
          } else {
            // Remove existing symlink if present
            if (existsSync(targetPath)) {
              if (lstatSync(targetPath).isSymbolicLink()) {
                unlinkSync(targetPath);
              } else {
                rmSync(targetPath, { recursive: true });
              }
            }
            symlinkSync(skillMdPath, targetPath);
            logger.success(`Added OpenCode extension: ${extension.name}`);
          }
          installed = true;
        }
      }
    }

    // Install to Cursor (Skills)
    if (agentType === "cursor" && formats.agentSkills?.enabled) {
      const agentConfig = config.agents["cursor"];

      if (options.dryRun) {
        logger.info(`[DRY RUN] Would add skill ${extension.name} to Cursor`);
      } else {
        await adapter.addExtension({
          name: extension.name,
          type: "skill",
          agent: "cursor",
          description: extension.description,
          path: repoPath,
        });
        logger.success(`Added skill to Cursor: ${extension.name}`);
      }
      installed = true;
    }

    // Install to Claude Code (Skills)
    if (agentType === "claude-code" && formats.agentSkills?.enabled) {
      const agentConfig = config.agents["claude-code"];

      if (options.dryRun) {
        logger.info(`[DRY RUN] Would add Agent Extension ${extension.name} to Claude Code`);
      } else {
        await adapter.addExtension({
          name: extension.name,
          type: "skill",
          agent: "claude-code",
          description: extension.description,
          path: repoPath,
        });
        logger.success(`Added Agent Extension to Claude Code: ${extension.name}`);
      }
      installed = true;
    }
  } catch (error) {
    logger.error(`Failed to install to ${agentType}: ${error}`);
    return false;
  }

  return installed;
}

/**
 * Generate Gemini CLI command TOML
 */
function generateGeminiToml(extension: UnifiedSkill): string {
  const lines = [`description = "${extension.description}"`];

  if (extension.content?.prompt) {
    lines.push(`prompt = """`);
    lines.push(extension.content.prompt);
    lines.push(`"""`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Main function to add an extension from repository
 */
export async function addExtension(
  repo: string,
  config: AgentManagerConfig,
  options: AddOptions,
): Promise<AddResult> {
  const result: AddResult = {
    success: false,
    extension: basename(repo),
    installedTo: [],
  };

  // Determine target agents
  const targetAgents = options.to || (Object.keys(config.agents) as AgentType[]);

  const silent = options.silent ?? false;

  if (!silent) {
    logger.info(`Adding extension from ${repo}...`);
    logger.info(`Target agents: ${targetAgents.join(", ")}`);
  }

  // Create temp directory for cloning
  const tempDir = join(config.vendorPath, "temp");
  mkdirSync(tempDir, { recursive: true });

  try {
    const clonePath = join(tempDir, basename(repo).replace(/\.git$/, ""));
    const isLocalPath = existsSync(repo) && lstatSync(repo).isDirectory();

    // Always clone if interactive skill selection is needed, otherwise skip in dry-run
    const needsClone = options.includeSelect || options.excludeSelect;
    if (options.dryRun && !needsClone) {
      if (isLocalPath) {
        logger.info(`[DRY RUN] Would copy local path ${repo} to ${clonePath}`);
      } else {
        logger.info(`[DRY RUN] Would clone ${repo} to ${clonePath}`);
      }
    } else {
      if (isLocalPath) {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Copying local path ${repo}...`);
        } else {
          logger.info(`Copying local path ${repo}...`);
        }
        cpSync(repo, clonePath, { recursive: true });
      } else {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Cloning ${repo} for skill selection...`);
        } else {
          logger.info(`Cloning ${repo}...`);
        }
        await cloneRepo(repo, clonePath, {
          branch: options.branch,
        });
      }
    }

    // If path is provided, scope to that subdirectory
    let targetPath = clonePath;
    if (options.path) {
      targetPath = join(clonePath, options.path);
      logger.info(`Scoping to custom path: ${options.path}`);
      // Skip validation only if repo wasn't cloned (dryRun without skill selection)
      const didClone = !options.dryRun || options.includeSelect || options.excludeSelect;
      if (didClone && !existsSync(targetPath)) {
        result.error = `Path not found: ${options.path}`;
        return result;
      }
    }

    // Detect if a repository is a multi-extension repo (has skills/, extensions/, plugins/, or packages/ subdirectory)
    // Returns skill paths with subfolder prefix (e.g., "skills/nuxt", "extensions/my-skill")
    const multiExtensions = detectMultiExtensionRepo(targetPath);

    // Also check for flat skills in root directory (skills directly in repo root)
    const flatSkills = detectSkillsInFolder(targetPath);

    // Combine both detection methods
    const allSkills = [...new Set([...multiExtensions, ...flatSkills])];
    const isMultiExtension = allSkills.length > 0;

    if (isMultiExtension) {
      // Multi-extension repo: add to manifest for OpenCode
      logger.info(`Detected ${allSkills.length} skills`);

      let filteredExtensions: string[];

      // Check if interactive selection is requested
      if (options.includeSelect || options.excludeSelect) {
        // Interactive selection mode using consola.prompt
        const displaySkills = allSkills.map((skill) => basename(skill));

        if (options.includeSelect && options.excludeSelect) {
          // Both flags: include selection first, then exclude from remaining
          const includeResponse = await logger.prompt(
            `Select skills to install (${allSkills.length} found):`,
            {
              type: "multiselect",
              options: displaySkills.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForInclude = (includeResponse as string[]) || [];
          const remainingSkills = allSkills.filter(
            (s) => !selectedForInclude.includes(basename(s)),
          );
          const remainingDisplay = remainingSkills.map((s) => basename(s));

          const excludeResponse = await logger.prompt(
            "Select skills to EXCLUDE from installation:",
            {
              type: "multiselect",
              options: remainingDisplay.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForExclude = (excludeResponse as string[]) || [];
          filteredExtensions = remainingSkills.filter(
            (s) => !selectedForExclude.includes(basename(s)),
          );
        } else if (options.includeSelect) {
          // Include selection mode
          const includeResponse = await logger.prompt(
            `Select skills to install (${allSkills.length} found):`,
            {
              type: "multiselect",
              options: displaySkills.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForInclude = (includeResponse as string[]) || [];
          filteredExtensions = allSkills.filter((s) => selectedForInclude.includes(basename(s)));
        } else {
          // Exclude selection mode
          const excludeResponse = await logger.prompt(
            "Select skills to EXCLUDE from installation:",
            {
              type: "multiselect",
              options: displaySkills.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForExclude = (excludeResponse as string[]) || [];
          filteredExtensions = allSkills.filter((s) => !selectedForExclude.includes(basename(s)));
        }
      } else {
        // Non-interactive mode: use filterExtensions
        filteredExtensions = filterExtensions(allSkills, options.include, options.exclude);
      }

      if (filteredExtensions.length === 0) {
        result.error = "No skills match the include/exclude filters";
        return result;
      } else {
        logger.info(
          `Installing ${filteredExtensions.length} skills: ${filteredExtensions.join(", ")}`,
        );

        // Add source to agent-manager manifest
        if (!options.dryRun) {
          addSourceToManifest(config, repo, options.path || "extensions", undefined, {
            include: options.include,
            exclude: options.exclude,
          });
        }

        // Install each skill individually
        for (const skillName of filteredExtensions) {
          const skillPath = join(targetPath, skillName);
          const extension = detectExtensionFormat(skillPath);

          if (extension) {
            result.extension = extension.name;

            for (const agentType of targetAgents) {
              if (!config.agents[agentType]?.enabled) continue;

              if (agentType === "opencode") {
                continue;
              }

              const installed = await installToAgent(
                extension,
                agentType,
                skillPath,
                config,
                options,
              );
              if (installed) {
                result.installedTo.push(agentType);

                // Track in manifest
                if (!options.dryRun) {
                  addExtensionToManifest(config.home, extension.name, agentType, {
                    description: extension.description,
                    repo,
                    path: options.path || "extensions",
                  });
                }
              }
            }
          }
        }

        if (targetAgents.includes("opencode")) {
          result.installedTo.push("opencode");
          logger.info('Run "agent-manager sync" to sync OpenCode extensions');
        }
      }
    } else {
      // Single extension repo: install directly
      const extension = detectExtensionFormat(targetPath);

      if (!extension) {
        result.error =
          "No valid extension format found (SKILL.md, extension.json, or gemini-command.toml)";
        logger.error(result.error);
        return result;
      }

      result.extension = extension.name;
      logger.success(`Detected extension: ${extension.name}`);

      if (extension.description) {
        logger.info(`Description: ${extension.description}`);
      }

      // Install to each target agent
      for (const agentType of targetAgents) {
        if (!config.agents[agentType]?.enabled) {
          logger.warn(`${agentType} is disabled or not configured`);
          continue;
        }

        const installed = await installToAgent(extension, agentType, targetPath, config, options);

        if (installed) {
          result.installedTo.push(agentType);

          // Track in manifest
          if (!options.dryRun) {
            addExtensionToManifest(config.home, extension.name, agentType, {
              description: extension.description,
              repo,
              path: options.path,
            });
          }
        }
      }
    }

    result.success = result.installedTo.length > 0;

    if (result.success) {
      logger.success(`Successfully installed to ${result.installedTo.length} agent(s)`);
    } else {
      result.error = "Extension format not compatible with any target agent";
      logger.warn(result.error);
    }
  } catch (error) {
    result.error = String(error);
    logger.error(`Failed to add extension: ${error}`);
  } finally {
    // Cleanup temp directory
    if (!options.dryRun && existsSync(tempDir)) {
      removeSync(tempDir);
    }
  }

  return result;
}

/**
 * Add a skill to Claude Code's global skills directory
 * These skills are available to all Claude Code projects
 */
export async function addGlobalSkill(
  repo: string,
  config: AgentManagerConfig,
  options: AddOptions,
): Promise<AddResult> {
  const result: AddResult = {
    success: false,
    extension: basename(repo).replace(/\.git$/, ""),
    installedTo: ["claude-code"],
  };

  const parsedUrl = parseRepoUrl(repo);
  const branch = options.branch || parsedUrl.branch;
  const urlPath = parsedUrl.path;

  // Claude Code's global skills path
  const globalSkillsPath = join(process.env.HOME || homedir(), ".claude", "skills");

  logger.info(`Adding global skill from ${repo}...`);
  logger.info(`Target: ${globalSkillsPath}`);

  // Create temp directory for cloning
  const tempDir = join(config.vendorPath, "temp");
  mkdirSync(tempDir, { recursive: true });

  try {
    // Clone repository
    const clonePath = join(tempDir, basename(repo).replace(/\.git$/, ""));

    // Always clone if interactive skill selection is needed, otherwise skip in dry-run
    const needsClone = options.includeSelect || options.excludeSelect;
    if (options.dryRun && !needsClone) {
      logger.info(`[DRY RUN] Would clone ${repo} to ${clonePath}`);
    } else {
      if (options.dryRun) {
        logger.info(`[DRY RUN] Cloning ${repo} for skill selection...`);
      } else {
        logger.info(`Cloning ${repo}...`);
      }
      await cloneRepo(repo, clonePath, {
        branch: branch,
      });
    }

    let targetPath = clonePath;
    const finalPath = options.path || urlPath;
    if (finalPath) {
      targetPath = join(clonePath, finalPath);
      logger.info(`Scoping to: ${finalPath}`);
      // Skip validation in dry-run mode since repo isn't actually cloned
      if (!options.dryRun && !existsSync(targetPath)) {
        result.error = `Path not found: ${options.path}`;
        return result;
      }
    }

    const multiSkills = detectMultiExtensionRepo(targetPath);
    const flatSkills = detectSkillsInFolder(targetPath);
    const skills = [...new Set([...multiSkills, ...flatSkills])];

    if (skills.length > 0) {
      // Multi-skill repo
      logger.info(`Detected ${skills.length} skills`);

      let filteredSkills: string[];

      // Check if interactive selection is requested
      if (options.includeSelect || options.excludeSelect) {
        // Interactive selection mode using consola.prompt
        const displaySkills = skills.map((skill) => basename(skill));

        if (options.includeSelect && options.excludeSelect) {
          // Both flags: include selection first, then exclude from remaining
          const includeResponse = await logger.prompt(
            `Select skills to install (${skills.length} found):`,
            {
              type: "multiselect",
              options: displaySkills.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForInclude = (includeResponse as string[]) || [];
          const remainingSkills = skills.filter((s) => !selectedForInclude.includes(basename(s)));
          const remainingDisplay = remainingSkills.map((s) => basename(s));

          const excludeResponse = await logger.prompt(
            "Select skills to EXCLUDE from installation:",
            {
              type: "multiselect",
              options: remainingDisplay.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForExclude = (excludeResponse as string[]) || [];
          filteredSkills = remainingSkills.filter((s) => !selectedForExclude.includes(basename(s)));
        } else if (options.includeSelect) {
          // Include selection mode
          const includeResponse = await logger.prompt(
            `Select skills to install (${skills.length} found):`,
            {
              type: "multiselect",
              options: displaySkills.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForInclude = (includeResponse as string[]) || [];
          filteredSkills = skills.filter((s) => selectedForInclude.includes(basename(s)));
        } else {
          // Exclude selection mode
          const excludeResponse = await logger.prompt(
            "Select skills to EXCLUDE from installation:",
            {
              type: "multiselect",
              options: displaySkills.map((s) => ({ label: s, value: s })),
              required: false,
            },
          );

          const selectedForExclude = (excludeResponse as string[]) || [];
          filteredSkills = skills.filter((s) => !selectedForExclude.includes(basename(s)));
        }
      } else {
        // Non-interactive mode: use filterExtensions
        filteredSkills = filterExtensions(skills, options.include, options.exclude);
      }

      if (filteredSkills.length === 0) {
        result.error = "No skills match the include/exclude filters";
        return result;
      }

      logger.info(`Installing ${filteredSkills.length} skills: ${filteredSkills.join(", ")}`);

      for (const skillName of filteredSkills) {
        const skillPath = join(targetPath, skillName);
        const cleanSkillName = basename(skillName);
        await installSkillToGlobal(cleanSkillName, skillPath, globalSkillsPath, options.dryRun);

        if (!options.dryRun) {
          // Use the SKILL.md frontmatter name if available (e.g. "vercel-composition-patterns")
          // so manifest name matches what agm list shows
          const extensionMeta = detectExtensionFormat(skillPath);
          const manifestName = extensionMeta?.name || cleanSkillName;
          addExtensionToManifest(config.home, manifestName, "claude-code", {
            repo,
            path: options.path || "skills",
            description: extensionMeta?.description,
          });
        }
      }

      result.extension = `${filteredSkills.length} skills`;

      if (options.dryRun) {
        result.success = true;
        logger.info("[DRY RUN] Would install skills to Claude Code global skills");
      } else {
        result.success = true;
        logger.success("Successfully installed to Claude Code global skills");
      }
    } else {
      // Single skill repo
      const extension = detectExtensionFormat(targetPath);

      if (!extension || !extension.formats.agentSkills?.enabled) {
        result.error = "No valid skill format found (SKILL.md required for global skills)";
        return result;
      }

      logger.success(`Detected skill: ${extension.name}`);

      await installSkillToGlobal(extension.name, targetPath, globalSkillsPath, options.dryRun);

      if (!options.dryRun) {
        addExtensionToManifest(config.home, extension.name, "claude-code", {
          repo,
          path: options.path || "skills",
          description: extension.description,
        });
      }

      result.extension = extension.name;

      if (options.dryRun) {
        result.success = true;
        logger.info("[DRY RUN] Would install skill to Claude Code global skills");
      } else {
        result.success = true;
        logger.success("Successfully installed to Claude Code global skills");
      }
    }
  } catch (error) {
    result.error = String(error);
    logger.error(`Failed to add global skill: ${error}`);
  } finally {
    // Cleanup
    if (!options.dryRun && existsSync(tempDir)) {
      removeSync(tempDir);
    }
  }

  return result;
}

/**
 * Install a skill to Claude Code's global skills directory
 */
async function installSkillToGlobal(
  skillName: string,
  sourcePath: string,
  globalSkillsPath: string,
  dryRun?: boolean,
): Promise<void> {
  const targetPath = join(globalSkillsPath, skillName);

  if (dryRun) {
    logger.info(`[DRY RUN] Would install "${skillName}" to ${targetPath}`);
    return;
  }

  mkdirSync(globalSkillsPath, { recursive: true });

  if (existsSync(targetPath)) {
    logger.info(`Replacing existing skill: ${skillName}`);
    rmSync(targetPath, { recursive: true });
  }

  cpSync(sourcePath, targetPath, { recursive: true });
  logger.success(`Installed: ${skillName}`);
}

/**
 * Interactive prompt for selecting skills within a multi-skill repository
 * Returns selected skill names with subfolder prefix preserved
 */
export async function selectSkillsInteractive(
  allSkills: string[],
  opts?: { initialSelected?: string[] },
): Promise<string[]> {
  if (allSkills.length === 0) {
    return [];
  }

  // Strip subfolder prefixes for display (e.g., "skills/nuxt" → "nuxt")
  const displaySkills = allSkills.map((skill) => basename(skill));

  const response = await prompts([
    {
      type: "multiselect",
      name: "skills",
      message: `Select skills to install (${allSkills.length} found):`,
      instructions: "Press <space> to select, <enter> to confirm",
      choices: displaySkills.map((skill) => ({
        title: skill,
        value: skill,
        selected: opts?.initialSelected?.includes(skill) || false,
      })),
    },
  ]);

  return response.skills || [];
}

/**
 * Filter skills by search term (case-insensitive substring match)
 */
export function filterSkillsBySearch(skills: string[], searchTerm: string): string[] {
  if (!searchTerm) {
    return skills;
  }

  const lowerSearch = searchTerm.toLowerCase();
  return skills.filter((skill) => skill.toLowerCase().includes(lowerSearch));
}

/**
 * Handle include-select and exclude-select flag logic
 * Parses include/exclude arguments and determines which skills to select
 */
export interface IncludeExcludeResult {
  toInstall: string[];
  excluded: string[];
}

export async function handleIncludeExcludeLogic(
  args: Pick<AddOptions, "include" | "exclude">,
  allSkills: string[],
  searchTerm?: string,
): Promise<IncludeExcludeResult> {
  const includeArg = args.include;
  const excludeArg = args.exclude;

  // Check if either argument contains "select" keyword (triggers interactive mode)
  const includeHasSelect = includeArg?.some((s) => s.toLowerCase().includes("select"));
  const excludeHasSelect = excludeArg?.some((s) => s.toLowerCase().includes("select"));

  // If both have "select", get interactive selection for include first
  if (includeHasSelect && excludeHasSelect) {
    const includeList = includeArg?.filter((s) => s.toLowerCase() !== "select") || [];
    const selectedForInclude = await selectSkillsInteractive(allSkills, {
      initialSelected: includeList,
    });
    const remainingSkills = allSkills.filter((skill) => !selectedForInclude.includes(skill));

    if (searchTerm) {
      const filteredRemaining = filterSkillsBySearch(remainingSkills, searchTerm);
      const selectedForExclude = await selectSkillsInteractive(filteredRemaining);
      return {
        toInstall: selectedForInclude,
        excluded: selectedForExclude,
      };
    } else {
      const selectedForExclude = await selectSkillsInteractive(remainingSkills);
      return {
        toInstall: selectedForInclude,
        excluded: selectedForExclude,
      };
    }
  }

  // If only include has "select", get interactive selection for include
  if (includeHasSelect && !excludeHasSelect) {
    const includeList = includeArg?.filter((s) => s.toLowerCase() !== "select") || [];
    if (searchTerm) {
      const filteredSkills = filterSkillsBySearch(allSkills, searchTerm);
      const selectedSkills = await selectSkillsInteractive(filteredSkills, {
        initialSelected: includeList,
      });
      return {
        toInstall: selectedSkills,
        excluded: [],
      };
    } else {
      const selectedSkills = await selectSkillsInteractive(allSkills, {
        initialSelected: includeList,
      });
      return {
        toInstall: selectedSkills,
        excluded: [],
      };
    }
  }

  // If only exclude has "select", get interactive selection for exclude
  if (!includeHasSelect && excludeHasSelect) {
    const excludeList = excludeArg?.filter((s) => s.toLowerCase() !== "select") || [];
    if (searchTerm) {
      const filteredSkills = filterSkillsBySearch(allSkills, searchTerm);
      const selectedForExclude = await selectSkillsInteractive(filteredSkills, {
        initialSelected: excludeList,
      });
      return {
        toInstall: [],
        excluded: selectedForExclude,
      };
    } else {
      const selectedForExclude = await selectSkillsInteractive(allSkills, {
        initialSelected: excludeList,
      });
      return {
        toInstall: [],
        excluded: selectedForExclude,
      };
    }
  }

  // If neither has "select", use as comma-separated list as before
  if (!includeHasSelect && !excludeHasSelect) {
    // Filter by search term if provided
    const filteredSkills = searchTerm ? filterSkillsBySearch(allSkills, searchTerm) : allSkills;

    return {
      toInstall: filteredSkills,
      excluded: [],
    };
  }

  // Default fallback
  return {
    toInstall: [],
    excluded: [],
  };
}
