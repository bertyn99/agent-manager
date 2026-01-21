// Agent Manager CLI - Built with Citty, Consola, and UnJS Stack
// Universal CLI to manage extensions across AI coding agents

import { defineCommand, runMain } from 'citty';
import { logger } from '../utils/logger.js';
import { loadConfigSync, ensureDirs } from '../core/config.js';
import { createAgentRegistry } from '../adapters/index.js';
import { addExtension } from '../core/skill-installer.js';
import { removeExtension } from '../core/skill-remover.js';
import { syncExtensions, upgradeExtension, upgradeAllExtensions } from '../core/skill-sync.js';
import { readManifest, importFromOpenCodeManifest, clearManifest } from '../core/manifest.js';
import type { AgentType } from '../core/types.js';

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

async function runList(options: { json?: boolean; verbose?: boolean }) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  const extensions = await registry.listAllExtensions();
  
  if (extensions.length === 0) {
    logger.warn('No extensions found.');
    logger.info('Use "agent-manager add <repo>" to add extensions.');
    return;
  }
  
  if (options.json) {
    console.log(JSON.stringify(extensions, null, 2));
    return;
  }
  
  // Group by type first, then by agent
  const byType: Record<string, Record<string, typeof extensions>> = {
    mcp: {},
    command: {},
    skill: {},
  };
  
  for (const extension of extensions) {
    const type = extension.type;
    if (!byType[type]) {
      byType[type] = {};
    }
    if (!byType[type][extension.agent]) {
      byType[type][extension.agent] = [];
    }
    byType[type][extension.agent].push(extension);
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
  
  for (const [type, byAgent] of Object.entries(byType)) {
    const agents = Object.entries(byAgent);
    if (agents.length === 0) continue;
    
    const extCount = agents.reduce((sum, [, exts]) => sum + exts.length, 0);
    logger.info(`\n${typeNames[type]} (${extCount})\n`);
    
    for (const [agent, agentExtensions] of agents) {
      logger.info(`${agent.toUpperCase()}:`);
      for (const extension of agentExtensions) {
        const icon = extension.enabled ? '✓' : '✗';
        logger.log(`  ${icon} ${extension.name}`);
        if (options.verbose && extension.description) {
          logger.log(`     ${extension.description.slice(0, 60)}...`);
        }
      }
    }
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
}) {
  const config = loadConfigSync();
  ensureDirs(config);
  
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
}) {
  const config = loadConfigSync();
  
  const targetAgents = args.from
    ? args.from.split(',').map(a => a.trim()) as AgentType[]
    : undefined;
  
  const result = await removeExtension(args.extension, config, {
    from: targetAgents,
  });
  
  if (result.success) {
    logger.success(`Successfully removed extension "${result.extension}"`);
    logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
  } else {
    logger.error(`Failed to remove extension: ${result.error}`);
    process.exit(1);
  }
}

async function runSync(args: { dryRun?: boolean }) {
  const config = loadConfigSync();
  
  const result = await syncExtensions(config, {
    dryRun: args.dryRun,
  });
  
  if (result.synced > 0) {
    logger.success(`${result.synced} extensions in sync`);
  }
  if (result.skipped > 0) {
    logger.info(`${result.skipped} extensions need syncing`);
  }
  
  if (result.details.length > 0) {
    logger.info('Details:');
    for (const detail of result.details) {
      logger.log(`  - ${detail}`);
    }
  }
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

async function runManifest(args: { json?: boolean; import?: string; clear?: boolean }) {
  const config = loadConfigSync();
  
  if (args.clear) {
    logger.warn('Clearing agent-manager manifest...');
    clearManifest(config.home);
    logger.success('Manifest cleared');
    return;
  }
  
  if (args.import) {
    logger.info(`Importing from ${args.import}...`);
    const { imported, skipped } = importFromOpenCodeManifest(config.home, args.import);
    logger.success(`Imported ${imported} sources, skipped ${skipped} duplicates`);
    return;
  }
  
  // Show manifest
  const manifest = readManifest(config.home);
  
  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  
  logger.info('Agent Manager Manifest');
  logger.info(`Version: ${manifest.version}`);
  logger.info(`Updated: ${manifest.updated}`);
  logger.info(`\nSources (${manifest.sources.length}):`);
  
  for (const source of manifest.sources) {
    logger.log(`  - ${source.repo}`);
    logger.log(`    Path: ${source.path}, Branch: ${source.branch}`);
    if (source.include?.length) {
      logger.log(`    Include: ${source.include.join(', ')}`);
    }
    if (source.exclude?.length) {
      logger.log(`    Exclude: ${source.exclude.join(', ')}`);
    }
  }
  
  logger.info(`\nSkills (${manifest.skills.length}):`);
  
  for (const skill of manifest.skills) {
    logger.log(`  - ${skill.name}`);
    if (skill.description) {
      logger.log(`    ${skill.description.slice(0, 50)}...`);
    }
    logger.log(`    Agents: ${skill.agents.map(a => a.agent).join(', ')}`);
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
  },
  run({ args }) {
    runRemove(args);
  },
});

const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description: 'Synchronize extensions across all agents',
  },
  args: {
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
    description: 'Show or manage agent-manager manifest',
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

const commandCommand = defineCommand({
  meta: {
    name: 'command',
    description: 'Manage Gemini CLI commands',
  },
  args: {
    subcommand: {
      type: 'positional',
      description: 'Subcommand (list, add, remove)',
      required: true,
    },
    name: {
      type: 'string',
      description: 'Command name',
    },
    to: {
      type: 'string',
      description: 'Target agents (comma-separated)',
    },
    description: {
      type: 'string',
      description: 'Command description',
    },
    prompt: {
      type: 'string',
      description: 'Command prompt',
    },
    output: {
      type: 'string',
      description: 'Output type (text, json, streaming)',
    },
    args: {
      type: 'string',
      description: 'Comma-separated arguments',
    },
    totalBudget: {
      type: 'number',
      description: 'Total budget for the command',
    },
  },
  run({ args }) {
    runCommand(args as Parameters<typeof runCommand>[0]);
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
    upgrade: upgradeCommand,
    migrate: migrateCommand,
    manifest: manifestCommand,
    mcp: mcpCommand,
    command: commandCommand,
  },
});

// Run the CLI
runMain(mainCommand);
