import { AgentAdapter, AgentType, DetectedAgent, Extension } from "../types.js";
import { AgentManagerConfig } from "../config.js";
import { ClaudeAdapter } from "./ClaudeAdapter.js";
import { CursorAdapter } from "./CursorAdapter.js";
import { GeminiAdapter } from "./GeminiAdapter.js";
import { OpenCodeAdapter } from "./OpenCodeAdapter.js";

export interface AgentRegistry {
  detect(): DetectedAgent[];
  listAllExtensions(): Promise<Extension[]>;
  getAdapter(type: AgentType): AgentAdapter | undefined;
  getDetectedAgents(): DetectedAgent[];
  addExtension(
    extension: Extension,
    targetAgents?: AgentType[],
  ): Promise<{ success: boolean; installedTo: string[]; error?: string }>;
  removeExtension(
    name: string,
    targetAgents?: AgentType[],
  ): Promise<{ success: boolean; removedFrom: string[]; error?: string }>;
}

export function createAgentRegistry(config: AgentManagerConfig): AgentRegistry {
  const adapters: Map<AgentType, AgentAdapter> = new Map();

  // Initialize adapters
  adapters.set("claude-code", new ClaudeAdapter(config));
  adapters.set("cursor", new CursorAdapter(config));
  adapters.set("gemini-cli", new GeminiAdapter(config));
  adapters.set("opencode", new OpenCodeAdapter(config));

  return {
    detect(): DetectedAgent[] {
      const detected: DetectedAgent[] = [];

      for (const [type, adapter] of adapters) {
        if (adapter.detect()) {
          detected.push(adapter.getAgentInfoSync());
        }
      }

      return detected;
    },

    async listAllExtensions(): Promise<Extension[]> {
      const extensions: Extension[] = [];

      for (const adapter of adapters.values()) {
        if (adapter.detect()) {
          extensions.push(...(await adapter.listExtensions()));
        }
      }

      return extensions;
    },

    getAdapter(type: AgentType): AgentAdapter | undefined {
      return adapters.get(type);
    },

    getDetectedAgents(): DetectedAgent[] {
      return this.detect();
    },

    async addExtension(
      extension: Extension,
      targetAgents?: AgentType[],
    ): Promise<{ success: boolean; installedTo: string[]; error?: string }> {
      const installedTo: string[] = [];
      const agentsToUpdate = targetAgents || Array.from(adapters.keys());

      for (const agentType of agentsToUpdate) {
        const adapter = adapters.get(agentType);
        if (!adapter || !adapter.detect()) continue;

        try {
          await adapter.addExtension(extension);
          installedTo.push(agentType);
        } catch (error) {
          console.error(`Failed to add ${extension.name} to ${agentType}:`, error);
        }
      }

      if (installedTo.length === 0) {
        return { success: false, installedTo: [], error: "No compatible agents found" };
      }

      return { success: true, installedTo };
    },

    async removeExtension(
      name: string,
      targetAgents?: AgentType[],
    ): Promise<{ success: boolean; removedFrom: string[]; error?: string }> {
      const removedFrom: string[] = [];
      const agentsToUpdate = targetAgents || Array.from(adapters.keys());

      for (const agentType of agentsToUpdate) {
        const adapter = adapters.get(agentType);
        if (!adapter || !adapter.detect()) continue;

        try {
          await adapter.removeExtension(name);
          removedFrom.push(agentType);
        } catch (error) {
          console.error(`Failed to remove ${name} from ${agentType}:`, error);
        }
      }

      if (removedFrom.length === 0) {
        return { success: false, removedFrom: [], error: "Extension not found on any agent" };
      }

      return { success: true, removedFrom };
    },
  };
}

// Add getAgentInfoSync to AgentAdapter interface
declare module "../types.js" {
  interface AgentAdapter {
    getAgentInfoSync(): DetectedAgent;
  }
}

// Implement getAgentInfoSync in base adapters
ClaudeAdapter.prototype.getAgentInfoSync = function () {
  const agentConfig = this.config.agents["claude-code"];
  const installed = this.detect();
  return {
    type: "claude-code",
    name: "Claude Code",
    installed,
    configPath: agentConfig.configPath,
    extensions: [],
  };
};

CursorAdapter.prototype.getAgentInfoSync = function () {
  const agentConfig = this.config.agents["cursor"];
  const installed = this.detect();
  return {
    type: "cursor",
    name: "Cursor",
    installed,
    configPath: agentConfig.configPath,
    extensions: [],
  };
};

GeminiAdapter.prototype.getAgentInfoSync = function () {
  const agentConfig = this.config.agents["gemini-cli"];
  const installed = this.detect();
  return {
    type: "gemini-cli",
    name: "Gemini CLI",
    installed,
    configPath: agentConfig.configPath,
    skillsPath: agentConfig.skillsPath,
    extensions: [],
  };
};

OpenCodeAdapter.prototype.getAgentInfoSync = function () {
  const agentConfig = this.config.agents?.["opencode"];
  const installed = agentConfig ? this.detect() : false;

  if (!agentConfig) {
    return {
      type: "opencode",
      name: "OpenCode",
      installed: false,
      configPath: "",
      skillsPath: "",
      extensions: [],
    };
  }

  return {
    type: "opencode",
    name: "OpenCode",
    installed,
    configPath: agentConfig.configPath,
    skillsPath: agentConfig.skillsPath,
    extensions: [],
  };
};
