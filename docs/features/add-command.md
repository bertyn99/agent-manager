# Feature: Add Command with Interactive Prompts

## Overview

The `add` command allows users to install extensions (skills, MCP servers, commands) from Git repositories into various AI agents (Claude Code, Cursor, Gemini CLI, OpenCode).

## User Flow

### Step 1: Repository URL
- **Condition**: If repo URL not provided as positional argument
- **Prompt**: `Enter repository URL:` (text, required)
- **Result**: Stores repo URL for cloning

### Step 2: Agent Selection
- **Condition**: If `--to` flag not provided
- **Prompt**: `Select target agent(s):` (multiselect)
- **Options**: Claude Code, Cursor, Gemini CLI, OpenCode
- **Result**: Target agents for installation
- **Note**: If no agents selected, defaults to all detected agents

### Step 3: Nested Repository Check
- **Condition**: If `--nested` flag not provided
- **Prompt**: `Is this a nested repository (extensions in subdirectories)?` (confirm, default: false)
- **Result**: Sets `nested` flag
- **Impact**: Determines if skills are in subdirectories

### Step 4: Path to Skills (Optional)
- **Condition**: Always asked when nested is true (or can be provided via `--path`)
- **Prompt**: `Path to skills (optional, press Enter to skip):` (text, optional)
- **Result**: Custom subdirectory path (e.g., "skills", "extensions")
- **Important**: This path must exist in the cloned repository

### Step 5: Skills Selection Mode
- **Condition**: If `--include`, `--exclude`, `--includeSelect`, `--excludeSelect` not provided
- **Prompt**: `Select skills mode:` (select)
- **Options**:
  - `include` → Sets `includeSelect=true` (select what you want)
  - `exclude` → Sets `excludeSelect=true` (select what you don't want)
  - `all` → No flags, install everything
- **Result**: Determines skill filtering strategy

### Step 6: Interactive Skills Selection (Inside addExtension/addGlobalSkill)
- **Condition**: If `includeSelect=true` or `excludeSelect=true`
- **Timing**: AFTER repository is cloned
- **Process**:
  1. Clone repository to temp directory
  2. Detect all skills using `detectMultiExtensionRepo()` or `detectSkillsInFolder()`
  3. Show interactive prompt with actual skill names
  4. Filter skills based on selection
- **Prompts**:
  - Include mode: "Select skills to install (X found):" (multiselect)
  - Exclude mode: "Select skills to EXCLUDE from installation:" (multiselect)

### Step 7: Global Skill Confirmation
- **Condition**: If `--global` flag not provided
- **Prompt**: `Install as global Claude skill?` (confirm, default: false)
- **Result**: If true, installs to `~/.claude/skills/` instead of agent-specific locations
- **Note**: Global installation ignores agent selection

### Step 8: Dry-Run Preview
- **Condition**: If `--dryRun` flag not provided
- **Prompt**: `Preview changes before applying?` (confirm, default: true)
- **Result**: If true, shows what would be installed without making changes

## Code Flow

### Main Function: `runAdd()`

```typescript
export async function runAdd(args: AddOptions) {
  // Step 1: Get repo URL (prompt if missing)
  let repoUrl = args.repo ?? await prompt('Enter repository URL:');
  
  // Step 2: Get target agents (prompt if --to not provided)
  let targetAgents = args.to ? parseAgents(args.to) : await prompt('Select target agent(s):');
  
  // Step 3: Check if nested (prompt if --nested not provided)
  let nested = args.nested ?? await prompt('Is this a nested repository?');
  
  // Step 4: Get path (prompt if --path not provided)
  let nestedPath = args.path ?? await prompt('Path to skills (optional):');
  
  // Step 5: Determine skill selection mode
  let includeSelect = args.includeSelect;
  let excludeSelect = args.excludeSelect;
  if (!args.include && !args.exclude && !includeSelect && !excludeSelect) {
    const mode = await prompt('Select skills mode:');
    if (mode === 'include') includeSelect = true;
    if (mode === 'exclude') excludeSelect = true;
  }
  
  // Step 6: Check if global (prompt if --global not provided)
  let global = args.global ?? await prompt('Install as global Claude skill?');
  
  // Step 7: Check dry-run (prompt if --dryRun not provided)
  let dryRun = args.dryRun ?? await prompt('Preview changes before applying?');
  
  // Execute installation
  if (global) {
    return await addGlobalSkill(repoUrl, config, {
      dryRun,
      nested,
      path: nestedPath,
      includeSelect,
      excludeSelect,
    });
  } else {
    return await addExtension(repoUrl, config, {
      to: targetAgents,
      dryRun,
      nested,
      path: nestedPath,
      includeSelect,
      excludeSelect,
    });
  }
}
```

### Core Functions

#### `addExtension()` (src/core/skill-installer.ts:520)
- Clones repository to temp directory
- Detects skill format (single vs multi-extension)
- For multi-extension repos:
  - Calls `detectMultiExtensionRepo()` to find all skills
  - If `includeSelect` or `excludeSelect` is true, shows interactive prompt
  - Filters skills based on selection
- Installs to each target agent

#### `addGlobalSkill()` (src/core/skill-installer.ts:772)
- Similar to addExtension but targets `~/.claude/skills/`
- Clones repository to temp directory
- Uses `detectMultiExtensionRepo()` to find skills
- If `includeSelect` or `excludeSelect` is true, shows interactive prompt
- Copies skills to global directory

#### `detectMultiExtensionRepo()` (src/core/skill-installer.ts)
- Scans repository for skills in:
  - `skills/` subdirectory
  - `extensions/` subdirectory
  - `plugins/` subdirectory
  - `packages/` subdirectory
  - Root directory (flat skills)
- Returns array of skill paths

## Common Issues

### Issue: "Path not found: skills" in Dry-Run Mode
**Cause**: When preview mode is enabled, the repository is not actually cloned, so the path cannot be validated against the repository structure.
**Solution**: 
- Run without preview/dry-run to actually clone and validate the path
- Or ensure the path format is correct (e.g., "skills", "extensions", "plugins")

**Note**: This has been fixed - path validation is now skipped in dry-run mode.

### Issue: Empty skill selection list
**Cause**: Trying to prompt for skills before cloning
**Solution**: Skill selection happens AFTER cloning, inside addExtension/addGlobalSkill

## Testing

### Test Cases
1. **Basic add**: `agm add <repo>` - Should prompt for all missing args
2. **With flags**: `agm add <repo> --to claude-code` - Should skip agent prompt
3. **Nested with path**: `agm add <repo> --nested --path skills` - Should scope to skills/
4. **Exclude mode**: Select "Exclude" mode, should show skills after clone
5. **Global skill**: Select "Yes" for global, should install to ~/.claude/skills/
6. **Dry-run**: Select "Yes" for preview, should not make changes
