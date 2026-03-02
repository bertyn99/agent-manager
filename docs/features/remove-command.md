# Feature: Remove Command with Interactive Prompts

## Overview

The `remove` command allows users to uninstall extensions (skills, MCP servers) from AI agents.

## User Flow

### Step 1: Extension Name
- **Condition**: If extension name not provided as positional argument
- **Prompt**: `Enter extension name to remove:` (text, required)
- **Result**: Name of extension to remove
- **Cancellation**: If Ctrl+C pressed, operation cancelled

### Step 2: Agent Selection
- **Condition**: If `--from` flag not provided
- **Prompt**: `Select agent(s) to remove from:` (multiselect)
- **Options**: Claude Code, Cursor, Gemini CLI, OpenCode, VS Code Copilot, OpenAI Codex
- **Result**: Target agents for removal
- **Default**: If no agents selected, removes from all agents

### Step 3: Dry-Run Preview
- **Condition**: If `--dryRun` flag not provided
- **Prompt**: `Preview changes before applying?` (confirm, default: true)
- **Result**: If true, shows what would be removed without making changes

## Code Flow

### Main Function: `runRemove()`

```typescript
export async function runRemove(args: RemoveOptions) {
  // Step 1: Get extension name (prompt if missing)
  let extensionName = args.extension ?? await prompt('Enter extension name to remove:');
  if (!extensionName) return; // Cancelled
  
  // Step 2: Get target agents (prompt if --from not provided)
  let targetAgents = args.from ? parseAgents(args.from) : await prompt('Select agent(s) to remove from:');
  if (!targetAgents || targetAgents.length === 0) {
    logger.info('No agents selected, will remove from all agents.');
    targetAgents = undefined;
  }
  
  // Step 3: Check dry-run (prompt if --dryRun not provided)
  let dryRun = args.dryRun ?? await prompt('Preview changes before applying?');
  
  // Execute removal
  const result = await withDryRun('remove extension', dryRun, async () => {
    return await removeExtension(extensionName, config, { from: targetAgents });
  });
  
  if (!dryRun && result.success) {
    logger.success(`Successfully removed extension "${result.extension}"`);
    logger.info(`Removed from: ${result.removedFrom.join(', ')}`);
  }
}
```

### Core Function: `removeExtension()`

Located in `src/core/skill-remover.ts`

- Validates extension exists in manifest
- For each target agent:
  - Removes extension files from agent's config directory
  - Updates agent's configuration files
  - Removes from agent-manager manifest
- Returns result with success status and removedFrom list

## Error Handling

### Extension Not Found
If the extension doesn't exist in the manifest:
- Returns error: "Extension not found"
- Process exits with code 1

### No Agents Selected
If user selects no agents in the multiselect:
- Logs: "No agents selected, will remove from all agents."
- Proceeds with removal from all installed agents

### Cancellation
If user presses Ctrl+C during any prompt:
- Returns undefined from prompt
- Logs: "Operation cancelled."
- Function returns early without making changes

## Testing

### Test Cases
1. **Basic remove**: `agm remove <extension>` - Should prompt for agents if --from not provided
2. **With --from**: `agm remove <extension> --from claude-code` - Should skip agent prompt
3. **No args**: `agm remove` - Should prompt for extension name and agents
4. **Dry-run**: Should preview without removing
5. **Cancel**: Ctrl+C should cancel operation gracefully
