// Skill Installer - Handles installing skills to different agents

import { existsSync, readFileSync, mkdirSync, cpSync, removeSync, writeFileSync, lstatSync, unlinkSync, rmSync, symlinkSync } from 'fs-extra';
import { join, basename, dirname } from 'pathe';
import { load as yamlLoad } from 'js-yaml';
import { logger } from '../utils/logger.js';
import { cloneRepo, getCurrentCommit, getLatestTag } from '../utils/git.js';
import { createAgentRegistry } from '../adapters/index.js';
import type { AgentManagerConfig, AgentType, Skill, UnifiedSkill } from '../core/types.js';
import { parse as parseToml } from 'destr';
import { 
  addSkillToManifest, 
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
}

export interface AddResult {
  success: boolean;
  skill: string;
  installedTo: AgentType[];
  commit?: string;
  tag?: string;
  error?: string;
}

/**
 * Parse SKILL.md frontmatter to extract skill metadata
 */
export function parseSkillMd(content: string): Record<string, unknown> {
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
 * Parse skill.json file
 */
export function parseSkillJson(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Check if a directory contains a skill
 */
export function detectSkillFormat(repoPath: string): UnifiedSkill | null {
  // Check for SKILL.md
  const skillMdPath = join(repoPath, 'SKILL.md');
  if (existsSync(skillMdPath)) {
    const content = readFileSync(skillMdPath, 'utf-8');
    const frontmatter = parseSkillMd(content);
    
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

  // Check for skill.json
  const skillJsonPath = join(repoPath, 'skill.json');
  if (existsSync(skillJsonPath)) {
    const content = readFileSync(skillJsonPath, 'utf-8');
    const skill = parseSkillJson(content);
    return skill as UnifiedSkill;
  }

  // Check for gemini-command.toml (Gemini CLI commands)
  const geminiTomlPath = join(repoPath, 'gemini-command.toml');
  if (existsSync(geminiTomlPath)) {
    const content = readFileSync(geminiTomlPath, 'utf-8');
    const toml = parseToml(content);
    const skillName = basename(repoPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    return {
      name: toml.name || skillName,
      description: toml.description || '',
      formats: {
        geminiCommand: {
          enabled: true,
          name: toml.name || skillName,
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
 * Detect if a repository is a multi-skill repo (has skills/ subdirectory)
 */
export function detectMultiSkillRepo(repoPath: string): string[] {
  const skillsPath = join(repoPath, 'skills');
  if (!existsSync(skillsPath)) {
    return [];
  }

  const skills: string[] = [];
  for (const dir of readdirSync(skillsPath)) {
    const skillPath = join(skillsPath, dir);
    if (existsSync(join(skillPath, 'SKILL.md'))) {
      skills.push(dir);
    }
  }

  return skills;
}

/**
 * Filter skills based on include/exclude options
 */
function filterSkills(allSkills: string[], include?: string[], exclude?: string[]): string[] {
  let filtered = allSkills;

  if (include && include.length > 0) {
    filtered = filtered.filter(s => include.includes(s));
  }

  if (exclude && exclude.length > 0) {
    filtered = filtered.filter(s => !exclude.includes(s));
  }

  return filtered;
}

/**
 * Read OpenCode skills.yaml manifest
 */
function readOpenCodeManifest(config: AgentManagerConfig): Record<string, unknown> | null {
  const manifestPath = config.agents['opencode'].configPath;
  if (!existsSync(manifestPath)) {
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
function addSourceToManifest(config: AgentManagerConfig, repo: string, skillsPath: string, include: string[], exclude: string[]): void {
  const manifestPath = config.agents['opencode'].configPath;
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
  const newSource = {
    repo,
    path: skillsPath,
    branch: 'main',
    include: include.length > 0 ? include : ['*'],
    exclude: exclude,
  };

  (manifest as Record<string, unknown>).sources.push(newSource as unknown);

  // Write manifest
  writeFileSync(manifestPath, require('js-yaml').dump(manifest));
  logger.success(`Added ${repo} to OpenCode manifest`);
}

/**
 * Install a skill to a specific agent
 */
async function installToAgent(
  skill: UnifiedSkill,
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

  // Check if skill format is supported for this agent
  const formats = skill.formats;
  let installed = false;

  try {
    // Install to Claude Code / Cursor (MCP servers)
    if ((agentType === 'claude-code' || agentType === 'cursor') && formats.mcp?.enabled) {
      const mcpConfig = formats.mcp;
      
      if (mcpConfig.type === 'http' && mcpConfig.url) {
        if (options.dryRun) {
          logger.info(`[DRY RUN] Would add MCP server: ${skill.name}`);
        } else {
          await adapter.addSkill({
            name: skill.name,
            type: 'mcp',
            agent: agentType,
            description: skill.description,
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
          logger.info(`[DRY RUN] Would add MCP command: ${skill.name}`);
        } else {
          await adapter.addSkill({
            name: skill.name,
            type: 'mcp',
            agent: agentType,
            description: skill.description,
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
        const skillContent = generateGeminiToml(skill);
        mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, skillContent);
        logger.success(`Added Gemini command: ${geminiConfig.name}`);
        installed = true;
      } else if (options.dryRun) {
        logger.info(`[DRY RUN] Would add Gemini command: ${geminiConfig.name}`);
        installed = true;
      }
    }

    // Install to OpenCode (skills)
    if (agentType === 'opencode' && formats.agentSkills?.enabled) {
      const agentConfig = config.agents['opencode'];
      
      if (agentConfig.skillsPath) {
        const skillMdPath = join(repoPath, formats.agentSkills.path || 'SKILL.md');
        if (existsSync(skillMdPath)) {
          // For OpenCode, we use symlinks (like skill-manager-v2)
          const targetPath = join(agentConfig.skillsPath, skill.name);
          
          if (options.dryRun) {
            logger.info(`[DRY RUN] Would symlink ${skill.name} to ${targetPath}`);
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
            logger.success(`Added OpenCode skill: ${skill.name}`);
          }
          installed = true;
        }
      }
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
function generateGeminiToml(skill: UnifiedSkill): string {
  const lines = [
    `description = "${skill.description}"`,
  ];

  if (skill.content?.prompt) {
    lines.push(`prompt = """`);
    lines.push(skill.content.prompt);
    lines.push(`"""`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Main function to add a skill from repository
 */
export async function addSkill(
  repo: string,
  config: AgentManagerConfig,
  options: AddOptions
): Promise<AddResult> {
  const result: AddResult = {
    success: false,
    skill: basename(repo),
    installedTo: [],
  };

  // Determine target agents
  const targetAgents = options.to || Object.keys(config.agents) as AgentType[];
  
  logger.info(`Adding skill from ${repo}...`);
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

    // Check for multi-skill repo (skills/ subdirectory)
    const multiSkills = detectMultiSkillRepo(clonePath);
    const isMultiSkill = multiSkills.length > 0;

    if (isMultiSkill) {
      // Multi-skill repo: add to manifest for OpenCode
      logger.info(`Detected multi-skill repo with ${multiSkills.length} skills`);
      
      // Filter skills based on include/exclude
      const filteredSkills = filterSkills(multiSkills, options.include, options.exclude);
      
      if (filteredSkills.length > 0) {
        logger.info(`Installing ${filteredSkills.length} skills: ${filteredSkills.join(', ')}`);
        
        // Add source to agent-manager manifest
        if (!options.dryRun) {
          addSourceToManifest(config.home, repo, 'skills', 'main', {
            include: options.include,
            exclude: options.exclude,
          });
        }

        // Install each skill individually
        for (const skillName of filteredSkills) {
          const skillPath = join(clonePath, 'skills', skillName);
          const skill = detectSkillFormat(skillPath);
          
          if (skill) {
            result.skill = skill.name;
            
            for (const agentType of targetAgents) {
              if (!config.agents[agentType].enabled) continue;
              
              if (agentType === 'opencode') {
                continue;
              }
              
              const installed = await installToAgent(skill, agentType, skillPath, config, options);
              if (installed) {
                result.installedTo.push(agentType);
                
                // Track in manifest
                if (!options.dryRun) {
                  addSkillToManifest(config.home, skill.name, agentType, {
                    description: skill.description,
                    repo,
                    commit,
                    path: 'skills',
                    skillPath,
                  });
                }
              }
            }
          }
        }
        
        if (targetAgents.includes('opencode')) {
          result.installedTo.push('opencode');
          logger.info('Run "agent-manager sync" to sync OpenCode skills');
        }
      } else {
        result.error = 'No skills match the include/exclude filters';
        return result;
      }
    } else {
      // Single skill repo: install directly
      const skill = detectSkillFormat(clonePath);
      
      if (!skill) {
        result.error = 'No valid skill format found (SKILL.md, skill.json, or gemini-command.toml)';
        logger.error(result.error);
        return result;
      }

      result.skill = skill.name;
      logger.success(`Detected skill: ${skill.name}`);
      
      if (skill.description) {
        logger.info(`Description: ${skill.description}`);
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

        const installed = await installToAgent(skill, agentType, clonePath, config, options);
        
        if (installed) {
          result.installedTo.push(agentType);
          
          // Track in manifest
          if (!options.dryRun) {
            addSkillToManifest(config.home, skill.name, agentType, {
              description: skill.description,
              repo,
              commit,
              skillPath: clonePath,
            });
          }
        }
      }
    }

    result.success = result.installedTo.length > 0;

    if (result.success) {
      logger.success(`Successfully installed to ${result.installedTo.length} agent(s)`);
    } else {
      result.error = 'Skill format not compatible with any target agent';
      logger.warn(result.error);
    }

  } catch (error) {
    result.error = String(error);
    logger.error(`Failed to add skill: ${error}`);
  } finally {
    // Cleanup temp directory
    if (!options.dryRun && existsSync(tempDir)) {
      removeSync(tempDir);
    }
  }

  return result;
}
