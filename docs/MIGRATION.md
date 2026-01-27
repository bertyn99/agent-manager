# Manifest v2.0.0 Migration Guide

## Overview

This guide covers migrating agent-manager's manifest from v1.0.0 (flat structure) to v2.0.0 (hierarchical structure with MCPs separated).

## Automatic Migration

Agent manager will automatically detect and migrate v1.0.0 manifests:

```bash
agm manifest
```

The migration happens transparently:
1. Backup created: `manifest.yaml.old`
2. MCPs separated into `manifest.mcp`
3. Skills grouped by `source.repo`
4. New v2.0.0 format written

## Breaking Changes

1. MCPs now in `manifest.mcp` (not in `skills[]`)
2. Skills grouped by origin in `manifest.skills[]`
3. Filtering by folder name, not skill name

## Rollback

```bash
cp ~/.config/agent-manager/manifest.yaml.old ~/.config/agent-manager/manifest.yaml
```

## Support

See DESIGN.md for full details.
