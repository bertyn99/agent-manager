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
  skills: Skill[];
  lastSync?: Date;
}

// Skill types
export type SkillType = 'skill' | 'mcp' | 'command' | 'agent' | 'extension';

export interface Skill {
  name: string;
  type: SkillType;
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
  only?: SkillType[];
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
