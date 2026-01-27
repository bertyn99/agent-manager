# AGENTS.md - Agent Manager Development Guide

This file provides guidelines for AI coding agents working on the agent-manager project.

## Project Overview

**agent-manager** is a universal CLI tool that manages extensions (MCP servers, skills, commands) across multiple AI coding assistants including Claude Code, Cursor, Gemini CLI, and OpenCode. Built with TypeScript, it uses the UnJS ecosystem (citty, consola, pathe, etc.).

## Build, Lint, and Test Commands

### Core Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Build the project (tsdown bundler)
pnpm build

# Development mode with watch
pnpm dev

# Run all tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run a single test file
pnpm test src/core/core.test.ts

# Run a specific test
pnpm test -- --testNamePattern="detect agents"

# Lint the codebase
pnpm lint

# Format code
pnpm format
```

### Running Specific Tests

Vitest supports various filtering options:

```bash
# Run tests matching a pattern
pnpm test -- --testNamePattern="adapter"

# Run tests in a specific directory
pnpm test test/unit/

# Run tests with verbose output
pnpm test -- --reporter=verbose

# Run tests without watch mode
pnpm test -- --run
```

## Code Style Guidelines

### Imports and Module Syntax

- Use ES modules with `.ts` extension in import paths for clarity and consistency with source files

```typescript
// ✅ Correct
import { existsSync } from 'fs-extra';
import { join } from 'pathe';
import { logger } from '../utils/logger.ts';
import type { AgentType } from '../core/types.ts';

// ❌ Incorrect
import { existsSync } from 'fs-extra';
import { join } from 'pathe';
import { logger } from '../utils/logger';
import type { AgentType } from '../core/types';
```

- Organize imports in this order: external dependencies, internal modules, types
- Use named exports for most exports; default exports only for main classes

### File Naming Conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| `PascalCase.ts` | `ClaudeAdapter.ts` | Classes, adapters, interfaces |
| `kebab-case.ts` | `skill-installer.ts` | Utility functions, business logic |
| `*.test.ts` | `core.test.ts` | Test files (same name as source) |

### Directory Structure

```
src/
├── cli/           # Command definitions and handlers
├── core/          # Business logic (installation, sync, config)
├── adapters/      # Agent-specific implementations
├── utils/         # Shared utilities (logger, git, paths)
└── index.ts       # Main entry point
```

### TypeScript Conventions

- Enable strict mode (configured in tsconfig.json)
- Use explicit types for function parameters and return types
- Prefer interfaces for object shapes, types for unions/primitives
- Use `Record<string, T>` instead of plain objects for maps
- Use `unknown` instead of `any`; handle type narrowing

```typescript
// ✅ Correct
interface Extension {
  name: string;
  type: ExtensionType;
  agent: AgentType;
  description?: string;
  config?: Record<string, unknown>;
}

function addExtension(repo: string, config: Config): Promise<Result> {
  // implementation
}

// ❌ Incorrect
interface Extension {
  name: string;
  type: string;
  agent: string;
  description?: string;
  config?: any;
}

function addExtension(repo, config) {
  // implementation
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `configPath`, `installedExtensions` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_CONFIG_PATH` |
| Functions | camelCase | `detectAgents()`, `loadConfigSync()` |
| Classes | PascalCase | `ClaudeAdapter`, `AgentRegistry` |
| Interfaces | PascalCase | `AgentConfig`, `Extension` |
| Types | PascalCase | `AgentType`, `ExtensionType` |
| Files | kebab-case (utilities), PascalCase (classes) | `skill-installer.ts`, `ClaudeAdapter.ts` |

### Error Handling

- Use try/catch with proper error messages
- Propagate errors with context using `Error()` objects
- Use `logger.error()` for user-facing errors
- Validate inputs using Zod schemas (see `src/core/validators.ts`)

```typescript
// ✅ Correct
try {
  const config = readJSONSync(configPath);
  return parseConfig(config);
} catch (error) {
  throw new Error(`Failed to load config: ${String(error)}`);
}

// Validation with Zod
import { z } from 'zod';
const ConfigSchema = z.object({
  home: z.string(),
  agents: z.record(z.object({ enabled: z.boolean() })),
});
```

### Async/Await Patterns

- Prefer async/await over Promise chains
- Use `await` at top level or handle errors properly
- Use `Promise.all()` for parallel operations

```typescript
// ✅ Correct
async function listExtensions(): Promise<Extension[]> {
  const extensions: Extension[] = [];
  for (const adapter of adapters.values()) {
    if (adapter.detect()) {
      extensions.push(...(await adapter.listExtensions()));
    }
  }
  return extensions;
}

// Parallel execution
const results = await Promise.all([
  adapter1.listExtensions(),
  adapter2.listExtensions(),
]);
```

### Configuration

- Use Zod schemas for configuration validation (see `src/core/config.ts`)
- Support environment variable overrides
- Provide sensible defaults

```typescript
import { z } from 'zod';

export const AgentManagerConfigSchema = z.object({
  home: z.string().default('~/.config/agent-manager'),
  manifestPath: z.string().default('~/.config/agent-manager/skills.yaml'),
  skillsPath: z.string().default('~/.config/agent-manager/skill'),
  vendorPath: z.string().default('~/.config/agent-manager/vendor'),
  agents: z.record(z.object({
    enabled: z.boolean().default(true),
    configPath: z.string(),
    skillsPath: z.string().optional(),
  })).default({}),
});

export function loadConfigSync(configPath?: string): AgentManagerConfig {
  const path = configPath || getDefaultConfig().manifestPath;
  
  if (!existsSync(path)) {
    return getDefaultConfig();
  }
  
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    return AgentManagerConfigSchema.parse(parsed);
  } catch {
    return getDefaultConfig();
  }
}
```

### Progress Spinners

Use the `withSpinner` utility for operations that may take time:

```typescript
import { withSpinner } from '../utils/logger.ts';

const result = await withSpinner('Installing extension', async () => {
  // Long-running operation
  return await installExtension(repo, config);
});
```

### CLI Development

- Use `citty` for command definition (see `src/cli/index.ts`)
- Define commands with `defineCommand()` meta and args
- Use positional arguments for required inputs, named flags for options

```typescript
import { defineCommand, runMain } from 'citty';

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add an extension from a repository',
  },
  args: {
    repo: {
      type: 'positional',
      description: 'Repository URL or path',
      required: true,
    },
    to: {
      type: 'string',
      description: 'Add to specific agents',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview changes without applying',
      alias: 'd',
    },
  },
  run({ args }) {
    // Implementation
  },
});

runMain(mainCommand);
```

### Transport Validation

When adding MCP servers, validate transport types:

```typescript
import { validateTransport } from '../core/transport-validator.ts';

const transportTypes = ['stdio', 'http', 'sse', 'websocket'] as const;

function validateMCPTransport(
  type: string,
  options: { command?: string; url?: string }
): { valid: boolean; error?: string } {
  if (!transportTypes.includes(type as any)) {
    return { valid: false, error: `Invalid transport type: ${type}` };
  }
  if (type === 'stdio' && !options.command) {
    return { valid: false, error: 'command is required for stdio transport' };
  }
  if ((type === 'http' || type === 'sse' || type === 'websocket') && !options.url) {
    return { valid: false, error: 'url is required for HTTP/SSE/WebSocket transports' };
  }
  return { valid: true };
}
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `citty` | CLI framework with argument parsing |
| `consola` | Elegant console logging |
| `pathe` | Path utilities |
| `fs-extra` | Enhanced file system operations |
| `zod` | Schema validation |
| `js-yaml` | YAML parsing/writing |
| `execa` | Process execution |
| `simple-git` | Git operations |
| `c12` | Config loading |
| `destr` | Fast JSON parsing |
| `ufo` | URL and path utilities |
| `mlly` | Module utilities |

## Testing Guidelines

- Place test files alongside source files with `.test.ts` extension
- Use Vitest with globals enabled
- Follow AAA pattern: Arrange, Act, Assert
- Mock filesystem operations where appropriate
- Test both success and error paths

## Common Patterns

### Adapter Pattern

Each agent (Claude Code, Cursor, Gemini CLI, OpenCode) has an adapter in `src/adapters/`:

```typescript
// Base interface all adapters must implement
export interface AgentAdapter {
  detect(): boolean;
  listExtensions(): Promise<Extension[]>;
  addExtension(extension: Extension): Promise<void>;
  removeExtension(name: string): Promise<void>;
  getAgentInfo?(): DetectedAgent;
}

// Concrete adapter implementation
export class ClaudeAdapter implements AgentAdapter {
  constructor(private config: AgentManagerConfig) {}

  detect(): boolean {
    return existsSync(this.config.agents['claude-code'].configPath);
  }

  async listExtensions(): Promise<Extension[]> {
    const config = readJSONSync(this.configPath);
    const mcpServers = config.mcpServers || {};
    return Object.entries(mcpServers).map(([name, cfg]) => ({
      name,
      type: 'mcp' as const,
      agent: 'claude-code' as const,
      config: cfg as Record<string, unknown>,
    }));
  }
}
```

### Registry Pattern

Use `createAgentRegistry()` in `src/adapters/index.ts` to manage adapters:

```typescript
import { createAgentRegistry } from '../adapters/index.ts';

export function createAgentRegistry(config: Config): AgentRegistry {
  const adapters = new Map<AgentType, AgentAdapter>();
  // Initialize adapters...
  return { detect, listAllExtensions, getAdapter };
}
```

### Result Objects

Return structured results for operations:

```typescript
interface Result {
  success: boolean;
  extension: string;
  installedTo: string[];
  commit?: string;
  tag?: string;
  error?: string;
}
```
