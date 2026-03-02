// Core types for Agent Manager

// Agent types
export type AgentType =
  | "claude-code"
  | "cursor"
  | "gemini-cli"
  | "opencode"
  | "vscode-copilot"
  | "openai-codex";

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
export type ExtensionType = "mcp" | "skill" | "command" | "agent";

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
    agentSkills?: {
      enabled: boolean;
      path: string;
    };
    mcp?: {
      enabled: boolean;
      type: "http" | "command";
      url?: string;
      command?: string;
      args?: string[];
      headers?: Record<string, string>;
    };
    geminiCommand?: {
      enabled: boolean;
      name: string;
      description: string;
    };
    geminiAgent?: {
      enabled: boolean;
      name: string;
      brain?: string;
    };
    vscode?: {
      enabled: boolean;
      id?: string;
      marketplace?: string;
      vsix?: string;
    };
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
    type: "git" | "local" | "http";
    repo?: string;
    path?: string;
    pinned?: string | null;
  };
}

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
  search?: string;
  sort?: string;
  reverse?: boolean;
  limit?: number;
  origin?: string;
}

export interface ConflictInfo {
  extension: string;
  agent: string;
  existingConfig?: Record<string, unknown>;
  proposedConfig?: Record<string, unknown>;
}

export interface RestoreOptions {
  dryRun?: boolean;
  agents?: string[];
  includeDisabled?: boolean;
  mergeStrategy?: "replace" | "merge";
  preview?: boolean;
}

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

export interface GitRepoInfo {
  url: string;
  org: string;
  repo: string;
  branch: string;
  path: string;
}

export interface McpEntry {
  agents: AgentType[];
  config?: Record<string, unknown>;
}

export interface CommandEntry {
  agents: AgentType[];
  config?: Record<string, unknown>;
}

export interface AgentManagerManifest {
  version: string;
  updated: string;
  mcp: Record<string, McpEntry>;
  skills: SkillOriginGroup[];
  commands: Record<string, CommandEntry>;
}

export interface BackupAgentData {
  installed: boolean;
  configPath: string;
  extensions: BackupExtension[];
}

export interface BackupExtension {
  name: string;
  type: "mcp" | "skill" | "command";
  enabled: boolean;
  config?: Record<string, unknown>;
  source?: string;
}

export interface BackupResult {
  success: boolean;
  backupFile?: string;
  extensionCount?: number;
  error?: string;
}

export interface BackupMetadata {
  version: string;
  backedUpAt: string;
  agents: Record<string, BackupAgentData>;
}

export interface BackupOptions {
  outputPath?: string;
  includeManifest?: boolean;
  incremental?: boolean;
  since?: string;
  maxAge?: string;
}

export type Schedules = Record<string, Schedule>;

export interface Schedule {
  interval: string;
  retention: number;
  enabled: boolean;
  lastRun?: string;
}

export interface SchedulerHandle {
  id: string;
  interval: string;
  retention: number;
  enabled: boolean;
}

export interface SchedulerState {
  version: string;
  schedules: Schedules;
}

export interface SkillOriginGroup {
  origin: string;
  path: string;
  branch: string;
  include: string[];
  exclude: string[];
  skills: SkillEntry[];
}

export interface SkillEntry {
  name: string;
  folderName: string;
  agents: AgentType[];
  description?: string;
}

export interface OpenCodeSkill {
  id: string;
  description?: string;
  installedAt?: string;
  lastUsed?: string;
  usageCount?: number;
  version?: string;
}
