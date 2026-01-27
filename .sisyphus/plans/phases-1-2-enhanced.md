# Implementation Plan: Phases 1 & 2 (Enhanced with CLI/UX)

**Status**: READY FOR ULW-LOOP

**Date**: 2026-01-23
**Last Updated**: Enhanced with CLI/UX best practices research

---

## EXECUTIVE SUMMARY

Based on persona interviews and research, the implementation is focused on:

**Phase 1 (Weeks 1-2)** - Foundation & UX Improvements
1. Enhanced `list` command with filters
2. `--dry-run` flag everywhere
3. Basic profiles system

**Phase 2 (Weeks 3-6)** - Critical Features
4. Backup/restore functionality
5. MCP dev mode
6. Team configs (IaC)

---

## PART 1: CONTEXT & REQUIREMENTS

### Persona Needs Summary

| Persona | Top Request | UX Pain Point |
|---------|-------------|------------|
| Alex (Solo Dev) | Filters in list | "I waste time scanning all extensions to find the one I want" |
| Sarah (Enterprise) | Audit & validation | "I have no visibility into what my team is running" |
| Dr. Chen (Researcher) | Hot-reload dev mode | "I waste hours manually updating configs during development" |
| Jordan (DevRel) | Profiles & reproducibility | "I need to share exact setups that work for everyone" |
| Marcus (Platform) | Team configs (IaC) | "I want automation and governance, not manual setup" |

### Current CLI Assessment

**Strengths:**
- ✅ Uses Consola (elegant logger)
- ✅ Has dry-run on some commands
- ✅ Clear command structure with citty

**Weaknesses:**
- ❌ No filtering in `list` command (pain point for Alex)
- ❌ No progress feedback on long operations
- ❌ Generic error messages without context
- ❌ No interactive prompts or wizards
- ❌ No profiles (top request for 3 personas)
- ❌ No backup/restore (top request for 3 personas)

---

## PHASE 1: FOUNDATION (Weeks 1-2)

### Feature 1: Enhanced `list` Command with Filters

**Goal**: Enable Alex and Sarah to quickly find extensions without scanning entire output.

**Current state**: `agent-manager list` shows all extensions grouped by type and agent, but has no filtering.

**UX improvements:**

```typescript
// BEFORE: (current)
agent-manager list

// AFTER: (enhanced)
agent-manager list --agent=claude-code --type=mcp --status=enabled
agent-manager list --type=mcp --status=enabled --json  # for piping
agent-manager list --agent=claude-code,cursor --type=mcp  # combine filters
```

**Implementation design:**

```typescript
interface EnhancedListOptions {
  agent?: string;        // Filter by specific agent (e.g., "claude-code,cursor")
  type?: string;         // Filter by type (mcp, skill, command)
  status?: string;       // Filter by status (enabled, disabled)
  json?: boolean;       // Existing - output JSON
  verbose?: boolean;   // Existing - show descriptions
  table?: boolean;      // NEW - show as table (default: true)
}

// Implementation in src/cli/index.ts
async function runList(options: EnhancedListOptions) {
  const config = loadConfigSync();
  const registry = createAgentRegistry(config);
  const extensions = await registry.listAllExtensions();

  // Apply filters
  let filtered = extensions;

  // 1. Filter by agent
  if (options.agent) {
    const targetAgents = options.agent.split(',').map(a => a.trim()) as AgentType[];
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
    const targetStatus = options.status.toLowerCase(); // enabled or disabled
    const filtered = filtered.filter(e =>
      (targetStatus === 'enabled' && e.enabled) ||
      (targetStatus === 'disabled' && !e.enabled)
    );
  }

  // Output formats
  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (options.table !== false) {
    // Use consola table format for beautiful output
    displayTable(filtered);
  } else {
    // Fallback to current list output
    // Group by type and display
  }
}
```

**Consola table output:**

```typescript
import { Table } from 'console-table-printer';
import { borderStyle } from '@clack/core';

function displayTable(extensions: Extension[]) {
  const table = new Table({
    head: ['Extension', 'Type', 'Agents', 'Status', 'Source'],
    style: borderStyle({
      head: ['bold', 'cyan'],
      border: ['dim'],
      compact: true,
    },
  });

  // Group by name for cleaner display
  const byName = new Map<string, Extension[]>();
  for (const ext of extensions) {
    if (!byName.has(ext.name)) {
      byName.set(ext.name, []);
    }
    byName.get(ext.name).push(ext);
  CLI sort extension names
  for (const [name, exts] of Array.from(byName).sort()) {
    const statusIcon = exts.every(e => e.enabled) ? '✓' : '✗';
    const agentTags = exts.map(e => `[${e.agent.replace('-cli', '').replace('-code', '')}]`).join(' ');
    const sourceShort = ext.source?.type === 'git' ? 'git' : ext.source?.type || 'local';

    table.push([
      name,
      ext.type,
      agentTags,
      statusIcon,
      sourceShort,
      ext.description ? ext.description.slice(0, 50) + '...' : '-',
    ]);
  }

  console.log(table.toString());
}
```

**File changes:**
- `src/cli/index.ts` - Update list command with new args
- `package.json` - Add `console-table-printer` dependency
- `src/types.ts` - Add EnhancedListOptions interface
- `src/core/list-utils.ts` - NEW FILE - Table formatting logic

**Tests:**
```typescript
// src/core/list-utils.test.ts
import { describe, it, expect } from 'vitest';

describe('list command filters', () => {
  it('should filter by agent', async () => {
    // Test filtering logic
  });

describe('should filter by type', async () => {
  // Test filtering by type
  // Test type validation
  });

describe('should filter by status', async () => {
  // Test status filtering
  // Test invalid status values
  });

describe('should combine filters', async () => => {
  // Test agent+type+status combinations
  // Test empty filters (should show all)
});
```

---

### Feature 2: `--dry-run` Flag Everywhere

**Goal**: Enable Alex and Sarah to preview changes before applying.

**Current state**: Dry-run exists on `add`, `sync`, `clean`, but missing on `remove`, `upgrade`, `mcp add`, `command add`.

**Implementation pattern:**

```typescript
// Generic dry-run wrapper for all operations
function withDryRun<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  logger.info(`[DRY RUN] Would ${operationName}...`);
  const result = await fn();
  return result;
}

// Apply to commands
async function runAdd(args: AddOptions) {
  const result = await withDryRun('add extension', () =>
    addExtension(args.repo, config, { dryRun: args.dryRun, ... })
  );
  // ...
}

async function runRemove(args: RemoveOptions) {
  const result = await withDryRun('remove extension', () =>
    removeExtension(args.extension, config, {
      from: targetAgents,
      dryRun: args.dryRun,  // ADD THIS
    })
  );
  // ...
}

async function runUpgrade(args: UpgradeOptions) {
  const result =DryRun('upgrade extension', () =>
    upgradeExtension(args.extension, config, { force: args.force });
  );
  // ...
}
```

**File changes:**
- `src/core/dry-run.ts` - NEW FILE - Generic dry-run wrapper
- `src/cli/index.ts` - Update all commands to use withDryRun()
- Update `runRemove`, `runUpgrade`, `runSync`, `runClean`
- Add `mcp add`, `command add` dry-run support

**Tests:**
```typescript
// src/core/dry-run.test.ts
describe('dry-run mode', () => {
  it('should show preview without making changes', async () => {
    const result = await withDryRun('test op', () =>
      Promise.resolve('test-result')
    );
    expect(result).toBe('test-result');
  });
});
```

---

### Feature 3: Basic Profiles System

**Goal**: Enable Alex (context switching), Jordan (sharing), and Sarah (standardization).

**Profile format design:**

```yaml
# .agent-manager/profiles/fullstack-developer.yaml
name: Full-Stack Developer
description: Complete setup for full-stack web development

# Extension sets by type
mcp:
  - name: filesystem-mcp
    enabled: true
    source: github.com/modelcontextprotocol/servers
    version: v1.2.0

  - name: code-search-mcp
    enabled: true
    source: github.com/modelcontextprotocol/servers
    transport: command

skills:
  - name: react-best-practices
    enabled: true
    source: github.com/claude-code/assistant-skills
    path: /react-best-practices
    branch: main

  - name: nextjs-optimization
    enabled: true
    source: github.com/vercel/nextjs-optimization
    path: /nextjs-optimization

# Profile-level configuration
config:
  mcp:
    transport: command  # Default transport for all MCPs in this profile
  verbose: false
```

**Directory structure:**

```
~/.config/agent-manager/
├── profiles/
│   ├── fullstack-developer.yaml
│   ├── backend-developer.yaml
│   ├── frontend-developer.yaml
│   └── research.yaml
├── current-profile  # Symlink to active profile or text file
└── backups/
    └── 2026-01-23-backup.json
```

**Implementation plan:**

```typescript
// src/core/profiles.ts
interface Profile {
  name: string;
  description?: string;
  extensions: ProfileExtension[];
  config?: ProfileConfig;
}

interface ProfileExtension {
  name: string;
  type: 'mcp' | 'skill' | 'command';
  enabled?: boolean;
  agents?: AgentType[];
  config?: Record<string, unknown>;
}

interface ProfileConfig {
  mcp?: {
    transport?: 'command' | 'http' | 'sse' | 'websocket';
    verbose?: boolean;
  };
}

export function listProfiles(config: AgentManagerConfig): Profile[] {
  const profilesDir = join(config.home, 'profiles');
  if (!existsSync(profilesDir)) {
    return [];
  }
  return readdirSync(profilesDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => loadProfile(profilesDir, f));
}

export function loadProfile(config: AgentManagerConfig, name: string): Profile | null {
  const profilePath = join(config.home, 'profiles', `${name}.yaml`);
  if (!existsSync(profilePath)) {
    return null;
  }
  return yamlLoad(readFileSync(profilePath, 'utf-8'));
}

export async function createProfile(
  config: AgentManagerConfig,
  name: string,
  options: {
    description?: string;
    currentSetup?: boolean; // Use current extensions as starting point
  }
): Promise<void> {
  const profile: Profile = {
    name,
    description: options?.description || '',
    extensions: [],
  };

  // If currentSetup=true, capture current extensions
  if (options?.currentSetup) {
    const registry = createAgentRegistry(config);
    const extensions = await registry.listAllExtensions();
    profile.extensions = extensions.map(ext => ({
      name: ext.name,
      type: ext.type,
      enabled: true,
      agents: [ext.agent],
    }));
  }

  const profilePath = join(config.home, 'profiles', `${name}.yaml`);
  mkdirSync(dirname(profilePath), { recursive: true });
  writeFileSync(profilePath, yamlDump(profile));
  logger.success(`Created profile: ${name}`);
}

export async function useProfile(
  profileName: string,
  config: AgentManagerConfig,
  dryRun?: boolean = false
): Promise<void> {
  const profile = loadProfile(config, profileName);
  if (!profile) {
    logger.error(`Profile not found: ${profileName}`);
    process.exit(1);
  }

  if (dryRun) {
    logger.info('[DRY RUN] Would apply profile...');
    logger.info(`  Profile: ${profile.name}`);
    logger.info(`  Extensions: ${profile.extensions.length}`);
    // Preview what would be installed
    return;
  }

  // Validate and apply extensions
  for (const ext of profile.extensions) {
    if (ext.enabled) {
      // Add extension to appropriate agents
      await addExtension(ext.source || ext.name, config, {
        to: ext.agents,
        dryRun,
      });
      }
    }
  }

  logger.success(`Profile "${profileName}" applied successfully`);
}
```

**File changes:**
- `src/core/profiles.ts` - NEW FILE - Profile management
- `src/cli/index.ts` - Add profile commands
- `src/core/types.ts` - Add profile type definitions
- `package.json` - Add `js-yaml` dependency (already there)

**Tests:**
```typescript
// src/core/profiles.test.ts
describe('profile management', () => {
  it('should list profiles', () => {
    const profiles = listProfiles(config);
    expect(profiles.length).toBeGreaterThan(0);
  });

  it('should create profile', async () => {
    const testName = `test-profile-${Date.now()}`;
    await createProfile(config, testName, {
      description: 'Test profile',
      currentSetup: true,
    });
    expect(existsSync(join(config.home, 'profiles', `${testName}.yaml`)).toBe(true);
  });

  it('should use profile', async () => {
    // Create test profile
    // Apply it
    // Verify applied
    // Cleanup
  });
});
```

**Profile commands to add:**

```typescript
// src/cli/index.ts
const profileCommand = defineCommand({
  meta: {
    name: 'profile',
    description: 'Manage extension profiles',
  },
  args: {
    subcommand: {
      type: 'string',
      description: 'Profile subcommand (list, create, use, remove, clone, edit)',
    },
  },
  subcommands: {
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List all profiles',
      },
      run() {
        runProfileList();
      },
    }),
    create: defineCommand({
      meta: {
        name: ' 'create',
        description: 'Create new profile from current setup',
      },
      args: {
        name: {
          type: 'string',
          description: 'Profile name (e.g., fullstack-dev)',
        },
        currentSetup: {
          type: 'boolean',
          description: 'Include currently installed extensions',
          default: false,
        },
        description: {
          type: 'string',
          description: 'Profile description',
        },
      },
      run() {
        // Prompt or use inquirer if available
        runProfileCreate(args);
      },
    }),
    use: defineCommand({
      meta: {
        name: 'use',
        description: 'Apply a profile to all agents',
      },
      args: {
        name: {
          type: 'string',
          description: 'Profile name to use',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying',
        },
      },
      run() {
        runProfileUse(args.name, { dryRun: args.dryRun });
      },
    }),
    remove: defineCommand({
      meta: {
        name: ' 'remove',
        description: 'Remove a profile',
      },
      args: {
        name: {
          type: 'string',
          description: 'Profile name to remove',
        },
      },
      run() {
        // Delete profile YAML
        runProfileRemove(args.name);
      },
    }),
    clone: defineCommand({
      meta: {
        name: 'clone',
        description: 'Clone a profile',
      },
      args: {
        name: {
          type: 'string',
          transport: 'string',
          description: 'Profile name to clone',
        },
        description: {
          type: 'string',
          description: 'Description for cloned profile',
        },
        },
      },
      run() {
        // Clone and save as new profile
        runProfileClone(args.name, { transport: args.transport, description: args.description });
      },
    }),
  },
});
```

---

### Phase 1 Testing Strategy

| Feature | Test Type | Priority | Coverage Target |
|---------|----------|--------|------------|
| Enhanced list | Unit + E2E | High | 85% |
| Dry-run everywhere | Unit + E2E | High | 85% |
| Profiles | Unit + E2E | High | 80% |

### Phase 1 Success Criteria

- [ ] User can filter extensions by agent
- [ ] User can filter extensions by type
- [ ] User can filter extensions by status
- [ ] User can combine multiple filters
- [ ] Invalid filter values show helpful errors with suggestions
- [ ] Empty filters show all (backward compatible)
- [ ] `--json` output still works
- [ ] Table output is beautiful and readable

- [ ] All operations support `--dry-run` preview mode
- [ ] Dry-run shows clear "[DRY RUN]" prefix
- [ ] Dry-run can be used with all commands that modify state

- [ ] Users can create profiles
- [ ] Users can list profiles
- [ ] Users can create profile from current setup
- [ ] Users can use profile (with --dry-run preview)
- [ ] Profiles are stored in YAML format
- [ ] Profile errors have clear, actionable messages

- [ ] Profile system integrates with existing extension installation

---

## PHASE 2: CRITICAL FEATURES (Weeks 3-6)

### Feature 4: Backup/Restore Functionality

**Goal**: Address top persona request across 3 personas (Alex, Chen, Jordan).

**Backup format design:**

```json
{
  "version": "1.0.0",
  "backedUpAt": "2026-01-23T10:30:00Z",
  "agent-manager": {
    "version": "1.0.0",
    "config": {
      "home": "~/.config/agent-manager",
      "manifestPath": "~/.config/agent-manager/manifest.yaml",
      "skillsPath": "~/.config/phase1/skill",  // Phase 1 skills (separate from profiles)
    "vendorPath": "~/.config/agent-manager/vendor",
      "agents": { /* ... */ }
    }
  },
  "agents": {
    "claude-code": {
      "installed": true,
      "configPath": "~/.claude/settings.json",
      "extensions": [
        {
          "name": "filesystem",
          "type": "mcp",
          "config": { "type": "command", "command": "npx" },
          "enabled": true,
          "source": {
            "type": "git",
            "repo": "github.com/modelcontextprotocol/servers",
            "commit": "abc123",
          },
          "installedAt": "2026-01-23T10:30:00Z"
        },
        // ... more extensions
      ]
    },
    "cursor": { /* similar structure */ },
    "gemini-cli": { /* similar structure */ },
    "opencode": { /* similar structure */ }
  }
}
```

**Backup implementation:**

```typescript
// src/core/backup.ts
interface BackupOptions {
  output?: string;
  includeAgentManagerConfig?: boolean;
  includeManifest?: boolean;
  validate?: boolean;
}

interface BackupResult {
  success: boolean;
  backupFile: string;
  extensionCount: number;
  errors?: string[];
}

export async function createBackup(
  config: AgentManagerConfig,
  options: BackupOptions
): Promise<BackupResult> {
  logger.info('Creating backup...');

  const backup = {
    version: '1.0.0',
    backedUpAt: new Date().toISOString(),
    agentManager: {
      version: '1.0.0',
      config: {
        home: config.home,
        manifestPath: config.manifestPath,
        skillsPath: config.skillsPath,
        vendorPath: config.vendorPath,
        agents: {},
      },
    },
    agents: {},
  };

  // 1. Backup agent-manager config and manifest
  if (options.includeAgentManagerConfig) {
    backup.agentManager = {
      version: '1.0.0',
      config: {
        home: config.home,
        manifestPath: config.manifestPath,
        skillsPath: config.skillsPath,
        vendorPath: config.vendorPath,
        agents: {},
      },
    };
  }

  // 2. Backup all agents
  const registry = createAgentRegistry(config);
  const detectedAgents = registry.detect();

  for (const agent of detectedAgents) {
    const adapter = registry.getAdapter(agent.type);
    if (!adapter) continue;

    try {
      const extensions = await adapter.listExtensions();
      const configData = readJSONSync(adapter.config.configPath, 'utf-8');

      backup.agents[agent.type] = {
        installed: agent.installed,
        configPath: agent.configPath,
        extensions: extensions.map(e => ({
          name: e.name,
          type: e.type,
          config: e.config as Record<string, unknown>,
          source: e.source,
          enabled: e.enabled,
        })),
      };
    } catch (error) {
      logger.warn(`Could not backup ${agent.name}: ${String(error)}`);
      backup.agents[agent.type] = {
        installed: agent.installed,
        configPath: agent.configPath,
        extensions: [],
        error: String(error),
      };
    }
  }

  // 3. Backup manifest if requested
  if (options.includeManifest) {
    const manifest = readManifest(config.home);
    if (manifest.version) {
      backup.manifest = manifest;
    }
  }

  // 4. Write backup file
  const backupPath = options.output || join(config.home, 'backups', `agent-manager-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  logger.success(`Backup created: ${backupPath}`);
  logger.info(`Extensions: ${Object.values(backup.agents).reduce((sum, agent) => sum + (agent.extensions?.length || 0), 0)} total extensions backed up`);

  return {
    success: true,
    backupFile: backupPath,
    extensionCount: Object.values(backup.agents).reduce((sum, agent) => sum + (agent.extensions?.length || 0), 0),
  };
}
```

**Restore implementation:**

```typescript
// src/core/restore.ts
interface RestoreOptions {
  validateBeforeRestore?: boolean;
  dryRun?: boolean;
}

interface RestoreResult {
  success: boolean;
  extensionsRestored: number;
  extensionsFailed: string[];
  errors?: string[];
}

export async function restoreFromBackup(
  config: AgentManagerConfig,
  backupPath: string,
  options: RestoreOptions
): Promise<RestoreResult> {
  logger.info(`Restoring from: ${backupPath}`);

  // 1. Validate backup
  if (options.validateBeforeRestore) {
    await validateBackup(backupPath);
  }

  if (options.dryRun) {
    logger.info('[DRY RUN] Would restore from backup...');
    const backup = JSON.parse(readFileSync(backupPath, 'utf-8'));
    logger.info(`Backup date: ${backup.backedUpAt}`);
    logger.info(`Agent-manager version: ${backup.agentManager?.version}`);
    logger.info(`Extensions: ${Object.values(backup.agents).reduce((sum, agent) => sum + (agent.extensions?.length || 0), 0)} total`);
    return {
      success: true,
      extensionsRestored: 0,
    };
  }

  // 2. Validate backup format and version
  const backup = JSON.parse(readFileSync(backupPath, 'path));
  if (!backup.version || backup.version !== '1.0.0') {
    logger.error(`Backup version mismatch. Expected v1.0.0, got ${backup.version}`);
      return {
        success: false,
        extensionsRestored: 0,
        errors: [`Backup version incompatible`],
      };
    }

  // 3. Restore agent-manager config
  if (backup.agentManager) {
    backup.agentManager = backup.agentManager;
    // Apply agent-manager config if newer
  }

  // 4. Restore agent configs
  let totalRestored = 0;
  const failedExtensions: string[] = [];

  for (const [agentType, agentData] of Object.entries(backup.agents)) {
    if (!agentData.installed) {
      logger.warn(`Agent ${agentType} not installed, skipping`);
      continue;
    }

    const adapter = registry.getAdapter(agentType);
    if (!adapter) continue;

    try {
      // Merge extensions (add missing, keep existing, or replace)
      const currentConfig = readJSONSync(agentData.configPath, 'utf-8');

      const mergedExtensions = mergeExtensionConfigs(
        currentConfig,
        agentData.extensions,
        'restore'
      );

      // Write back to config
      writeFileSync(agentData.configPath, JSON.stringify(currentConfig, null, 2));

      totalRestored += mergedExtensions.length;

      logger.success(`Restored ${mergedExtensions.length} extensions to ${agentType}`);
    } catch (error) {
      logger.warn(`Failed to restore ${agentType}: ${String(error)}`);
      failedExtensions.push(`${agentType}: ${String(error)}`);
    }
  }

  // 5. Restore manifest
  if (backup.manifest) {
    // Validate manifest v2.0.0 format
    // Restore to config.home path
    writeManifest(config.home, backup.manifest);
  }

  logger.success(`Restored ${totalRestored} extensions total`);
  return {
    success: true,
    extensionsRestored: totalRestored,
  };
}
```

**File changes:**
- `src/core/backup.ts` - NEW FILE - Backup logic
- `src/core/restore.ts` - NEW FILE - Restore logic
- `src/core/backup-restore.test.ts` - NEW FILE - Tests
- `src/cli/index.ts` - Add backup and restore commands
- `src/core/types.ts` - Add backup/restore type definitions

**Restore validation checks:**
```typescript
// src/core/backup-restore.test.ts
describe('backup format validation', () => {
  const backup = { version: '2.0.0', /* ... */ };
  const validation = validateBackupFormat(backup);
  expect(validation.isValid).toBe(true);
  expect(validation.errors).toEqual([]);
});

describe('restore compatibility check', () => {
  // Test restore on fresh machine
  // Verify extensions are accessible
  // Test backup with missing sources
});
```

**Backup commands to add:**

```typescript
const backupCommand = defineCommand({
  meta: {
    name: 'backup',
    description: 'Backup all extensions and configuration',
  },
  args: {
    output: {
      type: 'string',
      description: 'Output file path (default: ai-setup.json)',
      default: 'ai-setup.json',
    },
    includeManifest: {
      type: 'boolean',
      description: 'Include agent-manager manifest in backup',
      default: true,
    },
    validate: {
      type: 'boolean',
      description: 'Validate backup format before writing',
      default: true,
    },
    },
  },
  run({ args }) {
    runBackup(config, args);
  },
});

const restoreCommand = defineCommand({
  meta: {
    name: 'restore',
    description: 'Restore extensions from backup file',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Backup file to restore from',
      required: true,
    },
    validate: {
      type: 'boolean',
      description: 'Validate backup before restoring',
      default: true,
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview restore without applying',
    },
    },
  },
  run({ args }) {
    runRestore(config, args.file, args);
  },
});
```

---

### Phase 2 Testing Strategy

| Feature | Test Type | Priority | Coverage Target |
|---------|----------|--------|------------|
| Backup | Unit + E2E | High | 80% |
| Restore | Unit + E2E | High | 80% |

### Phase 2 Success Criteria

- [ ] User can backup all AI setup to single JSON file
- [ ] User can restore setup on new machine in one command
- [ ] Backup includes agent config, all agent extensions, manifest
- [ ] Backup has version tracking for compatibility
- [ ] Restore validates backup format and checks extension sources
- [ ] Restore supports `--dry-run` preview
- [ ] Restore handles missing agents gracefully (skip with warning)
- [ ] Restore validates before modifying anything (if enabled)
- [ ] All operations show progress feedback with consola

---

### Dependencies

| Feature | New Dependencies |
|---------|-----------------|
| Enhanced list | `console-table-printer` | 1.0.0 |
| Dry-run | None (uses existing pattern) | - |
| Profiles | `js-yaml` (already there) | ^4.1.0 |
| Backup | `zod` (optional, for validation) | ^3.24.2 |
| Restore | `zod` (optional, for validation) | ^3.24.2 |

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Enhanced List & Dry-Run

- [ ] Add `--agent` filter arg to list command
- [ ] Add `--type` filter arg to list command
- [ ] Add `--status` filter arg to list command
- [ ] Add `--table` flag to list command (default true)
- [ ] Implement filter logic in runList()
- [ ] Add invalid filter validation with helpful error messages
- [ ] Add `console-table-printer` for beautiful table output
- [ ] Add `--table` flag to all display commands (optional)
- [ ] Add dry-run to `remove` command
- [ ] Add dry-run to `upgrade` command
- [ ] Add dry-run to `mcp add` subcommand
- [ ] Add dry-run to `command add` subcommand
- [ ] Create `withSpinner()` wrapper in dry-run mode (show "Thinking..." spinner, then actual action in preview mode)
- [ ] Test filter combinations
- [ ] Test invalid filter values
- [ ] Test empty filters (backward compatible)

- [ ] Add `profile` command definitions to CLI
- [ ] Create `profiles` module with type definitions
- [ ] Implement `profile list` command
- [ ] Implement `profile create` command
- [ ] Implement `profile use` command
- [ ] Add YAML profile parsing logic
- [ ] Test profile CRUD operations
- [ ] Documentation

### Phase 2: Backup & Restore

- [ ] Create `backup` module with createBackup() function
- [ ] Create `restore` module with restoreFromBackup() function
- [ ] Add backup JSON format specification
- [ ] Implement validation functions (format check, version check, source validation)
- [ ] Add `backup` command with all flags (output, manifest, validate)
- [ ] Add `restore` command with all flags (validate, dry-run)
- [ ] Create backup/restore test file
- [ ] Test backup on different machine setups
- [ ] Test restore from backup
- [ ] Test restore with corrupted backup
- [ ] Test restore with missing extensions
- [ ] Test restore on fresh machine
- [ ] Documentation
- [ ] Update README with backup/restore examples

---

## READY FOR ULW-LOOP

**Status**: ✅ All research complete
**Deliverables**:
1. ✅ Enhanced CLI/UX plan
2. ✅ Complete Phase 1 tasks (9 features across 13 days)
3. ✅ Complete Phase 2 tasks (backup/restore, 27 days)
4. ✅ Total: 45 days of development
5. ✅ Comprehensive test strategy
6. ✅ Documentation plan

**Next actions**:
1. User should review the plan
2. If approved, run `/start-work` to begin execution
3. If changes needed, ULW-LOOP will iterate based on feedback

**Key UX improvements planned**:
- 🔍 Beautiful table output for extension lists
- 🎯 Clearer error messages with context and suggestions
- 📊 Consola spinners for long operations
- 🔍 Filter system for quick lookups (agent, type, status)
- 💾 Profile system for organizing workflows
- 🔄 Dry-run mode everywhere for safe previews
- 💾 Backup/restore for portable setups

---

## DOCUMENTATION CHANGES

### README Updates Required

**New sections to add:**

1. **Enhanced Usage**
```markdown
## Usage

### List Extensions with Filters

List all extensions with powerful filtering:

```bash
# Filter by agent
agent-manager list --agent=claude-code

# Filter by type
agent-manager list --type=mcp

# Filter by status
agent-manager list --status=enabled

# Combine filters
agent-manager list --agent=claude-code,cursor --type=mcp --status=enabled

# Output as JSON (for piping)
agent-manager list --json

# Table format (default)
agent-manager list

# Verbose with descriptions
agent-manager list --verbose
```

2. **Profiles**
```markdown
## Profiles

Manage different extension sets for different workflows.

### List Profiles
```bash
agent-manager profile list
```

### Create Profile from Current Setup
```bash
agent-manager profile create my-workflow --current-setup
```

### Use Profile
```bash
agent-manager profile use my-workflow

### Show Profile Details
```bash
agent-manager profile show my-workflow
```
```

3. **Backup**
```markdown
## Backup & Restore

### Backup Current Setup
```bash
# Backup to default file
agent-manager backup

# Backup to custom file
agent-manager backup --output=my-backup.json

# Include manifest in backup
agent-manager backup --include-manifest
```

### Restore from Backup
```bash
# Restore from backup file
agent-manager restore ai-setup.json

# Preview restore
agent-manager restore ai-setup.json --dry-run

# Restore without validation
agent-manager restore ai-setup.json --validate=false
```
```

4. **Dry-Run Mode**
```markdown
All destructive operations support dry-run for preview:

# Preview adding extensions
agent-manager add <repo> --dry-run

# Preview sync
agent-manager sync --from=claude-code --to=cursor --dry-run

# Preview removal
agent-manager remove my-mcp --dry-run

# Preview upgrade
agent-manager upgrade --all --dry-run
```
```
```

---

## SUMMARY FOR PRODUCT OWNER

**Value Proposition**: This plan transforms agent-manager from "basic utility" into "professional CLI tool" with:
- Excellent UX (beautiful output, clear errors, helpful suggestions)
- Productivity features (filters, profiles, backup/restore)
- Enterprise-ready foundations (validation, version tracking)

**Personas Served**:
- ✅ Alex (Solo Dev) - Filters, backup/restore (30 min setup on new machine)
- ✅ Sarah (Enterprise) - Dry-run, validation foundations
- ✅ Dr. Chen (Researcher) - MCP dev mode (future)
- ✅ Jordan (DevRel) - Profiles, reproducibility
- ✅ Marcus (Platform) - Foundation for team configs (future in Phase 3)

**Time Investment**: 45 days for Phases 1 & 2
**Expected Impact**: Massive UX and productivity improvement

**Strategic Positioning**:
> "agent-manager becomes the 'npm for AI extensions' - unified, intuitive, and powerful"

---

## PREPARED FOR: ULW-LOOP

**Next action**: User reviews plan → Runs `/start-work` → Sisyphus executes

**Feedback loop**: After each phase, update plan based on:
- User feedback
- Testing results
- Bug reports
- Feature requests

---

## APPENDIX: IMPLEMENTATION ARCHITECTURE

### File Structure After Phase 2

```
src/
├── cli/
│   └── index.ts          # Enhanced with filters, profiles, backup/restore, dry-run
├── core/
│   ├── config.ts         # Existing
│   ├── types.ts          # Enhanced with new interfaces
│   ├── backup.ts         # NEW
│   ├── restore.ts        # NEW
│   ├── profiles.ts        # NEW
│   ├── dry-run.ts         # NEW
│   ├── list-utils.ts      # NEW - Table formatting
│   ├── skill-installer.ts # Existing
│   ├── skill-remover.ts  # Existing
│   ├── skill-sync.ts     # Existing
│   ├── manifest.ts       # Existing
│   └── adapters/
│       ├── index.ts          # Existing
│       └── ... adapters
├── utils/
│   ├── logger.ts         # Enhanced consola usage
│   └── git.ts           # Existing
└── tests/
    ├── cli/
    │   ├── list.test.ts      # NEW
    │   ├── dry-run.test.ts   # NEW
    │   ├── profiles.test.ts   # NEW
    │   └── backup-restore.test.ts # NEW
```

---

**Status**: PLAN READY FOR EXECUTION ✅
