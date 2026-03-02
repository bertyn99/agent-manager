import type { AgentType } from "../types.js";
import { readManifest, writeManifest } from "./core.js";

export function addMcpToManifest(
  configHome: string,
  mcpName: string,
  agents: AgentType[],
  config?: Record<string, unknown>,
): void {
  const manifest = readManifest(configHome);

  manifest.mcp[mcpName] = {
    agents,
    config,
  };

  writeManifest(configHome, manifest);
}

export function removeMcpFromManifest(
  configHome: string,
  mcpName: string,
  agent?: AgentType,
): boolean {
  const manifest = readManifest(configHome);

  if (!manifest.mcp[mcpName]) {
    return false;
  }

  if (agent) {
    const mcpAgents = manifest.mcp[mcpName].agents;
    const index = mcpAgents.indexOf(agent);

    if (index !== -1) {
      mcpAgents.splice(index, 1);

      if (mcpAgents.length === 0) {
        delete manifest.mcp[mcpName];
      }

      writeManifest(configHome, manifest);
      return true;
    }

    return false;
  } else {
    delete manifest.mcp[mcpName];
    writeManifest(configHome, manifest);
    return true;
  }
}
