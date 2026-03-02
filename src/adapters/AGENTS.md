# src/adapters

**Purpose**: Agent-specific implementations - all implement AgentAdapter interface (5 files).

## STRUCTURE

```
src/adapters/
├── index.ts          # Registry factory (createAgentRegistry, manages Map<AgentType, AgentAdapter>)
├── ClaudeAdapter.ts  # Claude Code (187 lines)
├── CursorAdapter.ts  # Cursor (186 lines)
├── GeminiAdapter.ts  # Gemini CLI (190 lines)
└── OpenCodeAdapter.ts # OpenCode (468 lines, most complex)
```

## WHERE TO LOOK

| Adapter         | Config Location                | Skills Location           | Notes                                              |
| --------------- | ------------------------------ | ------------------------- | -------------------------------------------------- |
| ClaudeAdapter   | ~/.claude/settings.json        | ~/.claude/skills/         | MCP servers in mcpServers object                   |
| CursorAdapter   | ~/.cursor/mcp.json             | ~/.cursor/skills/         | MCP structure similar to Claude                    |
| GeminiAdapter   | ~/.gemini/settings.json        | ~/.gemini/commands/       | MCP + .toml command files, antigravity/ for agents |
| OpenCodeAdapter | ~/.config/opencode/skills.yaml | ~/.config/opencode/skill/ | SKILL.md files, skills.yaml manifest               |

## ADAPTER INTERFACE

All adapters must implement:

- `detect(): boolean` - Check if agent is installed
- `listExtensions(): Promise<Extension[]>` - List all MCP/skills/commands
- `addExtension(extension: Extension): Promise<void>` - Add to agent config
- `removeExtension(name: string): Promise<void>` - Remove from agent config

## PATTERNS

- **Detection**: Check config file existence with existsSync()
- **List Extensions**: Read config, map to Extension[] with { name, type, agent, config }
- **Modify Config**: Read JSON, modify, write back atomically
- **Registry Pattern**: createAgentRegistry() in index.ts manages all adapters via Map
- **Extension Types**: 'mcp' (servers), 'skill' (OpenCode), 'command' (Gemini)
- **Error Handling**: Wrap config operations in try/catch with context

## AGENT-SPECIFIC QUIRKS

- **Gemini CLI**: Supports MCP + commands + antigravity agents. Commands stored as .toml files.
- **OpenCode**: Reads skills.yaml manifest + SKILL.md files in skill/ directory. Most complex adapter.
