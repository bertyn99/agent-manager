// Extension Installer - Handles installing extensions to different agents

import { existsSync, readFileSync, mkdirSync, cpSync, removeSync, writeFileSync, lstatSync, unlinkSync, rmSync, symlinkSync, readdirSync } from 'fs-extra';
import { join, basename, dirname } from 'pathe';
import { homedir } from 'os';
import { load as yamlLoad } from 'js-yaml';
import { logger } from '../utils/logger.js';
import { cloneRepo, getCurrentCommit, getLatestTag } from '../utils/git.js';
import { createAgentRegistry } from '../adapters/index.js';
import type { AgentManagerConfig, AgentType, Extension, UnifiedExtension } from '../core/types.js';
import { parse as parseToml } from 'destr';
import {
  addExtensionToManifest,
  addSourceToManifest,
  readManifest,
  type AgentManagerManifest
} from './manifest.js';

export interface AddOptions {
  to?: AgentType[];
  only?: string[];
  depth?: number;
  branch?: string;
  dryRun?: boolean;
  nested?: boolean;
  include?: string[];
  exclude?: string[];
  path?: string;
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
    
    for (const line of frontmatter.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Handle arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        }
        
        // Handle booleans
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        
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
export function detectExtensionFormat(repoPath: string): UnifiedExtension | null {
  // Check for SKILL.md
  const skillMdPath = join(repoPath, 'SKILL.md');
  if (existsSync(skillMdPath)) {
    const content = readFileSync(skillMdPath, 'utf-8');
    const frontmatter = parseExtensionMd(content);
    
    return {
      name: String(frontmatter.name || basename(repoPath)),
      description: String(frontmatter.description || ''),
      license: frontmatter.license as string | undefined,
      version: frontmatter.version as string | undefined,
      author: frontmatter.author as string | undefined,
      formats: {
        agentSkills: {
          enabled: true,
          path: 'SKILL.md',
        },
      },
      content: {
        readme: content,
      },
      source: {
        type: 'git',
        repo: repoPath,
      },
    };
  }

  // Check for extension.json
  const extensionJsonPath = join(repoPath, 'extension.json');
  if (existsSync(extensionJsonPath)) {
    const content = readFileSync(extensionJsonPath, 'utf-8');
    const extension = parseExtensionJson(content);
    return extension as UnifiedExtension;
  }

  // Check for gemini-command.toml (Gemini CLI commands)
  const geminiTomlPath = join(repoPath, 'gemini-command.toml');
  if (existsSync(geminiTomlPath)) {
    const content = readFileSync(geminiTomlPath, 'utf-8');
    const toml = parseToml(content);
    const extensionName = basename(repoPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    return {
      name: toml.name || extensionName,
      description: toml.description || '',
      formats: {
        geminiCommand: {
          enabled: true,
          name: toml.name || extensionName,
          description: toml.description || '',
        },
      },
      content: {
        prompt: toml.prompt as string | undefined,
      },
      source: {
        type: 'git',
        repo: repoPath,
      },
    };
  }

  return null;
}

/**
 * Detect if a repository is a multi-extension repo (has extensions/ subdirectory)
 */
export function detectMultiExtensionRepo(repoPath: string): string[] {
  const extensionsPath = join(repoPath, 'extensions');
  if (!existsSync(extensionsPath)) {
    return [];
  }

  const extensions: string[] = [];
  for (const dir of readdirSync(extensionsPath)) {
    const extensionPath = join(extensionsPath, dir);
    if (existsSync(join(extensionPath, 'SKILL.md'))) {
      extensions.push(dir);
    }
  }

  return extensions;
}

/**
 * Detect skills in a flat skills folder (skills directly in folder, not in subdirectories)
 * This handles repos like jezweb/claude-skills where skills are in skills/ directly
 */
export function detectSkillsInFolder(folderPath: string): string[] {
  if (!existsSync(folderPath)) {
    return [];
  }

  const skills: string[] = [];
  for (const dir of readdirSync(folderPath)) {
    const skillPath = join(folderPath, dir);
    // Check if it's a directory with SKILL.md
    if (lstatSync(skillPath).isDirectory() && existsSync(join(skillPath, 'SKILL.md'))) {
      skills.push(dir);
    }
  }

  return skills;
}

/**
 * Filter extensions based on include/exclude options
 */
function filterExtensions(allExtensions: string[], include?: string[], exclude?: string[]): string[] {
  let filtered = allExtensions;

  if (include && include.length > 0) {
    filtered = filtered.filter(e => include.includes(e));
  }

  if (exclude && exclude.length > 0) {
    filtered = filtered.filter(e => !exclude.includes(e));
  }

  return filtered;
}

/**
 * Read OpenCode skills.yaml manifest
 */
function readOpenCodeManifest(config: AgentManagerConfig): Record<string, unknown> | null {
  const manifestPath = config.agents['opencode']?.configPath;
  if (!manifestPath || !existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    return yamlLoad(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Add source to OpenCode manifest (for multi-skill repos)
 */
function addSourceToManifest(config: AgentManagerConfig, repo: string, skillsPath: string, plugins?: string[], options?: { include?: string[]; exclude?: string[] }): void {
  const manifestPath = config.agents['opencode']?.configPath;
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
  if (sources.some(s => s.repo === repo)) {
    logger.warn(`Source ${repo} already exists in manifest`);
    return;
  }

  // Add new source
  const newSource: Record<string, unknown> = {
    repo,
    path: skillsPath,
    branch: 'main',
    include: options?.include?.length ? options.include : ['*'],
    exclude: options?.exclude,
  };
  
  if (plugins && plugins.length > 0) {
    newSource.plugins = plugins;
  }

  (manifest as Record<string, unknown>).sources.push(newSource);

  // Write manifest
  writeFileSync(manifestPath, require('js-yaml').dump(manifest));
  logger.success(`Added ${repo} to OpenCode manifest`);
}

/**
 * Install an extension to a specific agent
 */
async function installToAgent(
  extension: UnifiedExtension,
  agentType: AgentType,
  repoPath: string,
  config: AgentManagerConfig,
  options: AddOptions
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
    if ((agentType === 'claude-code' || agentType === 'cursor') && formats.mcp?.enabled) {
      const mcpConfig = formats.mcp;
      
      if (mcpConfig.type === 'http' && mcpConfig.url) {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Would add MCP server: ${extension.name}`);
        } else {
          await adapter.addExtension({
            name: extension.name,
            type: 'mcp',
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
      } else if (mcpConfig.type === 'command' && mcpConfig.command) {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Would add MCP command: ${extension.name}`);
        } else {
          await adapter.addExtension({
            name: extension.name,
            type: 'mcp',
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
    if (agentType === 'gemini-cli' && formats.geminiCommand?.enabled) {
      const geminiConfig = formats.geminiCommand;
      const agentConfig = config.agents['gemini-cli'];
      
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

    // Install to OpenCode (extensions)
    if (agentType === 'opencode' && formats.agentExtensions?.enabled) {
      const agentConfig = config.agents['opencode'];
      if (!agentConfig) {
        return;
      }

      if (agentConfig.skillsPath) {
        const skillMdPath = join(repoPath, formats.agentExtensions.path || 'SKILL.md');
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

    // Install to Cursor (Agent Extensions)
    if (agentType === 'cursor' && formats.agentExtensions?.enabled) {
      const agentConfig = config.agents['cursor'];
      
      if (options.dryRun) {
        logger.info(`[DRY RUN] Would add Agent Extension ${extension.name} to Cursor`);
      } else {
        await adapter.addExtension({
          name: extension.name,
          type: 'skill',
          agent: 'cursor',
          description: extension.description,
          path: repoPath,
        });
        logger.success(`Added Agent Extension to Cursor: ${extension.name}`);
      }
      installed = true;
    }

    // Install to Claude Code (Agent Extensions - compatible with Cursor)
    if (agentType === 'claude-code' && formats.agentExtensions?.enabled) {
      const agentConfig = config.agents['claude-code'];
      
      if (options.dryRun) {
        logger.info(`[DRY RUN] Would add Agent Extension ${extension.name} to Claude Code`);
      } else {
        await adapter.addExtension({
          name: extension.name,
          type: 'skill',
          agent: 'claude-code',
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
function generateGeminiToml(extension: UnifiedExtension): string {
  const lines = [
    `description = "${extension.description}"`,
  ];

  if (extension.content?.prompt) {
    lines.push(`prompt = """`);
    lines.push(extension.content.prompt);
    lines.push(`"""`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Main function to add an extension from repository
 */
export async function addExtension(
  repo: string,
  config: AgentManagerConfig,
  options: AddOptions
): Promise<AddResult> {
  const result: AddResult = {
    success: false,
    extension: basename(repo),
    installedTo: [],
  };

  // Determine target agents
  const targetAgents = options.to || Object.keys(config.agents) as AgentType[];
  
  logger.info(`Adding extension from ${repo}...`);
  logger.info(`Target agents: ${targetAgents.join(', ')}`);

  // Create temp directory for cloning
  const tempDir = join(config.vendorPath, 'temp');
  mkdirSync(tempDir, { recursive: true });

  try {
    // Clone repository
    const clonePath = join(tempDir, basename(repo).replace(/\.git$/, ''));
    let commit: string | undefined;
    
    if (options.dryRun) {
      logger.info(`[DRY RUN] Would clone ${repo} to ${clonePath}`);
    } else {
      logger.info(`Cloning ${repo}...`);
      await cloneRepo(repo, clonePath, {
        depth: options.depth || 1,
        branch: options.branch,
      });
      commit = await getCurrentCommit(clonePath);
    }

    // If path is provided, scope to that subdirectory
    let targetPath = clonePath;
    if (options.path) {
      targetPath = join(clonePath, options.path);
      logger.info(`Scoping to custom path: ${options.path}`);
      if (!existsSync(targetPath)) {
        result.error = `Path not found: ${options.path}`;
        return result;
      }
    }

    // Check for multi-extension repo (extensions/ subdirectory)
    const multiExtensions = detectMultiExtensionRepo(targetPath);
    
    // Also check for flat skills folder (skills directly in folder)
    const flatSkills = detectSkillsInFolder(targetPath);
    
    // Combine both detection methods
    const allSkills = [...new Set([...multiExtensions, ...flatSkills])];
    const isMultiExtension = allSkills.length > 0;

    if (isMultiExtension) {
      // Multi-extension repo: add to manifest for OpenCode
      logger.info(`Detected ${allSkills.length} skills`);
      
      // Filter extensions based on include/exclude
      const filteredExtensions = filterExtensions(allSkills, options.include, options.exclude);
      
      if (filteredExtensions.length > 0) {
        logger.info(`Installing ${filteredExtensions.length} skills: ${filteredExtensions.join(', ')}`);
        
        // Add source to agent-manager manifest
        if (!options.dryRun) {
          addSourceToManifest(config.home, repo, options.path || 'extensions', 'main', {
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
              if (!config.agents[agentType].enabled) continue;
              
              if (agentType === 'opencode') {
                continue;
              }
              
              const installed = await installToAgent(extension, agentType, skillPath, config, options);
              if (installed) {
                result.installedTo.push(agentType);
                
                // Track in manifest
                if (!options.dryRun) {
                  addExtensionToManifest(config.home, extension.name, agentType, {
                    description: extension.description,
                    repo,
                    commit,
                    path: options.path || 'extensions',
                    extensionPath: skillPath,
                  });
                }
              }
            }
          }
        }
        
        if (targetAgents.includes('opencode')) {
          result.installedTo.push('opencode');
          logger.info('Run "agent-manager sync" to sync OpenCode extensions');
        }
      } else {
        result.error = 'No extensions match the include/exclude filters';
        return result;
      }
    } else {
      // Single extension repo: install directly
      const extension = detectExtensionFormat(targetPath);
      
      if (!extension) {
        result.error = 'No valid extension format found (SKILL.md, extension.json, or gemini-command.toml)';
        logger.error(result.error);
        return result;
      }

      result.extension = extension.name;
      logger.success(`Detected extension: ${extension.name}`);
      
      if (extension.description) {
        logger.info(`Description: ${extension.description}`);
      }

      // Get commit/tag info
      if (!options.dryRun) {
        result.commit = commit;
        result.tag = await getLatestTag(clonePath) || undefined;
      }

      // Install to each target agent
      for (const agentType of targetAgents) {
        if (!config.agents[agentType].enabled) {
          logger.warn(`${agentType} is disabled in config`);
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
              commit,
              extensionPath: targetPath,
            });
          }
        }
      }
    }

    result.success = result.installedTo.length > 0;

    if (result.success) {
      logger.success(`Successfully installed to ${result.installedTo.length} agent(s)`);
    } else {
      result.error = 'Extension format not compatible with any target agent';
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
  options: AddOptions
): Promise<AddResult> {
  const result: AddResult = {
    success: false,
    extension: basename(repo).replace(/\.git$/, ''),
    installedTo: ['claude-code'],
  };

  // Claude Code's global skills path
  const globalSkillsPath = join(process.env.HOME || homedir(), '.claude', 'skills');
  
  logger.info(`Adding global skill from ${repo}...`);
  logger.info(`Target: ${globalSkillsPath}`);

  // Create temp directory for cloning
  const tempDir = join(config.vendorPath, 'temp');
  mkdirSync(tempDir, { recursive: true });

  try {
    // Clone repository
    const clonePath = join(tempDir, basename(repo).replace(/\.git$/, ''));
    let commit: string | undefined;
    
    if (options.dryRun) {
      logger.info(`[DRY RUN] Would clone ${repo} to ${clonePath}`);
    } else {
      logger.info(`Cloning ${repo}...`);
      await cloneRepo(repo, clonePath, {
        depth: options.depth || 1,
        branch: options.branch,
      });
      commit = await getCurrentCommit(clonePath);
      result.commit = commit;
    }

    // Handle custom path
    let targetPath = clonePath;
    if (options.path) {
      targetPath = join(clonePath, options.path);
      logger.info(`Scoping to: ${options.path}`);
      if (!existsSync(targetPath)) {
        result.error = `Path not found: ${options.path}`;
        return result;
      }
    }

    // Detect skills
    const skills = detectMultiExtensionRepo(targetPath);
    
    if (skills.length > 0) {
      // Multi-skill repo
      logger.info(`Detected ${skills.length} skills`);
      
      const filteredSkills = filterExtensions(skills, options.include, options.exclude);
      
      if (filteredSkills.length === 0) {
        result.error = 'No skills match the include/exclude filters';
        return result;
      }

      logger.info(`Installing ${filteredSkills.length} skills: ${filteredSkills.join(', ')}`);
      
      for (const skillName of filteredSkills) {
        const skillPath = join(targetPath, 'extensions', skillName);
        await installSkillToGlobal(skillName, skillPath, globalSkillsPath, options.dryRun);
      }
      
      result.extension = `${filteredSkills.length} skills`;
    } else {
      // Single skill repo
      const extension = detectExtensionFormat(targetPath);
      
      if (!extension || !extension.formats.agentSkills?.enabled) {
        result.error = 'No valid skill format found (SKILL.md required for global skills)';
        return result;
      }

      logger.success(`Detected skill: ${extension.name}`);
      
      await installSkillToGlobal(extension.name, targetPath, globalSkillsPath, options.dryRun);
      result.extension = extension.name;
    }

    result.success = true;
    logger.success('Successfully installed to Claude Code global skills');

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
  dryRun?: boolean
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
