# Implementation Preparation: Phases 1 & 2

**Status**: Context gathering complete. Ready for ulw-loop planning.

**Date**: 2026-01-23

---

## Part 1: Current Implementation Analysis

### Codebase Structure

```
src/
├── cli/
│   └── index.ts          # Main CLI entry point (1200+ lines)
├── core/
│   ├── config.ts         # Configuration management
│   ├── types.ts          # Type definitions
│   ├── skill-installer.ts # Extension installation logic
│   ├── skill-remover.ts  # Extension removal logic
│   ├── skill-sync.ts     # Sync/upgrade logic
│   └── manifest.ts       # Manifest v1.0/v2.0 management
├── adapters/
│   ├── index.ts          # Agent registry
│   ├── ClaudeAdapter.ts   # Claude Code adapter
│   ├── CursorAdapter.ts   # Cursor adapter
│   ├── GeminiAdapter.ts   # Gemini CLI adapter
│   └── OpenCodeAdapter.ts # OpenCode adapter
└── utils/
    ├── logger.ts         # Logging (consola-based)
    └── git.ts           # Git operations
```

### Current Feature Matrix

| Feature | Command | Status | Notes |
|---------|----------|--------|-------|
| **List extensions** | `agent-manager list` | ✅ Complete |
| **Dry-run** | `--dry-run` flag | ⚠️ Partial (on `add`, `sync`, `clean` only) |
| **Backup/Restore** | - | ❌ Not implemented |
| **Profiles** | - | ❌ Not implemented |
| **MCP dev mode** | - | ❌ Not implemented |
| **Team configs** | - | ⚠️ Partial (manifest exists but not for teams) |
| **Policy engine** | - | ❌ Not implemented |
| **Test infrastructure** | Vitest | ✅ In place |

### Current Command Analysis

#### `list` Command (Lines 39-72)
**Current implementation:**
- Groups extensions by type (mcp, skill, command)
- Shows which agents have each extension
- Supports `--json` output
- Supports `--verbose` for descriptions
- Displays manifest v2.0 info when available

**Missing for personas:**
- No `--agent` filter (e.g., `--agent=claude-code`)
- No `--type` filter (e.g., `--type=mcp`)
- No `--status` filter (e.g., `--status=enabled`)
- No `--table` format option (only console output or JSON)

#### Dry-run Support
**Currently available on:**
- `add` - Line 28: `dryRun: args.dryRun`
- `sync` - Line 314: `dryRun: args.dryRun`
- `clean` - Line 388: `--dry-run` flag

**Missing from:**
- `remove` - No dry-run option
- `upgrade` - No dry-run option
- `mcp add` - No dry-run option
- `command add` - No dry-run option

#### Config Management
**Pattern:**
- `loadConfigSync()` loads from manifest path
- `writeFileSync()` writes configs
- No atomic writes or rollbacks
- No backup before modifying configs

**Dependencies:**
- `js-yaml` for YAML
- `fs-extra` for file operations
- `pathe` for path utilities

---

## Part 2: Technical Design for Phases 1 & 2

### Phase 1 Features

#### 1. Enhanced `list` Command with Filters

**Goal**: Add filtering capabilities for all personas.

**Design:**

```typescript
// New interface for list options
interface ListOptions {
  agent?: string;        // Filter by agent (e.g., "claude-code,cursor")
  type?: string;         // Filter by type (e.g., "mcp,skill")
  status?: string;       // Filter by status (e.g., "enabled", "disabled")
  json?: boolean;       // Existing - output as JSON
  verbose?: boolean;   // Existing - show descriptions
  table?: boolean;      // NEW - output as table format (default)
}
```

**Implementation plan:**

1. Add CLI args to list command
2. Implement filter logic in `runList()`
3. Add table output format

**File changes:**
- `src/cli/index.ts` - Update list command args and runList() function

**Testing:**
- Test `agent-manager list --agent=claude-code`
- Test `agent-manager list --type=mcp`
- Test `agent-manager list --status=enabled`
- Test `agent-manager list --agent=claude-code,cursor --type=mcp` (combine filters)

**Edge cases:**
- Invalid agent name - Provide helpful error with list of valid agents
- Invalid type name - Provide helpful error with list of valid types
- No extensions match filter - Show "No extensions found" with helpful message
- Empty filters - Show all if all filters are empty (backward compatible)

---

#### 2. `--dry-run` Flag Everywhere

**Goal**: Preview changes before applying to all destructive commands.

**Current state:**
- ✅ `add` - Has dry-run
- ✅ `sync` - Has dry-run
- ✅ `clean` - Has dry-run
- ❌ `remove` - Missing dry-run
- ❌ `upgrade` - Missing dry-run
- ❌ `mcp add` - Missing dry-run
- ❌ `command add` - Missing dry-run

**Implementation plan:**

1. Add `dry-run` to `remove` command
2. Add `dry-run` to `upgrade` command
3. Add `dry-run` to `mcp add` subcommand
4. Add `dry-run` to `command add` subcommand

**File changes:**
- `src/cli/index.ts` - Update command definitions for remove, upgrade, mcp, command

**Testing:**
- Test `agent-manager remove my-mcp --dry-run`
- Test `agent-manager upgrade --all --dry-run`
- Test `agent-manager mcp add my-server --dry-run`

**Edge cases:**
- Dry-run with non-existent extension - Show error but don't modify
- Dry-run with invalid agent - Show error for preview too

---

#### 3. Basic Profiles System

**Goal**: Enable Alex (Solo Dev), Jordan (DevRel), and Sarah (Enterprise) to manage different extension sets.

**Design:**

**Profile format (YAML):**
```yaml
# .agent-manager/profiles/fullstack-developer.yaml
name: Full-Stack Developer
description: Complete setup for full-stack development

extensions:
  - name: filesystem
    type: mcp
    enabled: true
  - name: search-code
    type: mcp
    enabled: true
  - name: react-best-practices
    type: skill
    enabled: true
  - name: nextjs-optimization
    type: skill
    enabled: true

config:
  mcp:
    transport: command  # default for all MCPs in this profile
```

**Directory structure:**
```
~/.config/agent-manager/
├── profiles/
│   ├── fullstack-developer.yaml
│   ├── backend-developer.yaml
│   ├── frontend-developer.yaml
│   └── research.yaml
└── current-profile  # Symlink to active profile
```

**Implementation plan:**

1. Create profile type definitions
2. Add profile commands: list, create, use, show
3. Implement `profile use` logic
4. Implement profile YAML parsing

**File changes:**
- `src/core/profiles.ts` - NEW FILE - Profile management logic
- `src/cli/index.ts` - Add profile commands
- `src/core/types.ts` - Add profile type definitions

**Testing:**
- Test `agent-manager profile create backend`
- Test `agent-manager profile list`
- Test `agent-manager profile use backend --dry-run`
- Test `agent-manager profile use backend` (applies)

**Edge cases:**
- Profile conflicts with existing extensions
- Profile references non-existent extension
- Profile has invalid agent names
- Profile YAML parse error

---

### Phase 2 Features

#### 4. Backup/Restore Functionality

**Goal**: Enable Alex (Solo Dev), Chen (AI Researcher), and Jordan (DevRel) to backup and restore AI setups.

**Design:**

**Backup format (JSON):**
```json
{
  "version": "1.0.0",
  "backedUpAt": "2026-01-23T10:30:00Z",
  "agents": {
    "claude-code": {
      "extensions": [/* ... */]
    }
  },
  "manifest": { /* v2.0 manifest */ }
}
```

**Implementation plan:**

1. Create backup module
2. Add `backup` command
3. Create restore module
4. Add `restore` command
5. Implement validation before restore

**File changes:**
- `src/core/backup.ts` - NEW FILE
- `src/core/restore.ts` - NEW FILE
- `src/cli/index.ts` - Add backup and restore commands
- `src/core/types.ts` - Add backup/restore types

**Testing:**
- Test `agent-manager backup`
- Test `agent-manager restore ai-setup.json`
- Test restore with corrupted backup
- Test restore on fresh machine

**Edge cases:**
- Backup file corrupted
- Backup from different OS
- Extension source no longer exists
- Agent not installed on restore machine

---

#### 5. MCP Dev Mode

**Goal**: Enable Chen (AI Researcher) to develop MCP servers with hot-reload.

**Design:**

**Command interface:**
```bash
agent-manager mcp dev <path> [options]
```

**Options:**
- `--watch` - Watch for file changes (default: true)
- `--agents` - Target specific agents
- `--transport` - Override transport for testing
- `--command` - Command to run MCP server
- `--logs` - Show MCP server logs

**Implementation plan:**

1. Create MCP dev mode module
2. Use `chokidar` for file watching
3. Add `mcp dev` subcommand
4. Implement hot-reload on file changes
5. Monitor for exit signal

**File changes:**
- `src/core/mcp-dev.ts` - NEW FILE
- `src/cli/index.ts` - Add mcp dev subcommand
- `package.json` - Add `chokidar` dependency
- `src/core/types.ts` - Add MCP dev types

**Testing:**
- Test `agent-manager mcp dev ./my-mcp`
- Test file change triggers hot-reload
- Test `--watch=false` mode
- Test Ctrl+C stops gracefully

**Edge cases:**
- MCP server not found
- MCP server crashes
- File watcher fails
- Multiple file changes in rapid succession

---

#### 6. Team Configs (IaC)

**Goal:** Enable Sarah (Enterprise) and Marcus (Platform Engineer) to manage team configurations.

**Design:**

**Team config format (YAML):**
```yaml
# .team-config/ai-stack.yaml
extensions:
  - name: filesystem
    source: github.com/modelcontextprotocol/servers
    type: mcp
    version: v1.0.0
    agents: [claude-code, cursor]

policies:
  versionPin: true
  requireApproval: false
  allowedSources: [github.com, gitlab.company.com/internal]

overrides:
  agents:
    claude-code:
      configPath: custom/path/to/settings.json
```

**Implementation plan:**

1. Create team config module
2. Add `apply` command
3. Implement merge logic
4. Implement validation
5. Implement policy enforcement

**File changes:**
- `src/core/team-config.ts` - NEW FILE
- `src/cli/index.ts` - Add apply command
- `src/core/types.ts` - Add team config types

**Testing:**
- Test `agent-manager apply .team-config/ai-stack.yaml`
- Test `--dry-run` mode
- Test `--force` mode
- Test validation with invalid source

**Edge cases:**
- Team config file not found
- Invalid YAML
- Extension source inaccessible
- Policy conflicts
- Agent not installed

---

## Part 3: Implementation Schedule

### Phase 1 (Weeks 1-2) - 10 Days Total

| Feature | Days | Owner |
|---------|------|--------|
| Enhanced list | 2 |
| Dry-run everywhere | 3 |
| Basic profiles | 5 |
| Subtotal | 10 |
| Buffer/testing | 3 |
| **Total** | **13 days** |

### Phase 2 (Weeks 3-6) - 27 Days Total

| Feature | Days | Owner |
|---------|------|--------|
| Backup/restore | 7 |
| MCP dev mode | 10 |
| Team configs | 10 |
| Subtotal | 27 |
| Buffer/testing | 5 |
| **Total** | **32 days** |

---

## Part 4: Technical Considerations

### Dependencies

| Feature | New Dependencies |
|---------|-----------------|
| Enhanced list | None |
| Dry-run everywhere | None |
| Basic profiles | `js-yaml` (existing) |
| Backup/restore | `zod` (optional) |
| MCP dev mode | `chokidar` |
| Team configs | `js-yaml` (existing) |

### File Operations

| Operation | Safety Measure |
|----------|---------------|
| Write config files | Write to temp file first, then atomic rename |
| Remove extensions | Validate exists before removing |
| Backup before restore | Create backup of current state |
| Profile apply | Show diff before applying |

### Cross-Platform

| Platform | Consideration |
|----------|---------------|
| Windows | Path separators, UNC paths, home directory location |
| macOS | Keychain access, sandbox restrictions |
| Linux | Permissions, SELinux/AppArmor |

---

## Part 5: Testing Strategy

### Unit Tests

| Feature | Test Files | Coverage Target |
|---------|-----------|----------------|
| Enhanced list | `list.test.ts` | 90% |
| Dry-run | `dry-run.test.ts` | 85% |
| Profiles | `profiles.test.ts` | 85% |
| Backup/restore | `backup-restore.test.ts` | 80% |
| MCP dev mode | `mcp-dev.test.ts` | 75% |
| Team configs | `team-config.test.ts` | 80% |

### E2E Scenarios

| Scenario | Test Case |
|----------|-----------|
| Solo dev workflow | Alex: New laptop → restore → verify |
| Enterprise workflow | Sarah: Team config → validate → apply |
| Researcher workflow | Chen: Dev mode → make change → verify |
| Platform workflow | Marcus: Team config → CI validation → apply |

---

## Appendix: Implementation Checklist

### Phase 1 Checklist

- [ ] Enhanced list command filters implemented
  - [ ] `--agent` filter
  - [ ] `--type` filter
  - [ ] `--status` filter
  - [ ] Error messages for invalid values
- [ ] Dry-run added to all commands
  - [ ] `remove` command
  - [ ] `upgrade` command
  - [ ] `mcp add` subcommand
  - [ ] `command add` subcommand
- [ ] Basic profiles system
  - [ ] Profile type definitions
  - [ ] `profile list` command
  - [ ] `profile create` command
  - [ ] `profile use` command
  - [ ] Profile YAML format
  - [ ] Profile directory structure
- [ ] Testing
  - [ ] Unit tests for list filters
  - [ ] Unit tests for dry-run
  - [ ] Unit tests for profiles
  - [ ] Integration tests
  - [ ] E2E test for Alex
  - [ ] E2E test for Jordan
- [ ] Documentation
  - [ ] Update README with examples
  - [ ] Add profile system docs
  - [ ] Update CLI help text

### Phase 2 Checklist

- [ ] Backup/restore functionality
  - [ ] Backup type definitions
  - [ ] `backup` command
  - [ ] `restore` command
  - [ ] Backup JSON format spec
  - [ ] Validation logic
  - [ ] Version compatibility check
- [ ] MCP dev mode
  - [ ] MCP dev type definitions
  - [ ] `mcp dev` subcommand
  - [ ] File watching with chokidar
  - [ ] Hot-reload logic
  - [ ] Log aggregation
- [ ] Team configs
  - [ ] Team config type definitions
  - [ ] `apply` command
  - [ ] Team config YAML format spec
  - [ ] Merge logic
  - [ ] Override application
  - [ ] Policy validation
- [ ] Testing
  - [ ] Unit tests for backup/restore
  - [ ] Unit tests for MCP dev mode
  - [ ] Unit tests for team configs
  - [ ] Integration tests for backup roundtrip
  - [ ] E2E test for Chen
  - [ ] E2E test for Sarah
  - [ ] E2E test for Marcus
- [ ] Documentation
  - [ ] Backup/restore guide
  - [ ] MCP dev mode guide
  - [ ] Team config format spec
  - [ ] Migration guide for teams

---

## Next Steps

**Status**: Implementation preparation complete for Phases 1 & 2.

**Ready for:**
- Work plan generation
- Task execution

**To proceed with implementation:**
```bash
/start-work
```

This will load the prepared phases and begin execution.
