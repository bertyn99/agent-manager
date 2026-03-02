# src/cli

**Purpose**: CLI command definitions and handlers using citty framework.

## STRUCTURE

```
src/cli/
├── index.ts    # Main CLI entry point (1330 lines, all commands)
└── migrate.ts  # Legacy migration from skill-manager
```

## WHERE TO LOOK

| File       | Purpose                     | Notes                                                 |
| ---------- | --------------------------- | ----------------------------------------------------- |
| index.ts   | All CLI command definitions | Uses citty defineCommand(), delegates to core modules |
| migrate.ts | Legacy migration            | Imports from skill-manager config                     |

## KEY PATTERNS

- **Command Structure**: Each command = defineCommand({ meta, args, run({ args }) })
- **Delegation**: Commands delegate to core modules (skill-installer, skill-sync, config, manifest)
- **Subcommands**: mcp and command commands use subcommand argument for list/add/remove
- **Options Pattern**: --dry-run, --to, --from, --force patterns repeat across commands
- **Error Handling**: process.exit(1) on failure, logger.success/error for output

## COMMANDS

| Command  | Core Module     | Function                      |
| -------- | --------------- | ----------------------------- |
| detect   | registry        | Detect installed agents       |
| list     | registry        | List all extensions           |
| add      | skill-installer | Add extension from repo       |
| remove   | skill-remover   | Remove extension              |
| sync     | skill-sync      | Sync across agents            |
| clean    | skill-sync      | Clear agent extensions        |
| upgrade  | skill-sync      | Upgrade extension             |
| doctor   | (local)         | Health checks                 |
| migrate  | (local)         | Legacy migration              |
| manifest | manifest        | Show/manage manifest          |
| mcp      | (local)         | MCP server management         |
| command  | command-manager | Gemini CLI command management |
