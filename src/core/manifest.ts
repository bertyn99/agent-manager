// Agent Manager Manifest - Track skill installations across agents
// This is agent-manager's own manifest, separate from OpenCode's skills.yaml

import { existsSync, readFileSync, writeFileSync, mkdirSync, removeSync, readdirSync } from 'fs-extra';
import { join, dirname } from 'pathe';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import type { AgentType } from './types.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';

export interface AgentManagerManifest {
  version: string;
  updated: string;
  skills: ManifestSkill[];
  sources: ManifestSource[];
}

export interface ManifestSkill {
  name: string;
  description?: string;
  installedAt: string;
  source?: {
    repo: string;
    commit?: string;
    path?: string;
  };
  agents: {
    agent: AgentType;
    installedAt: string;
    path?: string;
    customized?: boolean;
  }[];
}

export interface ManifestSource {
  repo: string;
  path: string;
  branch: string;
  addedAt: string;
  include?: string[];
  exclude?: string[];
  plugins?: string[];
  version?: string;
}

/**
 * Default manifest structure
 */
function createEmptyManifest(): AgentManagerManifest {
  return {
    version: '1.0.0',
    updated: new Date().toISOString(),
    skills: [],
    sources: [],
  };
}

/**
 * Get manifest path from config
 */
export function getManifestPath(configHome: string): string {
  return join(configHome, 'manifest.yaml');
}

/**
 * Read manifest from file
 */
export function readManifest(configHome: string): AgentManagerManifest {
  const manifestPath = getManifestPath(configHome);
  
  if (!existsSync(manifestPath)) {
    return createEmptyManifest();
  }

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    const parsed = yamlLoad(content) as AgentManagerManifest;
    return {
      version: parsed.version || '1.0.0',
      updated: parsed.updated || new Date().toISOString(),
      skills: parsed.skills || [],
      sources: parsed.sources || [],
    };
  } catch {
    return createEmptyManifest();
  }
}

/**
 * Write manifest to file
 */
export function writeManifest(configHome: string, manifest: AgentManagerManifest): void {
  const manifestPath = getManifestPath(configHome);
  const dir = dirname(manifestPath);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  manifest.updated = new Date().toISOString();
  writeFileSync(manifestPath, yamlDump(manifest));
}

/**
 * Find a skill in manifest by name
 */
export function findSkill(manifest: AgentManagerManifest, skillName: string): ManifestSkill | undefined {
  return manifest.skills.find(s => s.name === skillName);
}

// Alias for findExtension
export const findExtension = findSkill;

/**
 * Add or update a skill in manifest
 */
export function addSkillToManifest(
  configHome: string,
  skillName: string,
  agent: AgentType,
  options: {
    description?: string;
    repo?: string;
    commit?: string;
    path?: string;
    skillPath?: string;
  }
): void {
  const manifest = readManifest(configHome);
  
  let skill = findSkill(manifest, skillName);
  
  if (!skill) {
    // New skill
    skill = {
      name: skillName,
      description: options.description,
      installedAt: new Date().toISOString(),
      source: options.repo ? {
        repo: options.repo,
        commit: options.commit,
        path: options.path,
      } : undefined,
      agents: [],
    };
    manifest.skills.push(skill);
  }

  // Check if agent already has this skill
  const existingAgent = skill.agents.find(a => a.agent === agent);
  
  if (!existingAgent) {
    // Add agent to skill
    skill.agents.push({
      agent,
      installedAt: new Date().toISOString(),
      path: options.skillPath,
    });
  }

  writeManifest(configHome, manifest);
}

// Alias for addExtension
export const addExtensionToManifest = addSkillToManifest;

/**
 * Remove a skill from manifest for a specific agent
 */
export function removeSkillFromManifest(
  configHome: string,
  skillName: string,
  agent: AgentType
): boolean {
  const manifest = readManifest(configHome);
  const skill = findSkill(manifest, skillName);
  
  if (!skill) {
    return false;
  }

  const agentIndex = skill.agents.findIndex(a => a.agent === agent);
  
  if (agentIndex === -1) {
    return false;
  }

  // Remove agent from skill
  skill.agents.splice(agentIndex, 1);

  // If no agents left, remove the skill entirely
  if (skill.agents.length === 0) {
    const skillIndex = manifest.skills.findIndex(s => s.name === skillName);
    if (skillIndex !== -1) {
      manifest.skills.splice(skillIndex, 1);
    }
  }

  writeManifest(configHome, manifest);
  return true;
}

// Alias for removeExtension
export const removeExtensionFromManifest = removeSkillFromManifest;

/**
 * Add a source to manifest (for multi-extension repos)
 */
export function addSourceToManifest(
  configHome: string,
  repo: string,
  path: string,
  branch: string,
  options: {
    include?: string[];
    exclude?: string[];
    plugins?: string[];
    version?: string;
  } = {}
): void {
  const manifest = readManifest(configHome);
  
  // Check if source already exists
  const existingSource = manifest.sources.find(s => s.repo === repo);
  
  if (existingSource) {
    // Update existing source
    existingSource.path = path;
    existingSource.branch = branch;
    existingSource.include = options.include;
    existingSource.exclude = options.exclude;
    if (options.plugins) existingSource.plugins = options.plugins;
    if (options.version) existingSource.version = options.version;
  } else {
    // Add new source
    manifest.sources.push({
      repo,
      path,
      branch,
      addedAt: new Date().toISOString(),
      include: options.include,
      exclude: options.exclude,
      plugins: options.plugins,
      version: options.version,
    });
  }

  writeManifest(configHome, manifest);
}

/**
 * Remove a source from manifest
 */
export function removeSourceFromManifest(
  configHome: string,
  repo: string
): boolean {
  const manifest = readManifest(configHome);
  
  const sourceIndex = manifest.sources.findIndex(s => s.repo === repo);
  
  if (sourceIndex === -1) {
    return false;
  }

  manifest.sources.splice(sourceIndex, 1);
  writeManifest(configHome, manifest);
  return true;
}

/**
 * Get all skills for a specific agent from manifest
 */
export function getSkillsForAgent(configHome: string, agent: AgentType): ManifestSkill[] {
  const manifest = readManifest(configHome);
  
  return manifest.skills.filter(skill => 
    skill.agents.some(a => a.agent === agent)
  );
}

/**
 * Check if a skill is installed for an agent
 */
export function isSkillInstalledForAgent(
  configHome: string,
  skillName: string,
  agent: AgentType
): boolean {
  const manifest = readManifest(configHome);
  const skill = findSkill(manifest, skillName);
  
  return skill?.agents.some(a => a.agent === agent) ?? false;
}

/**
 * Import skills from OpenCode's skills.yaml manifest
 */
export function importFromOpenCodeManifest(
  configHome: string,
  openCodeManifestPath: string
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  if (!existsSync(openCodeManifestPath)) {
    return { imported, skipped };
  }

  try {
    const content = readFileSync(openCodeManifestPath, 'utf-8');
    const parsed = yamlLoad(content) as {
      sources?: Array<{
        repo: string;
        path: string;
        branch: string;
        include?: string[];
        exclude?: string[];
      }>;
      customized?: string[];
      local?: string[];
    };

    const manifest = readManifest(configHome);

    // Import sources
    if (Array.isArray(parsed.sources)) {
      for (const source of parsed.sources) {
        // Check if source already exists
        if (!manifest.sources.find(s => s.repo === source.repo)) {
          manifest.sources.push({
            repo: source.repo,
            path: source.path || 'skills',
            branch: source.branch || 'main',
            addedAt: new Date().toISOString(),
            // Handle YAML parsing of arrays (can come as "*" string or array)
            include: (source.include === '*' || 
                      (Array.isArray(source.include) && source.include.length === 0)) ? undefined : 
                     (Array.isArray(source.include) ? source.include : 
                      (typeof source.include === 'string' ? [source.include] : undefined)),
            exclude: source.exclude,
          });
          imported++;
        } else {
          skipped++;
        }
      }
    }

    writeManifest(configHome, manifest);
  } catch (error) {
    console.error('Failed to import from OpenCode manifest:', error);
  }

  return { imported, skipped };
}

/**
 * Clear all data from manifest (for migration/testing) or remove extensions for a specific agent
 */
export function clearManifest(configHome: string, agentType?: string): void {
  const manifestPath = getManifestPath(configHome);
  
  if (!existsSync(manifestPath)) {
    return;
  }

  if (!agentType) {
    // Clear entire manifest
    removeSync(manifestPath);
    return;
  }

  // Remove only extensions for specific agent
  const manifest = readManifest(configHome);
  
  // Remove from skills
  manifest.skills = manifest.skills.filter(s => 
    !s.agents.some(a => a.agent === agentType)
  );

  // Add empty agents array for remaining skills
  for (const skill of manifest.skills) {
    skill.agents = skill.agents.filter(a => a.agent !== agentType);
  }

  writeManifest(configHome, manifest);
}

// ============================================================
// NEW v2.0.0 MANIFEST FUNCTIONS
// ============================================================

import type { 
  NewAgentManagerManifest, 
  SkillOriginGroup, 
  SkillEntry,
  LegacyManifest,
  MigrationResult
} from './types.js';

/**
 * Filter skill folders by include/exclude rules
 * Decision: Filter by FOLDER NAME, not skill name from SKILL.md
 * 
 * @param allSkillFolders - All available skill folder names
 * @param include - If present, ONLY include these folders
 * @param exclude - If include is empty, exclude these folders
 * @returns Filtered list of folder names
 */
export function filterSkillsByRules(
  allSkillFolders: string[],
  include: string[],
  exclude: string[]
): string[] {
  // If include array has items: ONLY include those folder names
  if (include.length > 0) {
    return allSkillFolders.filter(folder => include.includes(folder));
  }
  // Else if exclude array has items: include ALL EXCEPT those folder names
  if (exclude.length > 0) {
    return allSkillFolders.filter(folder => !exclude.includes(folder));
  }
  // Else (both empty): include everything
  return allSkillFolders;
}

/**
 * Migrate manifest from v1.0.0 to v2.0.0 format
 * 
 * Migration steps:
 * 1. Read v1.0.0 manifest
 * 2. Separate MCPs: Skills with description starting with "MCP server:" → manifest.mcp
 * 3. Group skills by source.repo → SkillOriginGroup entries
 * 4. Handle "local" origin for skills without source
 * 5. Preserve all agent assignments
 * 6. Create backup as manifest.yaml.old
 * 7. Write new manifest
 * 
 * @param configHome - Path to config directory
 * @returns MigrationResult with counts and errors
 */
export function migrateManifest(
  configHome: string
): MigrationResult {
  const result: MigrationResult = {
    success: false,
    migratedSkills: 0,
    migratedMcps: 0,
    migratedSources: 0,
    errors: [],
  };

  const manifestPath = getManifestPath(configHome);

  if (!existsSync(manifestPath)) {
    result.errors.push('Not a v1.0.0 manifest - file not found');
    result.success = false;
    return result;
  }

  try {
    const oldContent = readFileSync(manifestPath, 'utf-8');
    const oldManifest = yamlLoad(oldContent) as LegacyManifest;

    if (!oldManifest.version || oldManifest.version !== '1.0.0') {
      result.errors.push('Not a v1.0.0 manifest');
      result.success = false;
      return result;
    }

    // Create new manifest structure
    const newManifest: NewAgentManagerManifest = {
      version: '2.0.0',
      updated: new Date().toISOString(),
      mcp: {},
      skills: [],
    };

    // Separate MCPs from skills
    const skills = oldManifest.skills || [];
    const mcps: Record<string, { agents: AgentType[], config?: Record<string, unknown> }> = {};

    for (const skill of skills) {
      // Check if this is an MCP server by description pattern
      if (skill.description && skill.description.startsWith('MCP server:')) {
        const mcpName = skill.name;
        const mcpAgents = skill.agents.map(a => a.agent);
        mcps[mcpName] = {
          agents: mcpAgents,
        };
        result.migratedMcps++;
      }
    }

    newManifest.mcp = mcps;

    // Group skills by source repository
    const skillsBySource = new Map<string, ManifestSkill[]>();

    for (const skill of skills) {
      // Skip MCP servers (already handled)
      if (skill.description && skill.description.startsWith('MCP server:')) {
        continue;
      }

      const sourceRepo = skill.source?.repo || 'local';
      
      if (!skillsBySource.has(sourceRepo)) {
        skillsBySource.set(sourceRepo, []);
      }
      skillsBySource.get(sourceRepo)!.push(skill);
    }

    // Convert sources array to SkillOriginGroup entries
    const sources = oldManifest.sources || [];
    const skillOriginGroups: SkillOriginGroup[] = [];

    // Process each source
    for (const source of sources) {
      const skillsInSource = skillsBySource.get(source.repo) || [];
      
      if (skillsInSource.length === 0) {
        continue; // No skills from this source
      }

      const skillEntries: SkillEntry[] = skillsInSource.map(skill => ({
        name: skill.name,
        folderName: skill.name, // Using skill name as folder name
        agents: skill.agents.map(a => a.agent),
        description: skill.description,
      }));

      skillOriginGroups.push({
        origin: source.repo,
        path: source.path,
        branch: source.branch,
        include: source.include || [],
        exclude: source.exclude || [],
        skills: skillEntries,
      });

      result.migratedSkills += skillsInSource.length;
      result.migratedSources++;
    }

    // Handle local skills (skills without source)
    const localSkills = skillsBySource.get('local') || [];
    if (localSkills.length > 0) {
      const skillEntries: SkillEntry[] = localSkills.map(skill => ({
        name: skill.name,
        folderName: skill.name,
        agents: skill.agents.map(a => a.agent),
        description: skill.description,
      }));

      skillOriginGroups.push({
        origin: 'local',
        path: join(configHome, 'skills'),
        branch: '',
        include: [],
        exclude: [],
        skills: skillEntries,
      });

      result.migratedSkills += localSkills.length;
    }

    newManifest.skills = skillOriginGroups;

    // Create backup of old manifest
    const backupPath = `${manifestPath}.old`;
    writeFileSync(backupPath, oldContent);

    // Write new manifest
    writeFileSync(manifestPath, yamlDump(newManifest));

    result.success = true;
    return result;
  } catch (error) {
    result.errors.push(`Migration failed: ${String(error)}`);
    result.success = false;
    return result;
  }
}

/**
 * Read manifest (supports both v1.0.0 and v2.0.0 formats)
 * Auto-migrates v1.0.0 to v2.0.0 if detected
 */
export function readManifestV2(configHome: string): NewAgentManagerManifest {
  const manifestPath = getManifestPath(configHome);
  
  if (!existsSync(manifestPath)) {
    // Return empty v2.0.0 manifest
    return {
      version: '2.0.0',
      updated: new Date().toISOString(),
      mcp: {},
      skills: [],
    };
  }

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    const parsed = yamlLoad(content) as NewAgentManagerManifest | LegacyManifest;

    // Check if old format (v1.0.0)
    if (!parsed.version || parsed.version === '1.0.0') {
      // Auto-migrate
      const result = migrateManifest(configHome);
      
      if (result.success) {
        // Read newly migrated manifest
        const newContent = readFileSync(manifestPath, 'utf-8');
        const newParsed = yamlLoad(newContent) as NewAgentManagerManifest;
        return newParsed;
      } else {
        // Migration failed, return empty v2.0.0
        return {
          version: '2.0.0',
          updated: new Date().toISOString(),
          mcp: {},
          skills: [],
        };
      }
    }

    // Return as v2.0.0 format
    return {
      version: parsed.version || '2.0.0',
      updated: parsed.updated || new Date().toISOString(),
      mcp: (parsed as NewAgentManagerManifest).mcp || {},
      skills: (parsed as NewAgentManagerManifest).skills || [],
    };
  } catch {
    // Error reading file, return empty v2.0.0
    return {
      version: '2.0.0',
      updated: new Date().toISOString(),
      mcp: {},
      skills: [],
    };
  }
}

/**
 * Write manifest in v2.0.0 format
 */
export function writeManifestV2(configHome: string, manifest: NewAgentManagerManifest): void {
  const manifestPath = getManifestPath(configHome);
  const dir = dirname(manifestPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  manifest.updated = new Date().toISOString();
  writeFileSync(manifestPath, yamlDump(manifest));
}

/**
 * Parse repository URL to extract org/repo
 * @param repo - Repository URL (https://github.com/org/repo)
 * @returns Object with org and repoName
 */
function parseRepoUrlForCache(repo: string): { org: string, repoName: string } {
  // Remove protocol and trailing slash
  const cleanUrl = repo.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const parts = cleanUrl.split('/');
  
  if (parts.length >= 2) {
    return {
      org: parts[parts.length - 2],
      repoName: parts[parts.length - 1],
    };
  }
  
  // Fallback: use entire URL as repo name
  return {
    org: 'unknown',
    repoName: cleanUrl,
  };
}

/**
 * Clone or update repository to cache directory
 * 
 * Cache path structure: ~/.config/agent-manager/cache/{org}/{repo}
 * 
 * @param origin - Repository URL
 * @param branch - Branch to clone
 * @param configHome - Path to config directory
 * @returns Cache path or null if failed
 */
export async function cloneSourceToCache(
  origin: string,
  branch: string,
  configHome: string
): Promise<string | null> {
  const { org, repoName } = parseRepoUrlForCache(origin);
  const cachePath = join(configHome, 'cache', org, repoName);
  
  try {
    // Import simpleGit dynamically to avoid circular dependencies
    const { simpleGit } = await import('simple-git');
    
    if (existsSync(cachePath)) {
      // Update existing repo
      await simpleGit(cachePath).pull();
    } else {
      // Clone new repo with depth=1 for speed
      await simpleGit().clone(origin, cachePath, {
        '--depth': '1',
        '--branch': branch,
      });
    }
    
    return cachePath;
  } catch (error) {
    console.error(`Failed to clone/update ${origin}:`, error);
    return null;
  }
}

/**
 * Parse repository string (for backward compatibility)
 * @param repo - Repository URL or identifier
 * @returns GitRepoInfo object
 */
export function parseRepoString(repo: string): GitRepoInfo {
  const cleanUrl = repo.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const parts = cleanUrl.split('/');
  
  if (parts.length >= 2) {
    return {
      url: repo,
      org: parts[parts.length - 2],
      repo: parts[parts.length - 1],
      branch: 'main',
      path: '',
    };
  }
  
  // Fallback
  return {
    url: repo,
    org: 'unknown',
    repo: cleanUrl,
    branch: 'main',
    path: '',
  };
}

// ============================================================
// HELPER FUNCTIONS FOR MANIFEST OPERATIONS (v2.0.0)
// ============================================================

/**
 * Add MCP server to manifest
 * 
 * @param configHome - Path to config directory
 * @param mcpName - MCP server name
 * @param agents - List of agents that have this MCP
 * @param config - Optional MCP configuration
 */
export function addMcpToManifest(
  configHome: string,
  mcpName: string,
  agents: AgentType[],
  config?: Record<string, unknown>
): void {
  const manifest = readManifestV2(configHome);
  
  manifest.mcp[mcpName] = {
    agents,
    config,
  };
  
  writeManifestV2(configHome, manifest);
}

/**
 * Remove MCP server from manifest
 * Optionally remove only from specific agent
 * 
 * @param configHome - Path to config directory
 * @param mcpName - MCP server name
 * @param agent - Optional: remove from specific agent only
 * @returns True if MCP was removed
 */
export function removeMcpFromManifest(
  configHome: string,
  mcpName: string,
  agent?: AgentType
): boolean {
  const manifest = readManifestV2(configHome);
  
  if (!manifest.mcp[mcpName]) {
    return false;
  }
  
  if (agent) {
    // Remove from specific agent only
    const mcpAgents = manifest.mcp[mcpName].agents;
    const index = mcpAgents.indexOf(agent);
    
    if (index !== -1) {
      mcpAgents.splice(index, 1);
      
      // If no agents left, remove MCP entirely
      if (mcpAgents.length === 0) {
        delete manifest.mcp[mcpName];
      }
      
      writeManifestV2(configHome, manifest);
      return true;
    }
    
    return false;
  } else {
    // Remove MCP entirely
    delete manifest.mcp[mcpName];
    writeManifestV2(configHome, manifest);
    return true;
  }
}

/**
 * Add skill origin group to manifest
 * 
 * @param configHome - Path to config directory
 * @param origin - Repository URL or 'local'
 * @param path - Path to skills directory
 * @param branch - Git branch
 * @param filters - Include/exclude filters
 */
export function addSkillOriginGroup(
  configHome: string,
  origin: string,
  path: string,
  branch: string,
  filters: { include?: string[]; exclude?: string[] }
): void {
  const manifest = readManifestV2(configHome);
  
  const newGroup: SkillOriginGroup = {
    origin,
    path,
    branch,
    include: filters.include || [],
    exclude: filters.exclude || [],
    skills: [],
  };
  
  manifest.skills.push(newGroup);
  writeManifestV2(configHome, manifest);
}

/**
 * Update skill agent assignments within an origin
 * 
 * @param configHome - Path to config directory
 * @param origin - Origin repository or 'local'
 * @param skillName - Skill name to update
 * @param agents - New list of agents
 */
export function updateSkillInOrigin(
  configHome: string,
  origin: string,
  skillName: string,
  agents: AgentType[]
): void {
  const manifest = readManifestV2(configHome);
  
  const originGroup = manifest.skills.find(g => g.origin === origin);
  
  if (!originGroup) {
    throw new Error(`Origin not found: ${origin}`);
  }
  
  const skill = originGroup.skills.find(s => s.name === skillName);
  
  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }
  
  skill.agents = agents;
  writeManifestV2(configHome, manifest);
}

/**
 * Get skill entry by origin and name
 * 
 * @param manifest - Manifest to search
 * @param origin - Origin repository or 'local'
 * @param skillName - Skill name
 * @returns Skill entry or undefined
 */
export function getSkillInOrigin(
  manifest: NewAgentManagerManifest,
  origin: string,
  skillName: string
): SkillEntry | undefined {
  const originGroup = manifest.skills.find(g => g.origin === origin);
  
  if (!originGroup) {
    return undefined;
  }
  
  return originGroup.skills.find(s => s.name === skillName);
}

// ============================================================
// SYNC FROM SOURCES (v2.0.0)
// ============================================================

/**
 * Sync skills from configured sources to manifest
 * 
 * For each skill origin group:
 * 1. Clone/update repository to cache
 * 2. Scan skills directory
 * 3. Apply include/exclude filters
 * 4. Update manifest with discovered skills
 * 
 * @param configHome - Path to config directory
 * @param options - Sync options (dryRun, verbose)
 * @returns Sync result with counts
 */
/**
 * Read multiple SKILL.md files in parallel with concurrency control
 * OPTIMIZATION: For 100+ skills, reading files in parallel significantly reduces sync time
 */
async function readSkillManifestsParallel(
  folderNames: string[],
  skillsPath: string,
  maxConcurrency: number = 10
): Promise<Map<string, { name: string; folderName: string; description?: string }>> {
  const results = new Map<string, { name: string; folderName: string; description?: string }>();

  // Process folders in batches with concurrency limit
  for (let i = 0; i < folderNames.length; i += maxConcurrency) {
    const batch = folderNames.slice(i, i + maxConcurrency);

    // Read all files in this batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (folderName) => {
        const skillManifestPath = join(skillsPath, folderName, 'SKILL.md');

        if (!existsSync(skillManifestPath)) {
          return null;
        }

        try {
          const content = readFileSync(skillManifestPath, 'utf-8');
          const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);

          let name = folderName;
          let description: string | undefined;

          if (frontmatter) {
            const yamlContent = frontmatter[1];
            const nameMatch = yamlContent.match(/name:\s*(.+)/);
            const descMatch = yamlContent.match(/description:\s*(.+)/);

            if (nameMatch) {
              name = nameMatch[1].trim();
            }
            if (descMatch) {
              description = descMatch[1].trim();
            }
          }

          return { name, folderName, description };
        } catch (error) {
          return null;
        }
      })
    );

    // Collect successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value !== null) {
        results.set(result.value.folderName, result.value);
      }
    }
  }

  return results;
}

export async function syncFromSources(
  configHome: string,
  options: { dryRun?: boolean; verbose?: boolean; maxConcurrency?: number } = {}
): Promise<{
  success: boolean;
  added: number;
  removed: number;
  updated: number;
  details: string[];
}> {
  const result = {
    success: false,
    added: 0,
    removed: 0,
    updated: 0,
    details: [],
  };

  if (options.verbose) {
    logger.info('Syncing skills from configured sources...');
  }

  const manifest = readManifestV2(configHome);
  const maxConcurrency = options.maxConcurrency ?? 3; // Default: 3 parallel git operations

  // Process each skill origin group
  // OPTIMIZATION: Process origin groups sequentially, but parallelize git operations
  for (const originGroup of manifest.skills) {
    if (options.verbose) {
      logger.info(`Processing origin: ${originGroup.origin}`);
    }

    // Skip local origin (no git repository)
    if (originGroup.origin === 'local') {
      result.details.push(`Skipping local origin: ${originGroup.origin}`);
      continue;
    }

    // Clone/update repository to cache
    const cachePath = await cloneSourceToCache(
      originGroup.origin,
      originGroup.branch,
      configHome
    );

    if (!cachePath) {
      result.details.push(`Failed to clone/update: ${originGroup.origin}`);
      continue;
    }

    // Scan skills directory
    const skillsPath = join(cachePath, originGroup.path);
    
    if (!existsSync(skillsPath)) {
      result.details.push(`Skills path not found: ${skillsPath}`);
      continue;
    }

    const allSkillFolders = [];
    
    try {
      const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderName = entry.name;
          
          // Check if SKILL.md exists (valid skill)
          const skillPath = join(skillsPath, folderName);
          const skillManifestPath = join(skillPath, 'SKILL.md');
          
          if (existsSync(skillManifestPath)) {
            allSkillFolders.push(folderName);
          } else {
            if (options.verbose) {
              logger.info(`Skipping ${folderName} (no SKILL.md found)`);
            }
          }
        }
      }
    } catch (error) {
      result.details.push(`Error scanning ${skillsPath}: ${String(error)}`);
      continue;
    }

    if (options.verbose) {
      logger.info(`Found ${allSkillFolders.length} skill folders`);
    }

    // Apply filters
    const filteredFolders = filterSkillsByRules(
      allSkillFolders,
      originGroup.include,
      originGroup.exclude
    );

    if (options.verbose) {
      logger.info(`After filtering: ${filteredFolders.length} skills`);
      logger.info(`  Include: [${originGroup.include.join(', ') || 'all'}]`);
      logger.info(`  Exclude: [${originGroup.exclude.join(', ') || 'none'}]`);
    }

    // Update manifest with discovered skills
    const currentSkills = new Set(originGroup.skills.map(s => s.name));
    const newSkills = new Set(filteredFolders);

    // Track changes
    const added = [...newSkills].filter(s => !currentSkills.has(s));
    const removed = [...currentSkills].filter(s => !newSkills.has(s));

    // Build new skills array (keep existing skills that are still valid)
    const updatedSkills: SkillEntry[] = originGroup.skills.filter(s => newSkills.has(s.name));

    // Add new skills - OPTIMIZATION: Read SKILL.md files in parallel
    if (added.length > 0) {
      if (options.verbose) {
        logger.info(`Reading ${added.length} skill manifests in parallel...`);
      }

      const skillManifests = await readSkillManifestsParallel(added, skillsPath, 10);

      for (const folderName of added) {
        const skillData = skillManifests.get(folderName);

        if (skillData) {
          updatedSkills.push({
            name: skillData.name,
            folderName: skillData.folderName,
            agents: [], // Default: not assigned to any agent yet
            description: skillData.description,
          });

          if (options.verbose) {
            logger.info(`  + Added skill: ${skillData.name}`);
          }

          result.added++;
          result.details.push(`Added: ${skillData.name} from ${originGroup.origin}`);
        } else {
          result.details.push(`Error reading ${folderName}: File read failed`);
        }
      }
    }

    // Update origin group in manifest
    const groupIndex = manifest.skills.findIndex(g => g.origin === originGroup.origin);
    
    if (groupIndex !== -1) {
      if (options.dryRun) {
        if (options.verbose) {
          logger.info(`[DRY RUN] Would update origin group: ${originGroup.origin}`);
          logger.info(`  Added: ${added.length}, Removed: ${removed.length}`);
        }
      } else {
        manifest.skills[groupIndex] = {
          ...originGroup,
          skills: updatedSkills,
        };
        
        if (options.verbose) {
          logger.info(`  Updated origin: ${originGroup.origin}`);
        }
        
        result.updated += updatedSkills.length;
      }
      
      result.details.push(`Processed ${originGroup.origin}: ${added.length} added, ${removed.length} removed`);
    }
  }

  // Write manifest
  if (!options.dryRun) {
    writeManifestV2(configHome, manifest);
    
    if (options.verbose) {
      logger.info('Manifest updated');
    }
  }

  result.success = true;
  return result;
}
