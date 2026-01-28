// Backup Module - Export extension configuration
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs-extra';
import { join, dirname, basename } from 'pathe';
import { logger } from '../utils/logger.js';
import { loadConfigSync } from '../core/config.js';
import { createAgentRegistry } from '../adapters/index.js';
import type { AgentManagerConfig, Extension } from '../core/types.js';

/**
 * Backup format (JSON)
 */
export interface BackupMetadata {
  version: string;
  backedUpAt: string;
  agentManager?: {
    version: string;
    config: {
      home: string;
      manifestPath: string;
      agents: Record<string, { enabled: boolean; configPath: string; }>;
    };
  agents: Record<string, BackupAgentData>;
}

export interface BackupAgentData {
  installed: boolean;
  configPath: string;
  extensions: BackupExtension[];
}

export interface BackupExtension {
  name: string;
  type: 'mcp' | 'skill' | 'command';
  enabled: boolean;
  agents?: string[];
  config?: Record<string, unknown>;
  source?: {
    type: 'git' | 'local' | 'npm';
    repo?: string;
    commit?: string;
    tag?: string;
    branch?: string;
  };
}

/**
 * Create a backup of all extensions and configuration
 */
export async function createBackup(
  config: AgentManagerConfig,
  options: {
    outputPath?: string;
    includeManifest?: boolean;
    includeAgentManagerConfig?: boolean;
    validate?: boolean;
  }
): Promise<{ success: boolean; backupFile: string; extensionCount: number }> {
  logger.info('Creating backup...');

  const backup: BackupMetadata = {
    version: '1.0.0',
    backedUpAt: new Date().toISOString(),
    agentManager: {
      version: '1.0.0',
      config,
    },
    agents: {},
  };

  const registry = createAgentRegistry(config);
  const detectedAgents = registry.detect();

  // 1. Backup agent-manager config if requested
  if (options?.includeAgentManagerConfig) {
    backup.agentManager!.config = {
      home: config.home,
      manifestPath: config.manifestPath,
      agents: config.agents,
    };
  }

  // 2. Include manifest if requested
  if (options?.includeManifest && existsSync(config.manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(config.manifestPath, 'utf-8'));
      backup.manifest = manifest;
    } catch (error) {
      logger.warn(`Could not include manifest: ${String(error)}`);
    }
  }

  // 3. Validate backup if requested
  if (options?.validate) {
    await validateBackup(backup);
  }

  // 4. Backup all detected agents
  for (const agent of detectedAgents) {
    if (!agent.installed) {
      logger.warn(`Skipping ${agent.name}: not installed`);
      backup.agents[agent.type] = {
        installed: false,
        extensions: [],
      };
      continue;
    }

    const adapter = registry.getAdapter(agent.type);
    if (!adapter) {
      continue;
    }

    try {
      const extensions = await adapter.listExtensions();
      const agentData: BackupAgentData = {
        installed: agent.installed,
        configPath: agent.config.configPath,
        extensions: extensions.map(ext => ({
          name: ext.name,
          type: ext.type as 'mcp' | 'skill' | 'command',
          enabled: ext.enabled,
          agents: [agent.type],
          config: ext.config as Record<string, unknown> || {},
          source: ext.source,
        })),
      };

      backup.agents[agent.type] = agentData;
    } catch (error) {
      logger.warn(`Could not backup ${agent.name}: ${String(error)}`);
      backup.agents[agent.type] = {
        installed: agent.installed,
        configPath: agent.configPath,
        extensions: [],
      };
    }
  }

  // 5. Determine output path
  const backupPath = options?.output ||
    join(config.home, 'backups', `backup-${Date.now()}.json`);

  // 6. Write backup file
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  logger.success(`Backup created: ${backupPath}`);

  return {
    success: true,
    backupFile: backupPath,
    extensionCount: Object.values(backup.agents).reduce((sum, agent) => sum + (agent.extensions?.length || 0), 0),
  };
}

/**
 * Validate backup format and content
 */
async function validateBackup(backup: BackupMetadata): Promise<void> {
  // Check version
  if (!backup.version) {
    logger.error('Backup missing version field');
    return;
  }

  if (backup.version !== '1.0.0') {
    logger.warn(`Backup version ${backup.version} may not be compatible`);
  }

  // Check for required agent data
  if (Object.keys(backup.agents).length === 0) {
    logger.warn('No agent data in backup');
  }
}

  // Validate each agent has extensions array
  for (const [agentType, agentData] of Object.entries(backup.agents)) {
    if (!agentData.installed) {
      continue;
    }

    if (!Array.isArray(agentData.extensions)) {
      logger.error(`Agent ${agentType} has invalid extensions format`);
      return;
    }

    if (agentData.extensions.length === 0) {
      logger.info(`Agent ${agentType} has no extensions to backup`);
      continue;
    }
  }
}

  logger.success('Backup validation passed');
}
