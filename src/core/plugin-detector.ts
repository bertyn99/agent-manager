/**
 * PluginDetector - Detects and parses Claude Plugin structures
 * Handles plugin.json manifest parsing and skill discovery
 */

import { existsSync, readFileSync } from 'fs-extra';
import { join } from 'pathe';
import { parse as parseJsonc } from 'destr';
import prompts from 'prompts';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  skills?: string;
  agents?: string[];
  commands?: string[];
  mcpServers?: Record<string, unknown>;
}

export interface DetectedPlugin {
  name: string;
  path: string;
  manifest: PluginManifest;
  skills: string[];
}

export interface PluginDetectionResult {
  isPluginRepo: boolean;
  plugins: DetectedPlugin[];
  selectedPlugins?: string[];
  selectedSkills?: Record<string, string[]>;
}

/**
 * Parse plugin.json manifest
 */
export function parsePluginManifest(path: string): PluginManifest | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    // Support JSONC with comments
    const manifest = parseJsonc(content) as PluginManifest;
    
    if (!manifest.name) {
      return null;
    }

    return manifest;
  } catch {
    return null;
  }
}

/**
 * Detect plugins in a repository
 */
export function detectPlugins(repoPath: string): DetectedPlugin[] {
  const plugins: DetectedPlugin[] = [];

  // Check for root plugin.json
  const rootPluginPath = join(repoPath, 'plugin.json');
  const rootManifest = parsePluginManifest(rootPluginPath);
  if (rootManifest) {
    const skillsPath = rootManifest.skills 
      ? join(repoPath, rootManifest.skills) 
      : join(repoPath, 'skills');
    
    plugins.push({
      name: rootManifest.name,
      path: repoPath,
      manifest: rootManifest,
      skills: existsSync(skillsPath) ? getSkillDirs(skillsPath) : [],
    });
  }

  // Check for .claude-plugin folder
  const claudePluginPath = join(repoPath, '.claude-plugin');
  if (existsSync(claudePluginPath)) {
    const manifest = parsePluginManifest(join(claudePluginPath, 'plugin.json'));
    if (manifest) {
      const skillsPath = manifest.skills 
        ? join(claudePluginPath, manifest.skills) 
        : join(claudePluginPath, 'skills');
      
      plugins.push({
        name: manifest.name,
        path: claudePluginPath,
        manifest: manifest,
        skills: existsSync(skillsPath) ? getSkillDirs(skillsPath) : [],
      });
    }
  }

  // Check for plugins/ subdirectories
  const pluginsPath = join(repoPath, 'plugins');
  if (existsSync(pluginsPath)) {
    const pluginDirs = getSubdirectories(pluginsPath);
    for (const dir of pluginDirs) {
      const pluginPath = join(pluginsPath, dir);
      const manifest = parsePluginManifest(join(pluginPath, 'plugin.json'));
      
      if (manifest) {
        const skillsPath = manifest.skills 
          ? join(pluginPath, manifest.skills) 
          : join(pluginPath, 'skills');
        
        plugins.push({
          name: manifest.name,
          path: pluginPath,
          manifest: manifest,
          skills: existsSync(skillsPath) ? getSkillDirs(skillsPath) : [],
        });
      }
    }
  }

  return plugins;
}

/**
 * Get subdirectories in a path
 */
function getSubdirectories(path: string): string[] {
  try {
    const entries = require('fs').readdirSync(path, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Get skill directories in a path
 */
function getSkillDirs(path: string): string[] {
  return getSubdirectories(path);
}

/**
 * Interactive prompt for selecting plugins
 */
export async function promptPluginSelection(plugins: DetectedPlugin[]): Promise<string[]> {
  if (plugins.length === 0) {
    return [];
  }

  if (plugins.length === 1) {
    return [plugins[0].name];
  }

  const response = await prompts({
    type: 'multiselect',
    name: 'plugins',
    message: 'Select plugins to install:',
    options: plugins.map(p => ({
      title: `${p.name} (${p.skills.length} skills)`,
      value: p.name,
      description: p.manifest.description,
    })),
  });

  return response.plugins || [];
}

/**
 * Interactive prompt for selecting skills within a plugin
 */
export async function promptSkillSelection(plugin: DetectedPlugin): Promise<string[]> {
  if (plugin.skills.length === 0) {
    return [];
  }

  if (plugin.skills.length === 1) {
    return [plugin.skills[0]];
  }

  const response = await prompts({
    type: 'multiselect',
    name: 'skills',
    message: `Select skills to install from "${plugin.name}":`,
    options: plugin.skills.map(skill => ({
      title: skill,
      value: skill,
    })),
  });

  return response.skills || [];
}

/**
 * Main detection and selection function
 */
export async function detectAndSelectPlugins(
  repoPath: string,
  options?: { include?: string[]; exclude?: string[] }
): Promise<PluginDetectionResult> {
  const plugins = detectPlugins(repoPath);
  
  if (plugins.length === 0) {
    return { isPluginRepo: false, plugins: [] };
  }

  // Filter plugins based on include/exclude
  let filteredPlugins = plugins;
  if (options?.include?.length) {
    filteredPlugins = plugins.filter(p => options.include!.includes(p.name));
  }
  if (options?.exclude?.length) {
    filteredPlugins = filteredPlugins.filter(p => !options.exclude!.includes(p.name));
  }

  // If filtered to single plugin and has skills, and no filters specified, prompt
  const shouldPrompt = !options?.include && !options?.exclude;

  if (filteredPlugins.length === 0) {
    return { isPluginRepo: true, plugins: [], selectedPlugins: [] };
  }

  // Select plugins
  let selectedPlugins: string[] = [];
  let selectedSkills: Record<string, string[]> = {};

  if (shouldPrompt && filteredPlugins.length > 0) {
    selectedPlugins = await promptPluginSelection(filteredPlugins);
  } else {
    selectedPlugins = filteredPlugins.map(p => p.name);
  }

  // For each selected plugin, prompt for skills
  for (const pluginName of selectedPlugins) {
    const plugin = plugins.find(p => p.name === pluginName);
    if (plugin && plugin.skills.length > 0) {
      if (shouldPrompt) {
        selectedSkills[pluginName] = await promptSkillSelection(plugin);
      } else {
        // Install all skills if not prompting
        selectedSkills[pluginName] = plugin.skills;
      }
    }
  }

  return {
    isPluginRepo: true,
    plugins,
    selectedPlugins,
    selectedSkills,
  };
}
