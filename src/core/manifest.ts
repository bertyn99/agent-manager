// Agent Manager Manifest - Track skill installations across agents
// This is agent-manager's own manifest, separate from OpenCode's skills.yaml

import { existsSync, readFileSync, writeFileSync, mkdirSync, removeSync } from 'fs-extra';
import { join, dirname } from 'pathe';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import type { AgentType } from './types.js';

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
