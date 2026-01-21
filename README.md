# Agent Manager

Universal CLI tool to manage skills, agents, and commands across multiple AI coding assistants.

## Supported Agents

- **Claude Code** - MCP servers via `~/.claude/settings.json`
- **Cursor** - MCP servers via `~/.cursor/mcp.json`
- **Gemini CLI** - Commands, agents, and MCP via `~/.gemini/`
- **OpenCode** - Skills via `~/.config/opencode/skill/`

## Installation

```bash
# From source
cd agent-manager
npm install
npm run build

# Symlink to PATH
ln -s $(pwd)/dist/cli/index.js /usr/local/bin/agent-manager
```

## Quick Start

```bash
# Detect installed agents
agent-manager detect

# List all skills across agents
agent-manager list

# Add a skill from repository
agent-manager add https://github.com/vercel-labs/agent-browser/tree/main/skills/agent-browser

# Sync skills to all agents
agent-manager sync

# Upgrade a skill
agent-manager upgrade agent-browser
```

## Commands

### detect
Detect installed AI agents on the system.
```bash
agent-manager detect
```

### list
List all skills across all detected agents.
```bash
agent-manager list           # Summary
agent-manager list --json    # JSON output
agent-manager list --verbose # Detailed output
```

### add
Add a skill/agent/command from a repository.
```bash
agent-manager add <repo>                   # Add to all compatible agents
agent-manager add <repo> --to claude       # Add to specific agent
agent-manager add <repo> --skill-only     # Add only SKILL.md format
agent-manager add <repo> --mcp-only       # Add only MCP format
agent-manager add <repo> --gemini-only    # Add only Gemini command
```

### remove
Remove a skill from agents.
```bash
agent-manager remove <skill-name>          # Remove from all agents
agent-manager remove <skill-name> --from cursor  # Remove from specific agent
```

### sync
Synchronize skills across all agents.
```bash
agent-manager sync            # Apply changes
agent-manager sync --dry-run  # Preview changes
```

### upgrade
Upgrade a skill by gathering latest information.
```bash
agent-manager upgrade <skill-name>         # Upgrade using OpenCode agent
agent-manager upgrade <skill-name> --all   # Upgrade for all agents
```

### validate
Validate skill format against Agent Skills spec.
```bash
agent-manager validate           # Validate all skills
agent-manager validate <skill>   # Validate specific skill
```

### doctor
Run health checks on the manager.
```bash
agent-manager doctor
```

## Configuration

### Unified Manifest Format

Skills can be defined with a unified manifest that maps to multiple agent formats:

```yaml
# unified-skill.yaml
name: agent-browser
description: Headless browser automation for AI agents

formats:
  agent-skills:
    enabled: true
    path: agent-browser/SKILL.md
    
  mcp:
    enabled: true
    type: http
    url: https://github.com/vercel-labs/agent-browser/skills/agent-browser
    
  gemini-command:
    enabled: true
    name: browser-automation
```

### Environment Variables

- `AGENT_MANAGER_HOME`: Override config directory (default: `~/.config/agent-manager`)
- `AGENT_MANAGER_DRY_RUN`: Always run in dry-run mode
- `AGENT_MANAGER_VERBOSE`: Enable verbose output

## Migration from skill-manager

```bash
agent-manager migrate skill-manager
```

This imports your existing skills from `~/.config/opencode/skills.yaml`.

## Architecture

See [DESIGN.md](DESIGN.md) for detailed architecture documentation.

## License

MIT
