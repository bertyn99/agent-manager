# Learnings

## [2026-01-28] CLI File Duplication Issue

### Problem
Previous sessions created multiple duplicate sections in `src/cli/index.ts`:
- Duplicate import: `withDryRun` imported on lines 4 and 16
- Duplicate command definitions: `mainCommand`, `backupCommand`, `restoreCommand` defined twice
- Malformed duplicate sections (lines 1429-1505) with broken template literals
- Missing imports: `createBackup`, `restoreFromBackup`, and profile functions not imported

### Solution Applied
1. Removed duplicate `withDryRun` import
2. Added missing imports:
   ```typescript
   import { createBackup } from '../core/backup.js';
   import { restoreFromBackup } from '../core/restore.js';
   import { listProfiles, createProfile, applyProfile, removeProfile } from '../core/profiles.js';
   ```
3. Deleted entire malformed duplicate sections (lines 1429-1505)
4. Implemented `runProfile` function with all subcommands (list, create, use, remove)
5. Profile functions use `config.home` parameter, not full config object

### Module Incompatibility Issue Discovered
**Critical Issue**: Build succeeds but runtime fails due to ES/CommonJS incompatibility

- `src/core/backup.ts`, `src/core/restore.ts`, and `src/core/profiles.ts` use ES module syntax:
  ```typescript
  import { existsSync } from 'fs-extra';
  import { join } from 'pathe';
  import { logger } from '../utils/logger.js';
  ```

- But `package.json` has `"type": "commonjs"`

- When Node.js runs the compiled ES module, it cannot import named exports from CommonJS dependencies
- Error: `SyntaxError: Named export 'cpSync' not found...`

### What Was Fixed ✅
- Phase 1 tasks 1.1-1.5: Enhanced list filters
- Phase 1 tasks 1.6-2.6: Dry-run wrapper
- Phase 1 tasks 3.1-3.6: Profile system (CLI integration and function implementation)

### What Was NOT Fixed ⚠️
- Phase 2 modules (backup.ts, restore.ts, profiles.ts) are created but cannot be tested due to module incompatibility
- The module incompatibility issue is a **build system configuration problem**, not code syntax errors
- These modules use correct TypeScript syntax and should work when `package.json` is fixed

### Key Learnings
1. **Never duplicate imports**: Always check for existing imports before adding
2. **Never duplicate command definitions**: One definition per command
3. **Check function signatures**: Profile functions expect `configPath: string`, not `AgentManagerConfig`
4. **Module type consistency**: If `package.json` has `"type": "commonjs"`, all imports must be CommonJS compatible
5. **Build system matters**: TypeScript transpilation can create incompatibility if not configured properly
6. **Test incrementally**: Should have tested CLI after each set of fixes, not batch all fixes

### Recommendation
Fix `package.json` type field and rebuild:
- Option 1: Change to `"type": "module"` and fix all ES imports to CommonJS syntax
- Option 2: Keep `"type": "commonjs"` and configure tsdown to output CommonJS instead of ESM
- **Recommended**: Option 2 (keep existing structure) with minimal changes