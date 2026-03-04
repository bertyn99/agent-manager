# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-03-04

### Added
- LICENSE file (MIT)
- npm package publication support
- Dual CJS/ESM output format for maximum compatibility
- TypeScript declarations for both ESM (.d.mts) and CJS (.d.cts)
- Package validation with publint
- Version management with bumpp
- `check` script for package validation
- `release` script for automated version bumping and publishing

### Changed
- Updated README.md with npm installation instructions
- Updated package.json exports field for dual CJS/ESM support
- Updated tsdown config to output both CJS and ESM formats
- Changed repository URL to full git+https format for npm provenance
- Bin entries now point to .mjs files for ESM compatibility
- Added `sideEffects: false` for tree-shaking optimization
- Simplified `files` field to include only published files (dist, LICENSE, README.md)

### Technical
- Build outputs both `index.mjs` (ESM) and `index.cjs` (CommonJS)
- Type definitions split into `index.d.mts` (ESM) and `index.d.cts` (CJS)
- Package validates with publint before publication
- All published files include appropriate execute permissions for CLI binaries

## [1.0.0] - 2025-02-01

### Added
- Initial release
- Universal CLI tool to manage skills, agents, and commands across multiple AI coding assistants
- Support for Claude Code, Cursor, Gemini CLI, OpenCode, and VS Code Copilot
- MCP server management
- Extension detection, listing, adding, removing, and syncing
- Manifest management with v2.0.0 structure
- Profile management
- Backup and restore functionality
- Health check (doctor) command
