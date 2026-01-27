// Core types for Agent Manager

// Agent types
export type AgentType = 
  | 'claude-code' 
  | 'cursor' 
  | 'gemini-cli' 
  | 'opencode' 
  | 'vscode-copilot'
  | 'openai-codex';

export interface AgentInfo {
  type: AgentType;
  name: string;
  installed: boolean;
  configPath: string;
  skillsPath?: string;
  version?: string;
}

export interface DetectedAgent extends AgentInfo {
  extensions: Extension[];
  lastSync?: Date;
}

// Extension types (MCP servers, skills, commands, etc.)
export type ExtensionType = 'mcp' | 'skill' | 'command' | 'agent';

export interface Extension {
  name: string;
  type: ExtensionType;
  agent: AgentType;
  description?: string;
  path?: string;
  config?: Record<string, unknown>;
  source?: string;
  enabled?: boolean;
}

export interface UnifiedSkill {
  name: string;
  description: string;
  license?: string;
  version?: string;
  author?: string;
  
  formats: {
    // Agent Skills Spec (https://agentskills.io/specification)
    agentSkills?: {
      enabled: boolean;
      path: string;  // Relative path to SKILL.md
    };
    
    // MCP Servers (Claude Code, Cursor, Gemini)
    mcp?: {
      enabled: boolean;
      type: 'http' | 'command';
      url?: string;
      command?: string;
      args?: string[];
      headers?: Record<string, string>;
    };
    
    // Gemini Commands (.toml)
    geminiCommand?: {
      enabled: boolean;
      name: string;
      description: string;
    };
    
    // Gemini Antigravity Agent
    geminiAgent?: {
      enabled: boolean;
      name: string;
      brain?: string;
    };
    
    // VS Code Extension
    vscode?: {
      enabled: boolean;
      id?: string;
      marketplace?: string;
      vsix?: string;
    };
    
    // OpenAI Codex (future)
    codex?: {
      enabled: boolean;
      format?: string;
    };
  };
  
  content?: {
    readme?: string;
    prompt?: string;
    references?: string[];
    scripts?: string[];
    assets?: string[];
  };
  
  source?: {
    type: 'git' | 'local' | 'http';
    repo?: string;
    path?: string;
    pinned?: string | null;  // commit, tag, or null for latest
  };
}

// Configuration types
export interface AgentManagerConfig {
  home: string;
  manifestPath: string;
  skillsPath: string;
  vendorPath: string;
  agents: Record<AgentType, AgentConfig>;
}

export interface AgentConfig {
  enabled: boolean;
  configPath: string;
  skillsPath?: string;
}

// Command options
export interface AddOptions {
  to?: AgentType[];
  only?: ExtensionType[];
  commit?: string;
  tag?: string;
  path?: string;
  nested?: boolean;
  include?: string[];
  exclude?: string[];
}

export interface RemoveOptions {
  from?: AgentType[];
  force?: boolean;
}

export interface SyncOptions {
  dryRun?: boolean;
  force?: boolean;
  agents?: AgentType[];
}

export interface ListOptions {
  json?: boolean;
  verbose?: boolean;
  filter?: string;
}

export interface UpgradeOptions {
  all?: boolean;
  force?: boolean;
  commit?: string;
}

// Result types
export interface OperationResult {
  success: boolean;
  agent: AgentType;
  skill?: string;
  action: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SyncResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: OperationResult[];
}

// Git types
export interface GitRepoInfo {
  url: string;
  org: string;
  repo: string;
  branch: string;
  path: string;
}

// Manifest types (skills.yaml format)
export interface SkillsManifest {
  sources: ManifestSource[];
  customized: string[];
  local: string[];
  disabled: string[];
  upgraded: string[];
}

export interface ManifestSource {
  repo: string;
  path: string;
  nested: boolean;
  branch: string;
  pinned: string | null;
  include: string[];
  exclude: string[];
}

// New manifest v2.0.0 types (separate MCPs from Skills, group by origin)

/**
 * New manifest structure (v2.0.0)
 * Separates MCP servers from skills and groups skills by origin repository
 */
export interface NewAgentManagerManifest {
  version: string;
  updated: string;
  mcp: Record<string, {
    agents: AgentType[];
    config?: Record<string, unknown>;
  }>;
  skills: SkillOriginGroup[];
}

/**
 * Group of skills from a single origin (remote repo or local)
 */
export interface SkillOriginGroup {
  origin: string;
  path: string;
  branch: string;
  include: string[];
  exclude: string[];
  skills: SkillEntry[];
}

/**
 * Individual skill within an origin group
 */
export interface SkillEntry {
  name: string;
  folderName: string;
  agents: AgentType[];
  description?: string;
}

// Migration types (v1.0.0 -> v2.0.0)

/**
 * Legacy manifest format (v1.0.0)
 */
export interface LegacyManifest {
  version: string;
  updated: string;
  skills: ManifestSkill[];
  sources: ManifestSource[];
}

/**
 * Result of migration operation
 */
export interface MigrationResult {
  success: boolean;
  migratedSkills: number;
  migratedMcps: number;
  migratedSources: number;
  errors: string[];
}
