# Issues - Manifest Restructuring

## [2026-01-22 00:40] Pre-existing LSP Errors

### Current Codebase Issues (NOT caused by this work)
- `skill-installer.ts`: Import errors, type mismatches (11 errors)
- `skill-sync.ts`: Index signature issues (2 errors)
- `manifest.ts`: String[] vs string comparison (1 error)
- `cli/index.ts`: Type issues, missing properties (8 errors)
- `adapters/index.ts`: Module import issues, private property access (6 errors)

**Note**: 250 tests pass, build passes. These are type errors that don't affect runtime.

## [2026-01-22 00:40] Known Issues

### Current Implementation Gaps
- `syncFromSources` clones to temp, not cache
- Filter logic uses skill name, should use folder name
- No MCP detection/separation in current code
- Skills not grouped by origin in manifest

### Potential Risks
- Migration data loss if not careful
- User confusion with new structure
- Backward compatibility concerns
