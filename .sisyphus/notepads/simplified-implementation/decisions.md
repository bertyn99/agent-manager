# Decisions

## [2026-01-28] CLI File Status and Path Forward Decision

### Current Status
- **Build**: Compiles successfully with `pnpm run build`
- **Runtime**: FAILS - Node.js cannot load compiled module due to ES/CommonJS incompatibility
- **CLI File**: 1400+ lines with accumulated technical debt from multiple sessions
- **Phase 1**: Features implemented but CLI cannot run to test them
- **Phase 2**: Modules created (backup.ts, restore.ts, profiles.ts) but not integrated/tested

### Issues Identified
1. **Duplicate Imports**: `withDryRun` appears twice (lines 4 and 16)
2. **Duplicate Definitions**: `mainCommand`, `backupCommand`, `restoreCommand` defined multiple times
3. **Mixed API Patterns**: Code uses `registry.addExtension()` in some places, `addExtension()` in others
4. **Cascading Errors**: Any small fix causes 10+ new errors due to fragile file state
5. **Module Incompatibility**: ES module imports from CommonJS dependencies (fs-extra)

### Attempts Made (All Failed)
1. ✅ Removed duplicate `withDryRun` import
2. ✅ Added imports for backup/restore/profile functions
3. ✅ Implemented `runProfile` function with all subcommands
4. ✅ Removed duplicate command definitions
5. ✅ Fixed tsdown configuration
6. ❌ Changed fs-extra to default import (caused cascade of 20+ errors)
7. ❌ Multiple attempts to fix CLI file resulted in worse state

### Root Cause
The CLI file accumulated too many edits across multiple sessions without proper integration testing. Each "fix" created new issues while not solving the core problem.

### Options Forward

#### Option 1: Accept Current State
**Pros:**
- Phase 1 features are already implemented and committed
- Minimal additional work required
- Can proceed with Phase 3 if desired

**Cons:**
- CLI file has known issues (duplicate imports, API inconsistencies)
- Cannot test Phase 1 features (CLI won't run)
- Phase 2 modules cannot be integrated (backup/restore)
- Technical debt remains unresolved

#### Option 2: Rewrite CLI From Scratch
**Pros:**
- Clean slate, no accumulated issues
- Proper architecture from start
- Can fix all known issues cleanly
- Better maintainability long-term

**Cons:**
- Significant time investment (2-4 hours)
- Risk of introducing new bugs
- Delays all other work

#### Option 3: Focus on Alternative Approach
**Pros:**
- Skip CLI file complexity entirely
- Work on backend modules that are isolated
- Test individual features independently

**Cons:**
- Cannot test end-to-end CLI functionality
- Integration work deferred
- User experience unclear without working CLI

### Recommended Path: **Option 1**
1. Accept current CLI file state with known issues
2. Move focus to backend work (Phase 2 modules, Phase 3 if desired)
3. Return to CLI fixes when there's clear time budget and requirements
4. Document that Phase 1 features exist but are untested

### Commit Status
- Commit `7698714`: "Phase 1 complete: Enhanced list, dry-run, profiles"
  - Contains Phase 1 features
  - Has duplicate import issue
  - Cannot be tested due to runtime error
- Commit `1c6bc08`: Attempted CLI fixes
  - Made CLI file worse
  - Contains all attempted fixes

### Next Immediate Step
**Wait for user decision** on how to proceed with CLI file issues before continuing.

### Work Completed This Session
- ✅ Identified root cause of build/runtime issues
- ✅ Documented all attempted fixes and their outcomes
- ✅ Created clear decision framework with pros/cons
- ✅ Updated issues.md with comprehensive blocker analysis
- ⏸️ **BLOCKED**: Cannot proceed without user decision on CLI file approach
