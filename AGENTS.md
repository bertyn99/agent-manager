# PROJECT KNOWLEDGE BASE

**Generated:** Sun Feb 01 2026 10:02:20 AM
**Commit:** aa57053
**Branch:** main

## OVERVIEW
Universal CLI tool managing extensions (MCP servers, skills, commands) across multiple AI coding assistants (Claude Code, Cursor, Gemini CLI, OpenCode). Built with TypeScript, uses UnJS ecosystem (citty, consola, pathe, tsdown).

## STRUCTURE

```
agent-manager/
├── src/
│   ├── cli/       # Command definitions & handlers (2 files, 1330 lines in index.ts)
│   ├── core/      # Business logic, manifest, config (24 files, complex)
│   ├── adapters/  # Agent-specific implementations (5 files)
│   └── utils/     # Shared utilities (git, logger, paths) (3 files)
├── test/           # Test fixtures & environment setup
├── dist/          # Build output (ESM + CJS)
└── scripts/        # Setup scripts
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI entry point | src/cli/index.ts | 1330 lines, all command definitions |
| Core business logic | src/core/ | installation, sync, manifest, config |
| Agent adapters | src/adapters/ | ClaudeAdapter, CursorAdapter, GeminiAdapter, OpenCodeAdapter |
| Type definitions | src/core/types.ts | AgentType, ExtensionType, interfaces |
| Manifest tracking | src/core/manifest.ts | 1175 lines, skill installation state |
| Git operations | src/utils/git.ts | cloneRepo, getCurrentCommit, getLatestTag, parseRepoUrl |
| Config validation | src/core/validators.ts | Zod schemas for config, skills, Gemini commands |
| Transport validation | src/core/transport-validator.ts | MCP server transport types (stdio, http, sse, websocket) |
| Path utilities | src/utils/paths.ts | POSIX-style paths for cross-platform consistency |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| AgentType | type | types.ts | 13 imports | Union type for all supported agents |
| Extension | interface | types.ts | 40+ imports | Base interface for MCP servers, skills, commands |
| AgentManagerConfig | interface | config.ts | 5 imports | Configuration structure for CLI |
| AgentAdapter | interface | types.ts | 5 adapters | Base interface all agents must implement |
| createAgentRegistry | function | adapters/index.ts | 4 imports | Registry factory managing all adapters |
| loadConfigSync | function | config.ts | 7 imports | Synchronous config loading with defaults |
| readManifest | function | manifest.ts | 8 imports | Read agent-manager manifest from YAML |
| cloneRepo | function | git.ts | 3 imports | Git repository cloning with branch/depth options |
| parseRepoUrl | function | git.ts | 1 import | Parse git URL into org/repo/branch/path |
| defineCommand | function | citty | 1 import | CLI command definition factory |
| logger | object | utils/logger.ts | 229 uses | Consola logging instance |

## CONVENTIONS

- Use `.ts` extensions in all import paths (ESM convention)
- Prefer named exports over default exports
- Use Record<string, T> instead of plain objects for maps
- Use `unknown` instead of `any`; handle type narrowing
- Use async/await over Promise chains; use Promise.all() for parallel operations
- Use Zod schemas for configuration and validation
- POSIX-style paths (forward slashes) for cross-platform consistency
- PascalCase for classes/interfaces, kebab-case for utilities
- Test files alongside source with `.test.ts` suffix

## ANTI-PATTERNS (THIS PROJECT)

- **Unvalidated config**: Always validate with Zod schemas before using config objects
- **Empty catch blocks**: All catch blocks must handle errors (never silent failures)
- **Type assertions without guards**: Avoid `as any` - use proper type narrowing
- **Synchronous git operations**: Git operations should be async (simple-git is async-first)
- **Direct filesystem operations**: Use fs-extra or pathe utilities, not native fs
- **Missing error context**: All thrown errors must include context (what operation failed)

## UNIQUE STYLES

- **Adapter pattern**: Each AI agent has a dedicated adapter implementing AgentAdapter interface
- **Registry pattern**: createAgentRegistry() manages all adapters, provides unified detection/listing
- **Result objects**: All operations return structured { success, error, ... } objects
- **Manifest-based tracking**: agent-manager tracks installations in manifest.yaml separate from agent configs
- **Progress spinners**: withSpinner() utility wraps long-running operations with start/success/error

## COMMANDS

```bash
# Development
pnpm install
pnpm dev          # Watch mode

# Build
pnpm build         # tsdown bundler (ESM + CJS)

# Testing
pnpm test          # Run all tests
pnpm test src/core/core.test.ts  # Single test file
pnpm test -- --testNamePattern="detect"  # Pattern match
pnpm test -- --run   # Without watch mode

# Linting
pnpm lint          # oxlint
pnpm format        # oxfmt --write src/
```

## NOTES

- CLI has 13 cross-module imports (high centrality): imports from core, adapters, utils
- src/cli/index.ts is the largest file (1330 lines) - all command definitions in one place
- src/core/manifest.ts (1175 lines) - handles YAML manifest persistence
- Git operations use simple-git with maxConcurrentProcesses: 6 for parallelism
- Configuration supports ~ expansion and AGENT_MANAGER_HOME environment variable override
- test-skill-repo/ contains skill examples for testing but not part of core build
