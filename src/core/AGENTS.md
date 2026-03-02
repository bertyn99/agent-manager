# src/core

**Purpose**: Core business logic - installation, sync, manifest, config, validation (24 files, complex workflows).

## STRUCTURE

```
src/core/
├── manifest.ts          # Manifest tracking (1175 lines, YAML persistence)
├── skill-installer.ts   # Installation workflow (821 lines)
├── skill-sync.ts        # Sync and upgrade logic (370 lines)
├── types.ts            # Core type definitions (389 lines)
├── transport-validator.ts # MCP transport validation (281 lines)
├── plugin-detector.ts  # Plugin/skill detection (254 lines)
├── validators.ts       # Zod schemas (202 lines)
├── command-manager.ts   # Gemini CLI commands (250 lines)
├── config.ts           # Configuration loading (174 lines)
├── scheduler.ts        # Task scheduling (233 lines)
├── encryption.ts       # Encryption utilities (247 lines)
├── skill-remover.ts    # Removal logic (129 lines)
├── restore.ts          # Restore from backup (167 lines)
└── backup.ts           # Backup operations (308 lines)
```

## WHERE TO LOOK

| File                   | Purpose                   | Key Functions                                                             |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------- |
| manifest.ts            | Track skill installations | readManifest, writeManifest, addSkillToManifest, isSkillInstalledForAgent |
| skill-installer.ts     | Install extensions        | installExtension, parseExtensionMd, detectExtensionFormat, installToAgent |
| skill-sync.ts          | Sync and upgrade          | syncExtensions, upgradeExtension, upgradeAllExtensions                    |
| types.ts               | Type definitions          | AgentType, ExtensionType, Extension, AgentManagerConfig                   |
| transport-validator.ts | MCP validation            | validateTransport, transport types (stdio, http, sse, websocket)          |
| validators.ts          | Zod schemas               | AgentSkillsFrontmatterSchema, UnifiedSkillSchema, GeminiCommandSchema     |
| command-manager.ts     | Gemini commands           | addCommand, removeCommand, generateToml                                   |

## CORE WORKFLOWS

### Add Extension

1. parseRepoUrl() → 2. cloneRepo() → 3. detectExtensionFormat() → 4. installToAgent() → 5. addSourceToManifest()

### Sync Extension

1. readManifest() → 2. filterSkillsByRules() → 3. syncExtensions() (clone or copy)

### Upgrade Extension

1. getCurrentCommit()/getLatestTag() → 2. compare versions → 3. pullRepo() → 4. updateManifest()

### Remove Extension

1. removeExtension() → 2. removeSkillFromManifest()

## PATTERNS

- **Result Objects**: All operations return { success, error, extension, installedTo, ... }
- **Manifest Persistence**: YAML-based, updated after every operation
- **Dry-Run Mode**: withDryRun() wrapper in core/dry-run.ts
- **Zod Validation**: All config/skills/commands validated before use
- **Error Context**: Errors include operation that failed
- **Type Safety**: Use Record<string, unknown> and unknown instead of any
