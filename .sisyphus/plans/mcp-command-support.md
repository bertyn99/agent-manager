# Plan: Enhanced MCP & Command Extension Support

> **Plan Version**: 1.2 (Incorporating Momus Re-Review + Codebase Analysis)
> **Created**: 2026-01-21
> **Reviewer**: Momus (Plan Reviewer)
> **Last Updated**: 2026-01-21

## Executive Summary
Extend agent-manager to provide first-class support for MCP (Model Context Protocol) servers and CLI Commands across all supported AI coding agents.

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `output` field | **Implement** | Controls output format (text/json/streaming) per Gemini CLI spec |
| TOML generators | **CommandManager class** | Single source of truth for all command operations |
| Gemini validation | **Warn only** | Don't block powerful features, just warn about security implications |
| Mock transports | **Message serialization** | Test message encoding/decoding, connection lifecycle |
| OpenCode MCP | **Full support** | Not a stub - implement real MCP support via opencode.jsonc |

---

## Momus Re-Review Summary

Momus re-reviewed with additional codebase context. Key points:

### ✅ Confirmed Approaches
- Pass-through config storage is acceptable for v1
- Extend OpenCodeAdapter rather than create new adapter
- 5-6 week timeline remains realistic

### ⚠️ Codebase Gaps Identified
1. Validators missing SSE/WebSocket transport types
2. No runtime validation in adapters (errors silently ignored)
3. `output` field defined but unused
4. Two inconsistent TOML generation functions
5. No adapter tests exist

### 📋 Timeline Adjustment
| Original | Revised | Reason |
|----------|---------|--------|
| 4 weeks | 5-6 weeks | Additional validation + testing work folded into existing phases |

---

## Phase 1: Core Infrastructure (Week 1)

### 1.1 Fix Validators (CRITICAL - 15 min)
```typescript
// Update src/core/validators.ts
mcp: z.object({
  enabled: z.boolean(),
  type: z.enum(['http', 'command', 'sse', 'websocket']),  // ADDED: sse, websocket
  url: z.string().url().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
}).optional(),
```

### 1.2 CommandManager Class (NEW - 2 hours)
```typescript
// src/core/command-manager.ts

interface GeminiCommandOutput {
  type: 'text' | 'json' | 'streaming';
}

interface CommandConfig {
  name: string;
  description?: string;
  prompt: string;
  args?: string[];
  totalBudget?: number;
  output?: GeminiCommandOutput;  // IMPLEMENTED per decision
}

class CommandManager {
  // Parse Gemini TOML commands
  parseCommand(toml: string): { data: CommandConfig; warnings: string[] };
  
  // Generate TOML from CommandConfig
  toToml(config: CommandConfig): string;
  
  // Validate command config
  validate(config: CommandConfig): ValidationResult;
  
  // Check for special features and warn
  detectSpecialFeatures(prompt: string): string[];
  
  // Install/remove commands for each agent
  async addCommand(config: CommandConfig, agent: AgentType): Promise<void>;
  async removeCommand(name: string, agent: AgentType): Promise<void>;
}
```

### 1.3 TransportValidator (NEW - 1 hour)
```typescript
// src/core/transport-validator.ts

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

class TransportValidator {
  validateHttp(config: MCPServerConfig): ValidationResult;
  validateCommand(config: MCPServerConfig): ValidationResult;
  validateTransportType(type: string): ValidationResult;
  validateSSE(config: MCPServerConfig): ValidationResult;
  validateWebSocket(config: MCPServerConfig): ValidationResult;
}
```

### 1.4 Enhanced Extension Types
```typescript
// UPDATED: Add output field to CommandConfig
interface CommandConfig {
  name: string;
  description?: string;
  prompt: string;
  args?: string[];
  totalBudget?: number;
  output?: 'text' | 'json' | 'streaming';  // IMPLEMENTED
}
```

---

## Phase 2: Adapter Enhancements (Week 2)

### 2.1 Update All Adapters
| Adapter | Changes |
|---------|---------|
| Claude | Add TransportValidator call before write |
| Cursor | Add TransportValidator call before write |
| Gemini | Replace with CommandManager, add runtime validation |
| OpenCode | **ADD FULL MCP SUPPORT** via opencode.jsonc |

### 2.2 OpenCode MCP Implementation (NEW - Major Task)

OpenCode uses `~/.config/opencode/opencode.jsonc` for configuration. MCP servers go in the `mcp` section:

```typescript
// src/adapters/OpenCodeMCPMixin.ts

interface OpenCodeMCPConfig {
  mcpServers: {
    [name: string]: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      disabled?: boolean;
    };
  };
}

class OpenCodeMCPMixin {
  async listMCPServers(): Promise<Extension[]> {
    const config = await this.readOpenCodeConfig();
    const servers: Extension[] = [];
    
    for (const [name, server] of Object.entries(config.mcpServers || {})) {
      servers.push({
        name,
        type: 'mcp',
        agent: 'opencode',
        description: `MCP server: ${name}`,
        config: server,
        enabled: !server.disabled,
      });
    }
    
    return servers;
  }

  async addMCPServer(name: string, config: MCPServerConfig): Promise<void> {
    const opencodeConfig = await this.readOpenCodeConfig();
    opencodeConfig.mcpServers = opencodeConfig.mcpServers || {};
    
    opencodeConfig.mcpServers[name] = {
      command: config.transport.command || '',
      args: config.transport.args,
      env: config.transport.env,
      disabled: !config.enabled,
    };
    
    await this.writeOpenCodeConfig(opencodeConfig);
  }

  async removeMCPServer(name: string): Promise<void> {
    const opencodeConfig = await this.readOpenCodeConfig();
    delete opencodeConfig.mcpServers?.[name];
    await this.writeOpenCodeConfig(opencodeConfig);
  }
}
```

### 2.3 Update GeminiAdapter
- Replace inline TOML handling with CommandManager
- Add runtime validation with warnings for special features
- Use `output` field when generating TOML

---

## Phase 3: CLI Enhancements (Week 3)

### 3.1 New CLI Commands
```bash
# MCP management
agent-manager mcp add <name> \
  --transport stdio|http|sse|websocket \
  --command "<cmd>" \
  --args "a,b,c" \
  --url <url>

agent-manager mcp remove <name>
agent-manager mcp list
agent-manager mcp test <name>

# Command management (via CommandManager)
agent-manager command add <name> \
  --description "..." \
  --prompt "..." \
  --output text|json|streaming

agent-manager command remove <name>
agent-manager command list
agent-manager command run <name> [args]
```

### 3.2 Warning Output
```bash
$ agent-manager command add mycmd --prompt "Hello !{ls}"
⚠️  Warning: Shell command (!{}) detected in prompt
   Shell commands require user confirmation before execution
```

---

## Phase 4: Testing & Quality (Week 4-5)

### 4.1 Mock Transports (NEW)
```typescript
// test/mocks/transports.ts

class MockTransport {
  messages: Message[] = [];
  connected: boolean = false;
  
  connect(): Promise<void>;
  send(msg: Message): Promise<void>;
  receive(): Promise<Message>;
  close(): Promise<void>;
}

// Test message serialization
describe('MCP Message Serialization', () => {
  it('should serialize JSON-RPC request', () => {
    const request = createRequest('tools/list', { });
    const serialized = JSON.stringify(request);
    const parsed = JSON.parse(serialized);
    expect(parsed.jsonrpc).toBe('2.0');
  });
  
  it('should serialize notification', () => {
    const notification = createNotification('notifications/initialized');
    expect(notification.id).toBeUndefined();
  });
});
```

### 4.2 Test Coverage Goals
| Category | Target | Notes |
|----------|--------|-------|
| Unit tests | 80%+ | CommandManager, TransportValidator |
| Integration tests | 100% | All transport types |
| Adapter tests | Critical paths | list/add/remove for each adapter |
| E2E tests | Full workflows | add→list→remove |

---

## Implementation Order (Priority)

| Priority | Task | Effort | Dependency |
|----------|------|--------|------------|
| P0 | Fix validators.ts (add SSE/WS) | 15 min | - |
| P0 | CommandManager class | 2 hours | - |
| P0 | TransportValidator | 1 hour | - |
| P0 | OpenCode MCP support | 4 hours | TransportValidator |
| P1 | Update GeminiAdapter | 2 hours | CommandManager |
| P1 | Update Claude/Cursor adapters | 1 hour | TransportValidator |
| P1 | CLI mcp commands | 2 hours | Adapters updated |
| P1 | CLI command commands | 1 hour | CommandManager |
| P2 | Mock transports | 2 hours | - |
| P2 | Adapter tests | 4 hours | Mock transports |
| P3 | Documentation | 2 hours | All above |

---

## File Changes Summary

### New Files
```
src/core/command-manager.ts          # CommandManager class
src/core/transport-validator.ts      # TransportValidator class
src/adapters/OpenCodeMCPMixin.ts     # OpenCode MCP support
test/mocks/transports.ts             # Mock transport classes
test/unit/command-manager.test.ts
test/unit/transport-validator.test.ts
test/integration/adapters.test.ts
```

### Files to Modify
```
src/core/validators.ts               # Add SSE/WS, implement output
src/core/types.ts                    # Add output field to CommandConfig
src/adapters/GeminiAdapter.ts        # Use CommandManager
src/adapters/ClaudeAdapter.ts        # Add TransportValidator
src/adapters/CursorAdapter.ts        # Add TransportValidator
src/adapters/OpenCodeAdapter.ts      # Add MCP support (compose Mixin)
src/cli/index.ts                     # Add new commands
```

---

## Rollout Plan

### v2.1.0 (After Week 2)
- Core infrastructure (CommandManager, TransportValidator)
- Updated adapters with validation
- OpenCode MCP support

### v2.2.0 (After Week 3)
- CLI commands for MCP and commands
- Warning system for special features

### v2.3.0 (After Week 5)
- Full testing coverage
- Mock transport infrastructure
- Documentation complete

---

## Success Metrics

- ✅ Validators support all 4 transport types (stdio, http, sse, websocket)
- ✅ CommandManager handles all Gemini command operations
- ✅ OpenCode has full MCP support
- ✅ CLI commands for add/remove/list/test MCP
- ✅ CLI commands for add/remove/list/run commands
- ✅ Warnings for `!{}` and `@{}` in prompts
- ✅ 80%+ test coverage for new code
- ✅ Message serialization tests pass
