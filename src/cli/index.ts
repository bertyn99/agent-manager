// Agent Manager CLI - Built with Citty, Consola, and UnJS Stack
// Universal CLI to manage skills across AI coding agents

import { defineCommand, runMain } from 'citty';
import { logger } from '../utils/logger.js';
import { loadConfigSync, ensureDirs } from '../core/config.js';
import { createAgentRegistry } from '../adapters/index.js';
import { addSkill } from '../core/skill-installer.js';
import { removeSkill } from '../core/skill-remover.js';
import { syncSkills, upgradeSkill, upgradeAllSkills } from '../core/skill-sync.js';
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
    logger.info(`${agent.name}: ${status} (${agent.skills.length} skills)`);
  }
  
  logger.success(`Found ${agents.length} agent(s)`);
}

async function runList(options: { json?: boolean; verbose?: boolean }) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  const skills = await registry.listAllSkills();
  
  if (skills.length === 0) {
    logger.warn('No skills found.');
    logger.info('Use "agent-manager add <repo>" to add skills.');
    return;
  }
  
  if (options.json) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }
  
  // Group by agent
  const byAgent: Record<string, typeof skills> = {};
  for (const skill of skills) {
    if (!byAgent[skill.agent]) {
      byAgent[skill.agent] = [];
    }
    byAgent[skill.agent].push(skill);
  }
  
  for (const [agent, agentSkills] of Object.entries(byAgent)) {
    logger.info(`\n${agent.toUpperCase()} (${agentSkills.length} skills)\n`);
    
    for (const skill of agentSkills) {
      const icon = skill.type === 'mcp' ? '🔌' : skill.type === 'command' ? '⚡' : '📝';
      logger.log(`  ${icon} ${skill.name}`);
      if (options.verbose && skill.description) {
        logger.log(`     ${skill.description.slice(0, 60)}...`);
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
  
  const result = await addSkill(args.repo, config, {
    to: targetAgents,
    dryRun: args.dryRun,
    nested: args.nested,
    include: args.include?.split(',').map(s => s.trim()),
    exclude: args.exclude?.split(',').map(s => s.trim()),
  });
  
  if (result.success) {
    logger.success(`Successfully added skill "${result.skill}"`);
    logger.info(`Installed to: ${result.installedTo.join(', ')}`);
    if (result.commit) {
      logger.info(`Commit: ${result.commit.slice(0, 7)}`);
    }
    if (result.tag) {
      logger.info(`Tag: ${result.tag}`);
    }
  } else {
    logger.error(`Failed to add skill: ${result.error}`);
    process.exit(1);
  }
}

async function runRemove(args: { 
  skill: string;
  from?: string;
}) {
  const config = loadConfigSync();
  
  const targetAgents = args.from
    ? args.from.split(',').map(a => a.trim()) as AgentType[]
    : undefined;
  
  const result = await removeSkill(args.skill, config, {
    from: targetAgents,
  });
  
  if (result.success) {
    logger.success(`Successfully removed skill "${result.skill}"`);
    logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
  } else {
    logger.error(`Failed to remove skill: ${result.error}`);
    process.exit(1);
  }
}

async function runSync(args: { dryRun?: boolean }) {
  const config = loadConfigSync();
  
  const result = await syncSkills(config, {
    dryRun: args.dryRun,
  });
  
  if (result.synced > 0) {
    logger.success(`${result.synced} skills in sync`);
  }
  if (result.skipped > 0) {
    logger.info(`${result.skipped} skills need syncing`);
  }
  
  if (result.details.length > 0) {
    logger.info('Details:');
    for (const detail of result.details) {
      logger.log(`  - ${detail}`);
    }
  }
}

async function runUpgrade(args: { 
  skill: string;
  all?: boolean;
  force?: boolean;
}) {
  const config = loadConfigSync();
  
  if (args.all) {
    const result = await upgradeAllSkills(config, { force: args.force });
    logger.info(`Upgraded: ${result.upgraded}, Failed: ${result.failed}`);
  } else {
    const result = await upgradeSkill(args.skill, config, { force: args.force });
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
    description: 'List all skills across all detected agents',
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

const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Run health checks on the CLI and environment',
  },
  run() {
    runDoctor();
  },
});

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill from a repository',
  },
  args: {
    repo: {
      type: 'positional',
      description: 'Repository URL or path (e.g., github.com/user/skill-repo)',
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
      description: 'Repository has nested skills in subdirectories',
    },
    include: {
      type: 'string',
      description: 'Comma-separated list of skills to include (multi-skill repos)',
    },
    exclude: {
      type: 'string',
      description: 'Comma-separated list of skills to exclude (multi-skill repos)',
    },
  },
  run({ args }) {
    runAdd(args);
  },
});

const removeCommand = defineCommand({
  meta: {
    name: 'remove',
    description: 'Remove a skill from agents',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill name to remove',
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
    description: 'Synchronize skills across all agents',
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
    description: 'Upgrade a skill to the latest version',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill name to upgrade',
      required: true,
    },
    all: {
      type: 'boolean',
      description: 'Upgrade all skills',
    },
    force: {
      type: 'boolean',
      description: 'Force upgrade even for vendor skills',
    },
  },
  run({ args }) {
    runUpgrade(args);
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

const mainCommand = defineCommand({
  meta: {
    name: 'agent-manager',
    version: '2.0.0',
    description: 'Universal CLI to manage skills across AI coding agents',
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
  },
});

// Run the CLI
runMain(mainCommand);
