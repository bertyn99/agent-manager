# Issues Found

## [2026-01-28] Critical CLI File Problems

### Duplicate Imports
- Line 4 and 16: `import { withDryRun } from '../core/dry-run.js';` appears twice

### Missing Functions
- Line 1278 calls `runProfile(args)` but `runProfile` function is NOT defined anywhere
- This will cause runtime error when profile commands are used

### Missing Imports for Backup/Restore
- Line 1284 calls `createBackup` - NOT imported
- Line 1302 calls `restoreFromBackup` - NOT imported
- Need to add: `import { createBackup, restoreFromBackup } from '../core/backup.js';`

### Duplicate Command Definitions
1. `mainCommand` defined TWICE (lines 1367 and 1387)
2. `backupCommand` defined TWICE (lines 1317 and 1429)
3. `restoreCommand` defined TWICE (lines 1345 and 1472)

### Malformed Syntax (CRITICAL)
Lines 1429-1505 contain broken syntax:
- Line 1463: `\`` instead of `` ` ``
- Line 1464: `\${` instead of `${`
- Line 1466: `\`` instead of `` ` ``
- Line 1496: `\`` instead of `` ` ``
- Line 1497: `\${` instead of `${`
- Line 1501: `\${` instead of `${`
- Line 1452: Malformed structure with extra `},` closing brace
- Lines 1453-1469: `args: { ... },` followed by `run()` outside proper structure

### Impact
- File will NOT compile
- Even if it compiles, will crash at runtime
- Profile commands broken (runProfile missing)
- Backup/restore commands broken (duplicates + syntax errors)

### Fix Required
1. Remove duplicate imports
2. Add missing imports for backup/restore functions
3. Remove duplicate command definitions (keep first version of each)
4. Delete lines 1429-1505 entirely (malformed duplicate backup/restore)
5. Add `runProfile` function definition (needs to be implemented)
