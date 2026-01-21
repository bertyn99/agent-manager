import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  lstatSync,
  readlinkSync,
  unlinkSync,
  rmSync,
  writeFileSync,
} from 'fs-extra';
import { join, dirname } from 'pathe';
import { load as yamlLoad } from 'js-yaml';
import { AgentAdapter, AgentType, DetectedAgent, Extension } from '../types.js';
import { AgentManagerConfig } from '../config.js';
import { transportValidator } from '../core/transport-validator.js';
import { logger } from '../utils/logger.js';

interface OpenCodeMCPConfig {
  [serverName: string]: {
    type?: string;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
  };
}

interface OpenCodeConfigFile {
  mcp?: OpenCodeMCPConfig;
  [key: string]: unknown;
}

/**
 * OpenCode Adapter (formerly skill-manager)
 *
 * Manages extensions via:
 * - SKILL.md files in ~/.config/opencode/skill/
 * - MCP servers in ~/.config/opencode/opencode.json
 * - skills.yaml manifest in ~/.config/opencode/
 * - Symlinks to vendor directories (vendor extensions)
 * - Directories for customized/local extensions
 */
export class OpenCodeAdapter implements AgentAdapter {
  readonly type: AgentType = 'opencode';
  readonly name = 'OpenCode';

  constructor(private config: AgentManagerConfig) {}

  /**
   * Detect if OpenCode is installed
   */
  detect(): boolean {
    const agentConfig = this.config.agents['opencode'];
    return existsSync(agentConfig.skillsPath);
  }

  /**
   * Get the manifest path for OpenCode
   */
  getManifestPath(): string {
    return this.config.agents['opencode'].configPath;
  }

  /**
   * Get the OpenCode config directory
   */
  getConfigDir(): string {
    return dirname(this.config.agents['opencode'].configPath);
  }

  /**
   * Get the MCP config file path (opencode.json)
   */
  getMCPConfigPath(): string {
    return join(this.getConfigDir(), 'opencode.json');
  }

  /**
   * Read and parse opencode.json (supports JSONC with comments)
   */
  readOpenCodeConfig(): OpenCodeConfigFile | null {
    const mcpPath = this.getMCPConfigPath();
    if (!existsSync(mcpPath)) {
      return null;
    }

    try {
      const content = readFileSync(mcpPath, 'utf-8');
      // Parse JSONC (allow comments) - only remove // at start of line (with optional whitespace)
      const jsonContent = content
        .replace(/^\s*\/\/.*$/gm, '')  // Remove single-line comments only at line start
        .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments
      return JSON.parse(jsonContent) as OpenCodeConfigFile;
    } catch {
      return null;
    }
  }

  /**
   * Write opencode.json
   */
  writeOpenCodeConfig(config: OpenCodeConfigFile): void {
    const mcpPath = this.getMCPConfigPath();
    mkdirSync(dirname(mcpPath), { recursive: true });
    writeFileSync(mcpPath, JSON.stringify(config, null, 2));
  }

  /**
   * Read and parse the extensions.yaml manifest
   */
  readManifest(): Record<string, unknown> | null {
    const manifestPath = this.getManifestPath();
    if (!existsSync(manifestPath)) {
      return null;
    }

    try {
      const content = readFileSync(manifestPath, 'utf-8');
      return yamlLoad(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Check if a path is a symlink
   */
  isSymlink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  isDirectory(path: string): boolean {
    try {
      return lstatSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a file
   */
  isFile(path: string): boolean {
    try {
      return lstatSync(path).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Read and parse the .upstream file for customized extensions
   */
  readUpstreamFile(extensionPath: string): { source: string; commit: string; customizedAt: string } | null {
    const upstreamPath = join(extensionPath, '.upstream');
    if (!existsSync(upstreamPath)) {
      return null;
    }

    try {
      const content = readFileSync(upstreamPath, 'utf-8');
      const result: { source?: string; commit?: string; customized_at?: string } = {};
      for (const line of content.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          if (key === 'source') result.source = value;
          if (key === 'commit') result.commit = value;
          if (key === 'customized_at') result.customizedAt = value;
        }
      }

      if (result.source && result.commit) {
        return {
          source: result.source,
          commit: result.commit,
          customizedAt: result.customizedAt || '',
        };
      }
    } catch {
      // Ignore errors reading .upstream
    }

    return null;
  }

  /**
   * Determine the source type of an extension
   */
  getExtensionSource(extensionPath: string): 'vendor' | 'local' | { repo: string; commit: string } {
    if (this.isSymlink(extensionPath)) {
      return 'vendor';
    }

    const upstream = this.readUpstreamFile(extensionPath);
    if (upstream) {
      return { repo: upstream.source, commit: upstream.commit };
    }

    return 'local';
  }

  async listExtensions(): Promise<Extension[]> {
    const agentConfig = this.config.agents['opencode'];
    const extensions: Extension[] = [];

    if (!existsSync(agentConfig.skillsPath)) {
      return [];
    }

    // List MCP servers from opencode.json
    const opencodeConfig = this.readOpenCodeConfig();
    if (opencodeConfig?.mcp) {
      for (const [name, server] of Object.entries(opencodeConfig.mcp)) {
        // OpenCode uses type: "remote" with url, or command-based
        const transportType = server.type === 'remote' ? 'http' : (server.command ? 'command' : 'http');
        
        extensions.push({
          name,
          type: 'mcp',
          agent: 'opencode',
          description: `MCP server: ${name}`,
          config: {
            type: transportType,
            url: server.url,
            command: server.command,
            args: server.args,
            env: server.env,
          },
          enabled: server.enabled !== false,
        });
      }
    }

    // List skills from skills directory
    const manifest = this.readManifest();
    const customized = new Set<string>();
    const local = new Set<string>();

    if (manifest) {
      if (Array.isArray((manifest as Record<string, unknown>).customized)) {
        for (const item of (manifest as { customized: string[] }).customized) {
          customized.add(item);
        }
      }
      if (Array.isArray((manifest as Record<string, unknown>).local)) {
        for (const item of (manifest as { local: string[] }).local) {
          local.add(item);
        }
      }
    }

    for (const dir of readdirSync(agentConfig.skillsPath)) {
      const extensionPath = join(agentConfig.skillsPath, dir);

      const stat = lstatSync(extensionPath);
      if (!stat.isDirectory() && !stat.isSymbolicLink()) {
        continue;
      }

      const skillMdPath = join(extensionPath, 'SKILL.md');
      if (!existsSync(skillMdPath)) {
        continue;
      }

      // Read and parse SKILL.md
      const content = readFileSync(skillMdPath, 'utf-8');
      const frontmatter = this.parseFrontmatter(content);

      // Determine source type
      const source = this.getExtensionSource(extensionPath);

      extensions.push({
        name: frontmatter.name || dir,
        type: 'skill' as const,
        agent: 'opencode' as const,
        description: frontmatter.description,
        path: extensionPath,
        enabled: !customized.has(dir) && !local.has(dir),
        source: typeof source === 'string' ? source : undefined,
      });
    }

    return extensions;
  }

  async addExtension(extension: Extension): Promise<void> {
    const agentConfig = this.config.agents['opencode'];

    // Handle MCP servers
    if (extension.type === 'mcp' && extension.config) {
      const mcpConfig = extension.config as Record<string, unknown>;
      const transportType = mcpConfig.type as string || 'command';

      // Validate transport type
      const validation = transportValidator.validateTransportType(transportType);
      if (!validation.valid) {
        throw new Error(`Invalid MCP transport type: ${validation.errors.join(', ')}`);
      }

      const config = this.readOpenCodeConfig() || { mcp: {} };
      config.mcp = config.mcp || {};

      // OpenCode MCP format: type: "remote" with url, or command-based
      if (transportType === 'http' || transportType === 'sse' || transportType === 'websocket') {
        config.mcp[extension.name] = {
          type: 'remote',
          url: mcpConfig.url as string,
          enabled: extension.enabled,
        };
      } else {
        config.mcp[extension.name] = {
          type: 'command',
          command: mcpConfig.command as string,
          args: mcpConfig.args as string[] | undefined,
          env: mcpConfig.env as Record<string, string> | undefined,
          enabled: extension.enabled,
        };
      }

      this.writeOpenCodeConfig(config);
      return;
    }

    // Handle skills (existing logic)
    if (!extension.path) {
      throw new Error('Extension path is required for OpenCode skills');
    }

    const targetPath = join(agentConfig.skillsPath, extension.name);

    // Remove existing symlink or directory
    if (this.isSymlink(targetPath)) {
      unlinkSync(targetPath);
    } else if (existsSync(targetPath)) {
      throw new Error(`Extension ${extension.name} already exists as a directory`);
    }

    // Create symlink to extension source (vendor pattern)
    symlinkSync(extension.path, targetPath);
  }

  async removeExtension(extensionName: string): Promise<void> {
    const agentConfig = this.config.agents['opencode'];
    const extensionPath = join(agentConfig.skillsPath, extensionName);

    // First, try to remove from MCP config
    const config = this.readOpenCodeConfig();
    if (config?.mcp?.[extensionName]) {
      delete config.mcp[extensionName];
      this.writeOpenCodeConfig(config);
      return;
    }

    // Handle skills (existing logic)
    // Use lstatSync to check if the symlink/file itself exists (doesn't follow symlinks)
    if (!existsSync(extensionPath) && !this.isSymlink(extensionPath)) {
      return;
    }

    // Handle symlinks
    if (this.isSymlink(extensionPath)) {
      unlinkSync(extensionPath);
    } else {
      // Handle directories (customized or local extensions)
      rmSync(extensionPath, { recursive: true });
    }

    // Update manifest to remove from customized if present
    this.removeFromCustomized(extensionName);
  }

  /**
   * Remove an extension from the customized array in manifest
   */
  removeFromCustomized(extensionName: string): void {
    const manifestPath = this.getManifestPath();
    if (!existsSync(manifestPath)) {
      return;
    }

    try {
      const manifest = this.readManifest();
      if (manifest && Array.isArray((manifest as Record<string, unknown>).customized)) {
        const customized = (manifest as { customized: string[] }).customized;
        const index = customized.indexOf(extensionName);
        if (index > -1) {
          customized.splice(index, 1);
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }
      }
    } catch {
      // Ignore errors updating manifest
    }
  }

  async getAgentInfo(): Promise<DetectedAgent> {
    const agentConfig = this.config.agents['opencode'];
    const installed = this.detect();
    const extensions = installed ? await this.listExtensions() : [];

    return {
      type: 'opencode',
      name: 'OpenCode',
      installed,
      configPath: agentConfig.configPath,
      skillsPath: agentConfig.skillsPath,
      extensions,
    };
  }

  /**
   * Parse frontmatter from SKILL.md
   */
  private parseFrontmatter(content: string): Record<string, string> {
    const frontmatter: Record<string, string> = {};
    const match = content.match(/^---\n([\s\S]*?)\n---/);

    if (match) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          frontmatter[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    return frontmatter;
  }
}
