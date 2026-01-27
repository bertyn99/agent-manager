// Profile Management System
// Handles saving, loading, and applying extension profiles

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs-extra';
import { join, dirname, basename } from 'pathe';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { logger } from '../utils/logger.js';
import { loadConfigSync } from '../core/config.js';
import { createAgentRegistry } from '../adapters/index.js';
import type { AgentType } from '../core/types.js';

export interface Profile {
  name: string;
  description?: string;
  extensions: ProfileExtension[];
}

export interface ProfileExtension {
  name: string;
  type: 'mcp' | 'skill' | 'command';
  enabled: boolean;
  agents?: string[];
  config?: Record<string, unknown>;
}

/**
 * List all available profiles
 */
export function listProfiles(configPath: string): Profile[] {
  const profilesDir = join(configPath, 'profiles');

  if (!existsSync(profilesDir)) {
    return [];
  }

  const files = readdirSync(profilesDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => {
      const content = readFileSync(f, 'utf-8');
      return yamlLoad(content) as Profile;
    });

  return files;
}

/**
 * Load a specific profile by name
 */
export function loadProfile(configPath: string, profileName: string): Profile | null {
  const profilePath = join(configPath, 'profiles', `${profileName}.yaml`);

  if (!existsSync(profilePath)) {
    logger.error(`Profile not found: ${profileName}`);
    return null;
  }

  return yamlLoad(readFileSync(profilePath, 'utf-8')) as Profile;
}

/**
 * Create a new profile
 */
export async function createProfile(
  configPath: string,
  name: string,
  options: {
    description?: string;
    currentSetup?: boolean;
  }
): Promise<void> {
  const profilePath = join(configPath, 'profiles', `${name}.yaml`);

  if (existsSync(profilePath)) {
    logger.warn(`Profile already exists: ${name}`);
    return;
  }

  const profile: Profile = {
    name,
    description: options?.description || '',
    extensions: [],
  };

  // If currentSetup is true, capture current extensions
  if (options?.currentSetup) {
    const config = loadConfigSync();
    const registry = createAgentRegistry(config);
    const extensions = await registry.listAllExtensions();

    profile.extensions = extensions.map(ext => ({
      name: ext.name,
      type: ext.type as 'mcp' | 'skill' | 'command',
      enabled: true,
      agents: [ext.agent],
    }));

    logger.info(`Captured ${extensions.length} extensions from current setup`);
  }

  // Ensure profiles directory exists
  const profilesDir = dirname(profilePath);
  mkdirSync(profilesDir, { recursive: true });

  writeFileSync(profilePath, yamlDump(profile));
  logger.success(`Created profile: ${name}`);
}

/**
 * Apply a profile (install extensions from profile)
 */
export async function applyProfile(
  configPath: string,
  profileName: string,
  options: {
    dryRun?: boolean;
  }
): Promise<void> {
  const profile = loadProfile(configPath, profileName);

  if (!profile) {
    logger.error(`Profile not found: ${profileName}`);
    return;
  }

  if (options?.dryRun) {
    logger.info(`[DRY RUN] Would apply profile: ${profileName}`);
    logger.info(`Extensions: ${profile.extensions.length}`);
    return;
  }

  const config = loadConfigSync();
  const registry = createAgentRegistry(config);

  for (const ext of profile.extensions) {
    if (!ext.enabled) continue;

    const targetAgents = ext.agents ? ext.agents.map(a => a.trim()) as AgentType[] : undefined;

    logger.info(`Applying: ${ext.name} (${ext.type}) to: ${targetAgents?.join(', ') || 'all agents'}`);

    // For MCP servers
    if (ext.type === 'mcp') {
      const adapter = registry.getAdapter('claude-code');
      if (adapter && adapter.detect()) {
        const result = await adapter.addExtension({
          name: ext.name,
          type: 'mcp',
          enabled: true,
          config: ext.config as Record<string, unknown> | undefined,
        });

        if (!result.success) {
          logger.error(`Failed to add ${ext.name}: ${result.error}`);
        } else {
          logger.success(`Added ${ext.name} to claude-code`);
        }
      }
    }

    // For skills - skip for now (not implemented for profiles yet)
    if (ext.type === 'skill' || ext.type === 'command') {
      logger.info(`Skipping ${ext.type}: ${ext.name} (not implemented for profiles yet)`);
    }
  }

  logger.success(`Profile "${profileName}" applied successfully`);
}

/**
 * Remove a profile
 */
export function removeProfile(configPath: string, profileName: string): void {
  const profilePath = join(configPath, 'profiles', `${profileName}.yaml`);

  if (!existsSync(profilePath)) {
    logger.error(`Profile not found: ${profileName}`);
    return;
  }

  rmSync(profilePath);
  logger.success(`Removed profile: ${profileName}`);
}

/**
 * Get the profiles directory path
 */
export function getProfilesDir(configPath: string): string {
  return join(configPath, 'profiles');
}
