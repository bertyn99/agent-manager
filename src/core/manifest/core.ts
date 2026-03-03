import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "pathe";
import { parseYAML, stringifyYAML } from "confbox";
import type { AgentManagerManifest } from "../types.js";

import { cachedRead, invalidateCache } from "../cache.js";

export function getManifestPath(configHome: string): string {
  return join(configHome, "manifest.yaml");
}

export function readManifest(configHome: string): AgentManagerManifest {
  const manifestPath = getManifestPath(configHome);

  if (!existsSync(manifestPath)) {
    // Invalidate any stale cache entry when file doesn't exist
    invalidateCache(manifestPath);
    return {
      version: "2.0.0",
      updated: new Date().toISOString(),
      mcp: {},
      skills: [],
      commands: {},
    };
  }

  try {
    const parsed = cachedRead(manifestPath, (content: string) => parseYAML(content)) as AgentManagerManifest;

    return {
      version: parsed.version || "2.0.0",
      updated: parsed.updated || new Date().toISOString(),
      mcp: parsed.mcp || {},
      skills: parsed.skills || [],
      commands: parsed.commands || {},
    };
  } catch {
    return {
      version: "2.0.0",
      updated: new Date().toISOString(),
      mcp: {},
      skills: [],
      commands: {},
    };
  }
}

export function writeManifest(configHome: string, manifest: AgentManagerManifest): void {
  const manifestPath = getManifestPath(configHome);
  const dir = dirname(manifestPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  manifest.updated = new Date().toISOString();
  writeFileSync(manifestPath, stringifyYAML(manifest));
  
  // Invalidate cache after write to ensure fresh reads
  invalidateCache(manifestPath);
}

export function clearManifest(configHome: string, agentType?: string): void {
  const manifestPath = getManifestPath(configHome);

  if (!existsSync(manifestPath)) {
    return;
  }

  if (!agentType) {
    rmSync(manifestPath);
    return;
  }

  const manifest = readManifest(configHome);

  for (const originGroup of manifest.skills) {
    if (!originGroup.skills || !Array.isArray(originGroup.skills)) {
      continue;
    }
    for (const skill of originGroup.skills) {
      if (skill.agents && Array.isArray(skill.agents)) {
        skill.agents = skill.agents.filter((a) => a !== agentType);
      }
    }
  }

  writeManifest(configHome, manifest);
}
