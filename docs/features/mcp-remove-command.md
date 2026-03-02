# Feature: MCP Remove Command with Interactive Prompts

## Overview

The `mcp remove` subcommand allows users to remove MCP (Model Context Protocol) servers from AI agents.

## User Flow

### Step 1: MCP Server Name
- **Condition**: If `--name` flag not provided
- **Prompt**: `Enter MCP server name to remove:` (text, required)
- **Result**: Name of MCP server to remove
- **Cancellation**: If Ctrl+C pressed, operation cancelled

### Step 2: Agent Selection
- **Condition**: If `--to` flag not provided
- **Prompt**: `Select agent(s) to remove from:` (multiselect)
- **Options**: Claude Code, Cursor, Gemini CLI, OpenCode
- **Result**: Target agents for removal
- **Default**: If no agents selected, removes from all agents

### Step 3: Dry-Run Preview
- **Condition**: If `--dryRun` flag not provided
- **Prompt**: `Preview changes before applying?` (confirm, default: true)
- **Result**: If true, shows what would be removed without making changes

## Code Flow

### Main Function: `runMCP()` - remove case

```typescript
case 'remove': {
  // Step 1: Get server name (prompt if --name not provided)
  let serverName = args.name ?? await prompt('Enter MCP server name to remove:');
  if (!serverName) return; // Cancelled
  
  // Step 2: Get target agents (prompt if --to not provided)
  let targetAgents = args.to ? parseAgents(args.to) : await prompt('Select agent(s) to remove from:');
  if (!targetAgents || targetAgents.length === 0) {
    logger.info('No agents selected, will remove from all agents.');
    targetAgents = undefined;
  }
  
  // Step 3: Check dry-run (prompt if --dryRun not provided)
  let dryRun = args.dryRun ?? await prompt('Preview changes before applying?');
  
  if (dryRun) {
    logger.info(`[DRY-RUN] Would remove "${serverName}" from: ${targetAgents?.join(', ') || 'all agents'}`);
    return;
  }
  
  // Execute removal
  const result = await registry.removeExtension(serverName, targetAgents);
  
  if (result.success) {
    logger.success(`MCP server "${serverName}" removed successfully`);
    logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
  }
}
```

## Relationship to remove Command

The MCP remove command uses the same underlying `removeExtension()` function as the regular `remove` command. The difference is:
- `remove` command works with skills/extensions
- `mcp remove` works specifically with MCP servers

Both commands:
- Use the agent registry to remove from agent configs
- Update the agent-manager manifest
- Support dry-run mode
- Support selective agent targeting

## Testing

### Test Cases
1. **Basic mcp remove**: `agm mcp remove` - Should prompt for name and agents
2. **With --name**: `agm mcp remove --name my-server` - Should prompt for agents only
3. **With --to**: `agm mcp remove --name my-server --to gemini-cli` - Should skip prompts
4. **Dry-run**: Should preview without removing
5. **Cancel**: Ctrl+C should cancel operation gracefully
