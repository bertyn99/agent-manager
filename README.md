# Agent Manager

Universal CLI tool to manage extensions (MCP servers, skills, commands) across multiple AI coding assistants.

## Supported Agents

| Agent | MCP Support | Commands | Skills |
|-------|-------------|----------|--------|
| **Claude Code** | ✅ via `~/.claude/settings.json` | ❌ | ❌ |
| **Cursor** | ✅ via `~/.cursor/mcp.json` | ❌ | ❌ |
| **Gemini CLI** | ✅ via `~/.gemini/settings.json` | ✅ via `~/.gemini/commands/` | ❌ |
| **OpenCode** | ✅ via `~/.config/opencode/opencode.jsonc` | ❌ | ✅ via `~/.config/opencode/skill/` |

## Installation

```bash
# From source
cd agent-manager
pnpm install
pnpm build

# Symlink to PATH
ln -s $(pwd)/dist/cli/index.js /usr/local/bin/agent-manager
```

## Quick Start

```bash
# Detect installed agents
agent-manager detect

# List all extensions across agents
agent-manager list

# Add an extension from repository
agent-manager add https://github.com/user/extension-repo

# Manage MCP servers directly
agent-manager mcp list
agent-manager mcp add my-server --transport stdio --command "npx -y @modelcontextprotocol/server-filesystem /tmp"

# Manage Gemini CLI commands
agent-manager command list
agent-manager command add my-command --prompt "You are helpful" --output text

# Sync extensions to all agents
agent-manager sync
```

## Commands

### detect
Detect installed AI agents on the system.
```bash
agent-manager detect
```

### list
List all extensions across all detected agents.
```bash
agent-manager list           # Summary
agent-manager list --json    # JSON output
agent-manager list --verbose # Detailed output
```

### add
Add an extension from a repository.
```bash
agent-manager add <repo>                   # Add to all compatible agents
agent-manager add <repo> --to claude-code  # Add to specific agent
agent-manager add <repo> --nested          # Repository has nested extensions
agent-manager add <repo> --include ext1,ext2  # Include specific extensions
agent-manager add <repo> --exclude ext3,ext4  # Exclude specific extensions
```

### remove
Remove an extension from agents.
```bash
agent-manager remove <extension-name>      # Remove from all agents
agent-manager remove <extension-name> --from cursor  # Remove from specific agent
```

### sync
Synchronize extensions across all agents.
```bash
agent-manager sync            # Apply changes
agent-manager sync --dry-run  # Preview changes
```

### upgrade
Upgrade an extension to the latest version.
```bash
agent-manager upgrade <extension-name>  # Upgrade specific extension
agent-manager upgrade <extension-name> --all  # Upgrade for all agents
agent-manager upgrade --all  # Upgrade all extensions
```

### mcp
Manage MCP servers directly (Gemini CLI, Claude Code, Cursor, OpenCode).
```bash
# List all MCP servers
agent-manager mcp list

# Add an MCP server
agent-manager mcp add <name> --transport stdio --command "npx -y server-name"
agent-manager mcp add <name> --transport http --url https://mcp.example.com
agent-manager mcp add <name> --transport sse --url https://mcp.example.com/sse
agent-manager mcp add <name> --transport websocket --url wss://mcp.example.com/ws

# Remove an MCP server
agent-manager mcp remove <name>
agent-manager mcp remove <name> --from gemini-cli  # Remove from specific agent
```

### command
Manage Gemini CLI commands.
```bash
# List all commands
agent-manager command list

# Add a command
agent-manager command add <name> --prompt "You are helpful"
agent-manager command add <name> --description "A useful command" --prompt "You are helpful"
agent-manager command add <name> --output json --args "--verbose,--debug"
agent-manager command add <name> --total-budget 0.5

# Remove a command
agent-manager command remove <name>
```

### doctor
Run health checks on the CLI and environment.
```bash
agent-manager doctor
```

### migrate
Migrate from skill-manager to agent-manager.
```bash
agent-manager migrate
```

### manifest
Show or manage the agent-manager manifest.
```bash
agent-manager manifest           # Show manifest
agent-manager manifest --json    # JSON output
agent-manager manifest --import ~/.config/opencode/skills.yaml  # Import from OpenCode
agent-manager manifest --clear   # Clear manifest (use with caution)
```

## MCP Transport Types

| Type | Description | Required Options |
|------|-------------|------------------|
| `stdio` | Standard I/O process | `--command` |
| `http` | HTTP endpoint | `--url` |
| `sse` | Server-Sent Events | `--url` or `--sse-endpoint` |
| `websocket` | WebSocket connection | `--url` or `--ws-endpoint` |

### Security Warnings

When adding MCP servers or commands, agent-manager will warn about:

- **Unencrypted connections**: Using `http://` instead of `https://`
- **Shell commands in prompts**: `!{command}` syntax that executes shell commands
- **File injection**: `@{/path/to/file}` syntax that reads files into context
- **Dangerous commands**: Commands containing `rm -rf` or similar operations
- **Elevated privileges**: Commands using `sudo` or admin operations

## Configuration

### Environment Variables

- `AGENT_MANAGER_HOME`: Override config directory (default: `~/.config/agent-manager`)
- `AGENT_MANAGER_DRY_RUN`: Always run in dry-run mode
- `AGENT_MANAGER_VERBOSE`: Enable verbose output

## Architecture

See [DESIGN.md](DESIGN.md) for detailed architecture documentation.

## License

MIT
