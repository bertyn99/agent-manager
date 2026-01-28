// Agent Manager CLI - Built with Citty, Consola, and UnJS Stack
// Universal CLI to manage extensions across AI coding agents

import { withDryRun } from '../core/dry-run.js';
import { defineCommand, runMain } from 'citty';
import { existsSync, readdirSync, rmSync, readJSONSync, writeFileSync } from 'fs-extra';
import { join } from 'pathe';
import { logger } from '../utils/logger.js';
import { loadConfigSync, ensureDirs } from '../core/config.js';
import { createAgentRegistry } from '../adapters/index.js';
import { addExtension, addGlobalSkill } from '../core/skill-installer.js';
import { removeExtension } from '../core/skill-remover.js';
import { syncExtensions, upgradeExtension, upgradeAllExtensions } from '../core/skill-sync.js';
import { readManifest, readManifestV2, importFromOpenCodeManifest, clearManifest, syncFromSources } from '../core/manifest.js';
import type { AgentType } from '../core/types.js';
import { createBackup } from '../core/backup.js';
import { restoreFromBackup } from '../core/restore.js';
import { listProfiles, createProfile, applyProfile, removeProfile } from '../core/profiles.js';

// Shared command implementation
function runDetect() {
  logger.info('Detecting AI Agents...');
  
  const config = loadConfigSync();
  ensureDirs(config);
  const registry = createAgentRegistry(config);
  const agents = registry.detect();
  
  if (agents.length === 0) {
    logger.warn('No supported AI agents detected.');
    logger.info('Install Claude Code, Cursor, Gemini CLI, or OpenCode to get started.');
    return;
  }
  
  for (const agent of agents) {
    const status = agent.installed ? '✓ Installed' : '✗ Not installed';
    logger.info(`${agent.name}: ${status} (${agent.extensions.length} extensions)`);
  }
  
  logger.success(`Found ${agents.length} agent(s)`);
}

async function runList(options: { json?: boolean; verbose?: boolean; agent?: string; type?: string; status?: string }) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  let extensions = await registry.listAllExtensions();

  // Apply filters
  let filtered = extensions;

  // 1. Filter by agent
  if (options.agent) {
    const targetAgents = options.agent.split(',').map(a => a.trim());
    const validAgents = ['claude-code', 'cursor', 'gemini-cli', 'opencode'];
    const invalidAgents = targetAgents.filter(a => !validAgents.includes(a));
    if (invalidAgents.length > 0) {
      logger.error(`Invalid agent(s): ${invalidAgents.join(', ')}`);
      logger.info(`Valid agents: ${validAgents.join(', ')}`);
      process.exit(1);
    }
    filtered = filtered.filter(e => targetAgents.includes(e.agent));
  }

  // 2. Filter by type
  if (options.type) {
    const targetTypes = options.type.split(',').map(t => t.trim());
    const validTypes = ['mcp', 'skill', 'command'];
    const invalidTypes = targetTypes.filter(t => !validTypes.includes(t));
    if (invalidTypes.length > 0) {
      logger.error(`Invalid type(s): ${invalidTypes.join(', ')}`);
      logger.info(`Valid types: ${validTypes.join(', ')}`);
      process.exit(1);
    }
    filtered = filtered.filter(e => targetTypes.includes(e.type));
  }

  // 3. Filter by status
  if (options.status) {
    const targetStatus = options.status.toLowerCase();
    if (targetStatus !== 'enabled' && targetStatus !== 'disabled') {
      logger.error(`Invalid status: ${options.status}`);
      logger.info('Valid statuses: enabled, disabled');
      process.exit(1);
    }
    filtered = filtered.filter(e =>
      (targetStatus === 'enabled' && e.enabled) ||
      (targetStatus === 'disabled' && !e.enabled)
    );
  }

  if (filtered.length === 0) {
    logger.warn('No extensions found after applying filters.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  // Display as table if requested (default)
  if (options.table !== false) {
    const tableData = filtered.map(e => ({
      Name: e.name,
      Type: e.type,
      Agents: Array.from(new Set(filtered.filter(ex => ex.name === e.name).map(ex => ex.agent))).join(', '),
      Status: e.enabled ? '✓' : '✗',
      Source: e.source?.type || 'local',
    }));
    console.table(tableData);
    return;
  }
  
  // Group by type first, then by extension name, tracking which agents have it
  const byType: Record<string, Record<string, Set<string>>> = {
    mcp: {},
    command: {},
    skill: {},
  };
  
  for (const extension of extensions) {
    const type = extension.type;
    if (!byType[type]) {
      byType[type] = {};
    }
    if (!byType[type][extension.name]) {
      byType[type][extension.name] = new Set();
    }
    byType[type][extension.name].add(extension.agent);
  }
  
  const typeNames: Record<string, string> = {
    mcp: 'MCP Servers',
    command: 'Commands',
    skill: 'Skills',
  };
  
  const typeIcons: Record<string, string> = {
    mcp: '🔌',
    command: '⚡',
    skill: '📝',
  };
  
  const agentColors: Record<string, string> = {
    'claude-code': 'Claude Code',
    'cursor': 'Cursor',
    'gemini-cli': 'Gemini CLI',
    'opencode': 'OpenCode',
  };
  
  for (const [type, byName] of Object.entries(byType)) {
    const extensionNames = Object.keys(byName).sort();
    if (extensionNames.length === 0) continue;
    
    const extCount = extensionNames.length;
    logger.info(`\n${typeNames[type]} (${extCount})\n`);
    
    for (const name of extensionNames) {
      const agents = Array.from(byName[name]).sort();
      const agentTags = agents.map(a => {
        const shortName = a.replace('-cli', '').replace('-code', '').replace('opencode', 'oc');
        return `[${shortName}]`;
      }).join(' ');
      
      logger.log(`  ${typeIcons[type]} ${name}`);
      logger.log(`     ${agentTags}`);
      if (options.verbose) {
        const ext = extensions.find(e => e.name === name);
        if (ext?.description) {
          logger.log(`     ${ext.description.slice(0, 60)}...`);
        }
      }
    }
  }
  
  // Show manifest structure if available (v2.0.0)
  try {
    const manifest = readManifestV2(config.home);
    if (manifest.version === '2.0.0') {
      logger.info('\n=== From Manifest (v2.0.0) ===\n');
      
      // Show MCP servers by agent
      logger.info('MCP Servers by Agent:\n');
      const mcpByAgent: Record<string, string[]> = {
        'claude-code': [],
        'cursor': [],
        'gemini-cli': [],
        'opencode': [],
      };
      
      for (const [mcpName, mcpConfig] of Object.entries(manifest.mcp)) {
        for (const agent of mcpConfig.agents) {
          if (mcpByAgent[agent]) {
            mcpByAgent[agent].push(mcpName);
          }
        }
      }
      
      for (const [agent, mcps] of Object.entries(mcpByAgent)) {
        if (mcps.length > 0) {
          const agentName = agent.replace('-cli', '').replace('-code', '').replace('opencode', 'oc');
          logger.log(`  [${agentName}]: ${mcps.join(', ')}`);
        }
      }
      
      // Show skills by origin
      logger.info('\nSkills by Origin:\n');
      for (const originGroup of manifest.skills) {
        logger.log(`  ${originGroup.origin}`);
        if (originGroup.include.length > 0) {
          logger.log(`    Include: ${originGroup.include.join(', ')}`);
        }
        if (originGroup.exclude.length > 0) {
          logger.log(`    Exclude: ${originGroup.exclude.join(', ')}`);
        }
        logger.log(`    Skills (${originGroup.skills.length}):`);
        for (const skill of originGroup.skills) {
          const agentTags = skill.agents.length > 0
            ? skill.agents.map(a => `[${a}]`).join(' ')
            : '[]';
          logger.log(`      - ${skill.folderName} ${agentTags}`);
          if (skill.description && options.verbose) {
            logger.log(`        ${skill.description.slice(0, 50)}...`);
          }
        }
      }
    }
  } catch (error) {
    // Manifest doesn't exist or is old format - skip display
  }
}

function runDoctor() {
  logger.info('Running health checks...');
  
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  const agents = registry.detect();
  
  let checks = 0;
  let passed = 0;
  
  // Check Node.js version
  checks++;
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion >= 18) {
    logger.success(`Node.js ${nodeVersion}`);
    passed++;
  } else {
    logger.error(`Node.js ${nodeVersion} (requires >=18)`);
  }
  
  // Check agents
  for (const agent of agents) {
    checks++;
    if (agent.installed) {
      logger.success(`${agent.name} detected`);
      passed++;
    } else {
      logger.warn(`${agent.name} not found`);
    }
  }
  
  logger.info(`\n${passed}/${checks} checks passed.`);
}

async function runAdd(args: { 
  repo: string;
  to?: string;
  dryRun?: boolean;
  nested?: boolean;
  include?: string;
  exclude?: string;
  path?: string;
  global?: boolean;
}) {
  const config = loadConfigSync();
  ensureDirs(config);
  
  // Handle --global flag: install to Claude Code global skills
  if (args.global) {
    if (args.to) {
      logger.warn('--global ignores --to, installing to Claude Code global skills');
    }
    const result = await addGlobalSkill(args.repo, config, {
      dryRun: args.dryRun,
      nested: args.nested,
      include: args.include?.split(',').map(s => s.trim()),
      exclude: args.exclude?.split(',').map(s => s.trim()),
      path: args.path,
    });
    
    if (result.success) {
      logger.success(`Successfully added global skill(s) "${result.extension}"`);
      logger.info('Installed to: ~/.claude/skills/ (available to all Claude Code projects)');
    } else {
      logger.error(`Failed to add global skill: ${result.error}`);
      process.exit(1);
    }
    return;
  }
  
  // Parse target agents
  const targetAgents = args.to 
    ? args.to.split(',').map(a => a.trim()) as AgentType[]
    : undefined;
  
  const result = await addExtension(args.repo, config, {
    to: targetAgents,
    dryRun: args.dryRun,
    nested: args.nested,
    include: args.include?.split(',').map(s => s.trim()),
    exclude: args.exclude?.split(',').map(s => s.trim()),
    path: args.path,
  });
  
  if (result.success) {
    logger.success(`Successfully added extension "${result.extension}"`);
    logger.info(`Installed to: ${result.installedTo.join(', ')}`);
    if (result.commit) {
      logger.info(`Commit: ${result.commit.slice(0, 7)}`);
    }
    if (result.tag) {
      logger.info(`Tag: ${result.tag}`);
    }
  } else {
    logger.error(`Failed to add extension: ${result.error}`);
    process.exit(1);
  }
}

async function runRemove(args: { 
  extension: string;
  from?: string;
  dryRun?: boolean;
}) {
  const result = await withDryRun('remove extension', args.dryRun || false, async () => {
    const config = loadConfigSync();
    
    const targetAgents = args.from
      ? args.from.split(',').map(a => a.trim()) as AgentType[]
      : undefined;
    
    return await removeExtension(args.extension, config, {
      from: targetAgents,
      dryRun: args.dryRun,
    });
  });
  
  if (!args.dryRun) {
    if (result.success) {
      logger.success(`Successfully removed extension "${result.extension}"`);
      logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
    } else {
      logger.error(`Failed to remove extension: ${result.error}`);
      process.exit(1);
    }
  }
}

async function runSync(args: { 
  from?: string;
  to?: string;
  dryRun?: boolean;
}) {
  const config = loadConfigSync();
  ensureDirs(config);
  
  // Parse agents
  const sourceAgents = args.from 
    ? args.from.split(',').map(a => a.trim()) as AgentType[]
    : undefined;
    
  const targetAgentsArg = args.to 
    ? args.to.split(',').map(a => a.trim()) as AgentType[]
    : undefined;

  const result = await syncExtensions(config, {
    from: sourceAgents,
    to: targetAgentsArg,
    dryRun: args.dryRun,
  });
  
  if (result.synced > 0) {
    logger.success(`Synced ${result.synced} extensions`);
  }
  if (result.added.length > 0) {
    logger.info(`Added to: ${result.added.join(', ')}`);
  }
  if (result.skipped > 0) {
    logger.info(`${result.skipped} extensions already exist on target agents`);
  }
  if (result.failed > 0) {
    logger.warn(`${result.failed} extensions failed to sync`);
  }
  
  if (result.details.length > 0) {
    logger.info('Details:');
    for (const detail of result.details) {
      logger.log(`  - ${detail}`);
    }
  }
}

async function runClean(args: { 
  agent: string; 
  skills?: boolean; 
  mcp?: boolean; 
  command?: boolean; 
  all?: boolean;
  force?: boolean; 
  dryRun?: boolean;
}) {
  const agentType = args.agent as AgentType;
  const config = loadConfigSync();
  
  if (!config.agents[agentType]) {
    logger.error(`Unknown agent: ${agentType}`);
    logger.info(`Available agents: claude-code, cursor, gemini-cli, opencode`);
    process.exit(1);
  }

  const agentConfig = config.agents[agentType];
  const registry = createAgentRegistry(config);
  const adapter = registry.getAdapter(agentType);
  
  if (!adapter || !adapter.detect()) {
    logger.warn(`${agentType} is not installed`);
    return;
  }

  // Determine what to clean
  const cleanSkills = args.all || args.skills || (!args.mcp && !args.command && !args.all);
  const cleanMcp = args.all || args.mcp || (!args.skills && !args.command && !args.all);
  const cleanCommands = args.all || args.command || false;

  // Get current extensions
  const extensions = await adapter.listExtensions();
  const skills = extensions.filter(e => e.type === 'skill');
  const mcps = extensions.filter(e => e.type === 'mcp');
  const commands = extensions.filter(e => e.type === 'command');

  const totalToClean = (cleanSkills ? skills.length : 0) + 
                       (cleanMcp ? mcps.length : 0) + 
                       (cleanCommands ? commands.length : 0);

  if (totalToClean === 0) {
    logger.info(`${agentType} has no extensions matching the selected criteria`);
    return;
  }

  // Show what will be cleaned
  logger.info(`Extensions on ${agentType}:`);
  if (cleanSkills) logger.info(`  - Skills: ${skills.length}`);
  if (cleanMcp) logger.info(`  - MCP Servers: ${mcps.length}`);
  if (cleanCommands) logger.info(`  - Commands: ${commands.length}`);

  if (args.dryRun) {
    logger.info(`[DRY RUN] Would remove ${totalToClean} extensions`);
    return;
  }

  if (!args.force) {
    logger.warn(`This will remove ${totalToClean} extensions from ${agentType}`);
    logger.info(`Run with --force to skip this confirmation`);
    return;
  }

  // Clean skills
  if (cleanSkills && agentConfig.skillsPath && existsSync(agentConfig.skillsPath)) {
    const skillDirs = readdirSync(agentConfig.skillsPath);
    
    if (skillDirs.length > 0) {
      logger.info(`Removing ${skillDirs.length} skills from ${agentConfig.skillsPath}`);
      for (const skill of skillDirs) {
        const skillPath = join(agentConfig.skillsPath, skill);
        rmSync(skillPath, { recursive: true });
        logger.success(`Removed skill: ${skill}`);
      }
    }
  }

  // Clean MCP config
  if (cleanMcp && existsSync(agentConfig.configPath)) {
    try {
      const mcpConfig = readJSONSync(agentConfig.configPath);
      
      if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
        const mcpNames = Object.keys(mcpConfig.mcpServers);
        logger.info(`Removing ${mcpNames.length} MCP servers from ${agentConfig.configPath}`);
        
        for (const name of mcpNames) {
          logger.success(`Removed MCP server: ${name}`);
        }
        
        mcpConfig.mcpServers = {};
        writeFileSync(agentConfig.configPath, JSON.stringify(mcpConfig, null, 2));
      } else {
        logger.info('No MCP servers to remove');
      }
    } catch (e) {
      logger.warn(`Could not clear MCP config: ${String(e)}`);
    }
  }

  // Clean commands (for Gemini CLI)
  if (cleanCommands && agentConfig.skillsPath && existsSync(agentConfig.skillsPath)) {
    const commandFiles = readdirSync(agentConfig.skillsPath).filter(f => f.endsWith('.toml'));
    
    if (commandFiles.length > 0) {
      logger.info(`Removing ${commandFiles.length} commands from ${agentConfig.skillsPath}`);
      for (const cmd of commandFiles) {
        const cmdPath = join(agentConfig.skillsPath, cmd);
        rmSync(cmdPath);
        logger.success(`Removed command: ${cmd}`);
      }
    }
  }

  // Clear from manifest
  clearManifest(config.home, agentType);

  logger.success(`Cleaned ${totalToClean} extensions from ${agentType}`);
}

async function runUpgrade(args: { 
  extension: string;
  all?: boolean;
  force?: boolean;
}) {
  const config = loadConfigSync();
  
  if (args.all) {
    const result = await upgradeAllExtensions(config, { force: args.force });
    logger.info(`Upgraded: ${result.upgraded}, Failed: ${result.failed}`);
  } else {
    const result = await upgradeExtension(args.extension, config, { force: args.force });
    logger.info(result.message);
  }
}

async function runMigrate() {
  logger.info('Migrating from skill-manager...');
  
  // Check for skill-manager config
  const oldConfigPath = `${process.env.HOME}/.config/skill-manager/skills.yaml`;
  const { existsSync } = await import('fs-extra');
  
  if (existsSync(oldConfigPath)) {
    logger.info('Found skill-manager config, importing...');
    logger.warn('Full migration not yet implemented - manual migration required');
  } else {
    logger.info('No skill-manager config found');
  }
}

async function runMCP(args: {
  subcommand: string;
  name?: string;
  to?: string;
  command?: string;
  args?: string;
  url?: string;
  transport?: string;
}) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  
  switch (args.subcommand) {
    case 'list': {
      const extensions = await registry.listAllExtensions();
      const mcpServers = extensions.filter(e => e.type === 'mcp');
      
      if (mcpServers.length === 0) {
        logger.warn('No MCP servers found.');
        return;
      }
      
      logger.info(`\nMCP Servers (${mcpServers.length})\n`);
      
      // Group by agent
      const byAgent: Record<string, typeof mcpServers> = {};
      for (const mcp of mcpServers) {
        if (!byAgent[mcp.agent]) {
          byAgent[mcp.agent] = [];
        }
        byAgent[mcp.agent].push(mcp);
      }
      
      for (const [agent, servers] of Object.entries(byAgent)) {
        logger.info(`${agent.toUpperCase()}:`);
        for (const server of servers) {
          const icon = server.enabled ? '✓' : '✗';
          logger.log(`  ${icon} ${server.name}`);
          if (server.config) {
            const cfg = server.config as Record<string, unknown>;
            const transport = cfg.type as string || 'unknown';
            logger.log(`     Transport: ${transport}`);
          }
        }
      }
      break;
    }
    
    case 'add': {
      if (!args.name) {
        logger.error('MCP server name is required');
        process.exit(1);
      }
      
      // Parse target agents
      const targetAgents = args.to
        ? args.to.split(',').map(a => a.trim())
        : undefined;
      
      // Build MCP config
      const transportType = args.transport || 'command';
      const mcpConfig: Record<string, unknown> = {
        type: transportType,
      };
      
      if (args.command) {
        mcpConfig.command = args.command;
      }
      
      if (args.args) {
        mcpConfig.args = args.args.split(',').map(a => a.trim());
      }
      
      if (args.url) {
        mcpConfig.url = args.url;
      }
      
      // Add MCP server
      const result = await registry.addExtension({
        name: args.name,
        type: 'mcp',
        agent: targetAgents?.[0] as AgentType || 'gemini-cli',
        config: mcpConfig,
        enabled: true,
      }, targetAgents);
      
      if (result.success) {
        logger.success(`MCP server "${args.name}" added successfully`);
        logger.info(`Installed to: ${result.installedTo.join(', ')}`);
      } else {
        logger.error(`Failed to add MCP server: ${result.error}`);
        process.exit(1);
      }
      break;
    }
    
    case 'remove': {
      if (!args.name) {
        logger.error('MCP server name is required');
        process.exit(1);
      }
      
      const targetAgents = args.to
        ? args.to.split(',').map(a => a.trim())
        : undefined;
      
      const result = await registry.removeExtension(args.name, targetAgents);
      
      if (result.success) {
        logger.success(`MCP server "${args.name}" removed successfully`);
        logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
      } else {
        logger.error(`Failed to remove MCP server: ${result.error}`);
        process.exit(1);
      }
      break;
    }
    
    default:
      logger.error(`Unknown MCP subcommand: ${args.subcommand}`);
      process.exit(1);
  }
}

async function runCommand(args: {
  subcommand: string;
  name?: string;
  to?: string;
  description?: string;
  prompt?: string;
  output?: string;
  args?: string;
  totalBudget?: number;
}) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  
  switch (args.subcommand) {
    case 'list': {
      const extensions = await registry.listAllExtensions();
      const commands = extensions.filter(e => e.type === 'command');
      
      if (commands.length === 0) {
        logger.warn('No commands found.');
        return;
      }
      
      logger.info(`\nCommands (${commands.length})\n`);
      
      // Group by agent
      const byAgent: Record<string, typeof commands> = {};
      for (const cmd of commands) {
        if (!byAgent[cmd.agent]) {
          byAgent[cmd.agent] = [];
        }
        byAgent[cmd.agent].push(cmd);
      }
      
      for (const [agent, cmds] of Object.entries(byAgent)) {
        logger.info(`${agent.toUpperCase()}:`);
        for (const cmd of cmds) {
          const icon = cmd.enabled ? '✓' : '✗';
          logger.log(`  ${icon} ${cmd.name}`);
          if (cmd.description) {
            logger.log(`     ${cmd.description.slice(0, 60)}`);
          }
        }
      }
      break;
    }
    
    case 'add': {
      if (!args.name) {
        logger.error('Command name is required');
        process.exit(1);
      }
      
      if (!args.prompt) {
        logger.error('Command prompt is required');
        process.exit(1);
      }
      
      // Parse target agents
      const targetAgents = args.to
        ? args.to.split(',').map(a => a.trim())
        : undefined;
      
      // Build command config
      const commandConfig: Record<string, unknown> = {
        name: args.name,
        description: args.description || '',
        prompt: args.prompt,
      };
      
      if (args.args) {
        commandConfig.args = args.args.split(',').map(a => a.trim());
      }
      
      if (args.totalBudget) {
        commandConfig.totalBudget = args.totalBudget;
      }
      
      if (args.output) {
        commandConfig.output = args.output;
      }
      
      // Add command
      const result = await registry.addExtension({
        name: args.name,
        type: 'command',
        agent: targetAgents?.[0] as AgentType || 'gemini-cli',
        config: commandConfig,
        enabled: true,
      }, targetAgents);
      
      if (result.success) {
        logger.success(`Command "${args.name}" added successfully`);
        logger.info(`Installed to: ${result.installedTo.join(', ')}`);
      } else {
        logger.error(`Failed to add command: ${result.error}`);
        process.exit(1);
      }
      break;
    }
    
    case 'remove': {
      if (!args.name) {
        logger.error('Command name is required');
        process.exit(1);
      }
      
      const targetAgents = args.to
        ? args.to.split(',').map(a => a.trim())
        : undefined;
      
      const result = await registry.removeExtension(args.name, targetAgents);
      
      if (result.success) {
        logger.success(`Command "${args.name}" removed successfully`);
        logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
      } else {
        logger.error(`Failed to remove command: ${result.error}`);
        process.exit(1);
      }
      break;
    }
    
    default:
      logger.error(`Unknown command subcommand: ${args.subcommand}`);
      process.exit(1);
  }
}

async function runProfile(args: {
  subcommand: string;
  name?: string;
  description?: string;
  currentSetup?: boolean;
  dryRun?: boolean;
}) {
  const config = loadConfigSync();
  ensureDirs(config);

  switch (args.subcommand) {
    case 'list': {
      const profiles = listProfiles(config.home);
      if (profiles.length === 0) {
        logger.info('No profiles found.');
        return;
      }
      logger.info(`\nProfiles (${profiles.length})\n`);
      for (const profile of profiles) {
        logger.log(`  - ${profile.name}`);
        if (profile.description) {
          logger.log(`    ${profile.description.slice(0, 60)}`);
        }
        logger.log(`    Extensions: ${profile.extensions.length}`);
      }
      break;
    }

    case 'create': {
      if (!args.name) {
        logger.error('Profile name is required');
        process.exit(1);
      }
      await createProfile(config.home, args.name, {
        description: args.description,
        currentSetup: args.currentSetup || false,
      });
      break;
    }

    case 'use': {
      if (!args.name) {
        logger.error('Profile name is required');
        process.exit(1);
      }
      await applyProfile(config.home, args.name, {
        dryRun: args.dryRun,
      });
      break;
    }

    case 'remove': {
      if (!args.name) {
        logger.error('Profile name is required');
        process.exit(1);
      }
      removeProfile(config.home, args.name);
      break;
    }

    default:
      logger.error(`Unknown profile subcommand: ${args.subcommand}`);
      process.exit(1);
  }
}

async function runManifest(args: { json?: boolean; import?: string; clear?: boolean; sync?: boolean; verbose?: boolean; dryRun?: boolean }) {
  const config = loadConfigSync();
  
  if (args.clear) {
    logger.warn('Clearing agent-manager manifest...');
    clearManifest(config.home);
    logger.success('Manifest cleared');
    return;
  }
  
  if (args.sync) {
    logger.info('Syncing skills from configured sources...');
    const result = await syncFromSources(config.home, {
      dryRun: args.dryRun,
      verbose: args.verbose,
    });
    
    if (result.success) {
      logger.success('Sync complete');
    }
    
    if (result.details.length > 0 && args.verbose) {
      logger.info('Details:');
      for (const detail of result.details) {
        logger.log('  - ' + detail);
      }
    }
    return;
  }
  
  if (args.import) {
    logger.info(`Importing from ${args.import}...`);
    const { imported, skipped } = importFromOpenCodeManifest(config.home, args.import);
    logger.success(`Imported ${imported} sources, skipped ${skipped} duplicates`);
    return;
  }
  
  // Show manifest - use readManifestV2 for v2.0.0 support
  const manifest = readManifestV2(config.home);
  
  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  
  logger.info('Agent Manager Manifest');
  logger.info(`Version: ${manifest.version}`);
  logger.info(`Updated: ${manifest.updated}`);
  
  // Handle v2.0.0 format
  if (manifest.version === '2.0.0') {
    // Show MCP servers
    const mcpEntries = Object.entries(manifest.mcp);
    logger.info(`\nMCP Servers (${mcpEntries.length}):`);
    
    if (mcpEntries.length === 0) {
      logger.log('  (none)');
    } else {
      for (const [mcpName, mcpConfig] of mcpEntries) {
        logger.log(`  - ${mcpName}`);
        logger.log(`    Agents: ${mcpConfig.agents.join(', ')}`);
      }
    }
    
    // Show skills by origin
    logger.info(`\nSkills by Origin (${manifest.skills.length}):`);
    
    if (manifest.skills.length === 0) {
      logger.log('  (none)');
    } else {
      for (const originGroup of manifest.skills) {
        logger.log(`  - ${originGroup.origin}`);
        logger.log(`    Path: ${originGroup.path}, Branch: ${originGroup.branch || 'main'}`);
        if (originGroup.include?.length) {
          logger.log(`    Include: ${originGroup.include.join(', ')}`);
        }
        if (originGroup.exclude?.length) {
          logger.log(`    Exclude: ${originGroup.exclude.join(', ')}`);
        }
        logger.log(`    Skills (${originGroup.skills.length}):`);
        for (const skill of originGroup.skills) {
          const agentTags = skill.agents.length > 0 ? skill.agents.join(', ') : '(none)';
          logger.log(`      - ${skill.name} [${agentTags}]`);
          if (skill.description && args.verbose) {
            logger.log(`        ${skill.description.slice(0, 60)}...`);
          }
        }
      }
    }
  } else {
    // Handle legacy v1.0.0 format (cast to any for fallback display)
    const legacyManifest = manifest as any;
    
    logger.info(`\nSources (${legacyManifest.sources?.length || 0}):`);
    
    if (legacyManifest.sources?.length) {
      for (const source of legacyManifest.sources) {
        logger.log(`  - ${source.repo}`);
        logger.log(`    Path: ${source.path}, Branch: ${source.branch}`);
        if (source.include?.length) {
          logger.log(`    Include: ${source.include.join(', ')}`);
        }
        if (source.exclude?.length) {
          logger.log(`    Exclude: ${source.exclude.join(', ')}`);
        }
      }
    } else {
      logger.log('  (none)');
    }
    
    logger.info(`\nSkills (${legacyManifest.skills?.length || 0}):`);
    
    if (legacyManifest.skills?.length) {
      for (const skill of legacyManifest.skills) {
        logger.log(`  - ${skill.name}`);
        if (skill.description) {
          logger.log(`    ${skill.description.slice(0, 50)}...`);
        }
        const agents = skill.agents?.map((a) => a.agent).join(', ') || '(none)';
        logger.log(`    Agents: ${agents}`);
      }
    } else {
      logger.log('  (none)');
    }
  }
}

// Command definitions
const detectCommand = defineCommand({
  meta: {
    name: 'detect',
    description: 'Detect installed AI agents on the system',
  },
  run() {
    runDetect();
  },
});

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List all extensions across all detected agents',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output as JSON',
    },
    verbose: {
      type: 'boolean',
      description: 'Show detailed information',
      alias: 'v',
    },
    agent: {
      type: 'string',
      description: 'Filter by specific agent(s) (comma-separated, e.g., claude-code,cursor)',
    },
    type: {
      type: 'string',
      description: 'Filter by extension type (mcp,skill,command)',
    },
    status: {
      type: 'string',
      description: 'Filter by status (enabled,disabled)',
    },
    table: {
      type: 'boolean',
      description: 'Show output as table',
      default: true,
    },
  },
  run({ args }) {
    runList(args);
  },
});

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add an extension from a repository',
  },
  args: {
    repo: {
      type: 'positional',
      description: 'Repository URL or path (e.g., github.com/user/extension-repo)',
      required: true,
    },
    to: {
      type: 'string',
      description: 'Add to specific agents (comma-separated: claude-code,cursor,gemini-cli,opencode)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview changes without applying',
      alias: 'd',
    },
    nested: {
      type: 'boolean',
      description: 'Repository has nested extensions in subdirectories',
    },
    include: {
      type: 'string',
      description: 'Comma-separated list of extensions to include (multi-extension repos)',
    },
    exclude: {
      type: 'string',
      description: 'Comma-separated list of extensions to exclude (multi-extension repos)',
    },
    path: {
      type: 'string',
      description: 'Path to plugin or skills directory within the repository (e.g., plugins/frontend/skills)',
    },
    global: {
      type: 'boolean',
      description: 'Install skills to Claude Code global skills directory (available to all Claude Code projects)',
    },
  },
  run({ args }) {
    runAdd(args);
  },
});

const removeCommand = defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove an extension from agents',
  },
  args: {
    extension: {
      type: 'positional',
      description: 'Extension name to remove',
      required: true,
    },
    from: {
      type: 'string',
      description: 'Remove from specific agents (comma-separated)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview changes without applying',
      alias: 'd',
    },
  },
  run({ args }) {
    runRemove(args as any);
  },
});

const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description: 'Synchronize/replicate extensions from one agent to others',
  },
  args: {
    from: {
      type: 'string',
      description: 'Source agent to copy extensions from (comma-separated)',
    },
    to: {
      type: 'string',
      description: 'Target agents to install extensions to (comma-separated, defaults to all other agents)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview changes without applying',
      alias: 'd',
    },
  },
  run({ args }) {
    runSync(args);
  },
});

const cleanCommand = defineCommand({
  meta: {
    name: 'clean',
    description: 'Remove extensions from an agent (skills, MCP servers, or commands)',
  },
  args: {
    agent: {
      type: 'positional',
      description: 'Agent to clean (claude-code, cursor, gemini-cli, opencode)',
      required: true,
    },
    skills: {
      type: 'boolean',
      description: 'Remove skills only',
    },
    mcp: {
      type: 'boolean',
      description: 'Remove MCP servers only',
    },
    command: {
      type: 'boolean',
      description: 'Remove commands only',
    },
    all: {
      type: 'boolean',
      description: 'Remove all extension types (skills, MCP, commands)',
    },
    force: {
      type: 'boolean',
      description: 'Skip confirmation prompt',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview what would be removed without applying',
      alias: 'd',
    },
  },
  run({ args }) {
    runClean(args);
  },
});

const upgradeCommand = defineCommand({
  meta: {
    name: 'upgrade',
    description: 'Upgrade an extension to the latest version',
  },
  args: {
    extension: {
      type: 'positional',
      description: 'Extension name to upgrade',
      required: true,
    },
    all: {
      type: 'boolean',
      description: 'Upgrade all extensions',
    },
    force: {
      type: 'boolean',
      description: 'Force upgrade even for vendor extensions',
    },
  },
  run({ args }) {
    runUpgrade(args);
  },
});

const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Run health checks on the CLI and environment',
  },
  run() {
    runDoctor();
  },
});

const migrateCommand = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Migrate from skill-manager to agent-manager',
  },
  run() {
    runMigrate();
  },
});

const manifestCommand = defineCommand({
  meta: {
    name: 'manifest',
    description: 'Show or manage agent-manager manifest (v2.0.0 - MCPs separated, skills grouped by origin)',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output as JSON',
    },
    import: {
      type: 'string',
      description: 'Import from OpenCode skills.yaml',
    },
    clear: {
      type: 'boolean',
      description: 'Clear the manifest (use with caution)',
    },
    sync: {
      type: 'boolean',
      description: 'Sync skills from origin repositories using include/exclude filters (v2.0.0)',
    },
    verbose: {
      type: 'boolean',
      description: 'Show detailed sync output (v2.0.0)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview sync changes without applying',
      alias: 'd',
    },
  },
  run({ args }) {
    runManifest(args);
  },
});

const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description: 'Manage MCP servers across AI agents',
  },
  args: {
    subcommand: {
      type: 'positional',
      description: 'Subcommand (list, add, remove)',
      required: true,
    },
    name: {
      type: 'string',
      description: 'MCP server name',
    },
    to: {
      type: 'string',
      description: 'Target agents (comma-separated)',
    },
    command: {
      type: 'string',
      description: 'Command to run MCP server',
    },
    args: {
      type: 'string',
      description: 'Comma-separated arguments',
    },
    url: {
      type: 'string',
      description: 'MCP server URL (for http transport)',
    },
    transport: {
      type: 'string',
      description: 'Transport type (stdio, http, sse, websocket)',
    },
  },
  run({ args }) {
    runMCP(args as Parameters<typeof runMCP>[0]);
  },
});

const profileCommand = defineCommand({
  meta: {
    name: 'profile',
    description: 'Manage extension profiles',
  },
  args: {
    subcommand: {
      type: 'string',
      description: 'Profile subcommand (list, create, use, remove)',
      required: true,
    },
    name: {
      type: 'string',
      description: 'Profile name',
    },
    description: {
      type: 'string',
      description: 'Profile description',
    },
    currentSetup: {
      type: 'boolean',
      description: 'Include currently installed extensions in profile',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview changes without applying',
      alias: 'd',
    },
  },
  run({ args }) {
    runProfile(args);
  },
});

const mainCommand = defineCommand({
  meta: {
    name: 'agent-manager',
    version: '2.0.0',
    description: 'Universal CLI to manage extensions across AI coding agents',
  },
  args: {
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
  },
  run({ args }) {
    if (args.verbose) {
      logger.level = 4; // Debug level
    }
    // Show help when no subcommand
    logger.info('Run with --help to see available commands');
  },
  subCommands: {
    detect: detectCommand,
    list: listCommand,
    doctor: doctorCommand,
    add: addCommand,
    remove: removeCommand,
    sync: syncCommand,
    clean: cleanCommand,
    upgrade: upgradeCommand,
    migrate: migrateCommand,
    manifest: manifestCommand,
    mcp: mcpCommand,
    profile: profileCommand,
    backup: backupCommand,
    restore: restoreCommand,
  },
});

// Run the CLI
runMain(mainCommand);
