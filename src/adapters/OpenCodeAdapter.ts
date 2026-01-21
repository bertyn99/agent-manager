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
import { AgentAdapter, AgentType, DetectedAgent, Skill } from '../types.js';
import { AgentManagerConfig } from '../config.js';

/**
 * OpenCode Adapter (formerly skill-manager)
 *
 * Manages skills via:
 * - SKILL.md files in ~/.config/opencode/skill/
 * - skills.yaml manifest in ~/.config/opencode/
 * - Symlinks to vendor directories (vendor skills)
 * - Directories for customized/local skills
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
   * Read and parse the skills.yaml manifest
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
   * Read and parse the .upstream file for customized skills
   */
  readUpstreamFile(skillPath: string): { source: string; commit: string; customizedAt: string } | null {
    const upstreamPath = join(skillPath, '.upstream');
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
   * Determine the source type of a skill
   */
  getSkillSource(skillPath: string): 'vendor' | 'local' | { repo: string; commit: string } {
    if (this.isSymlink(skillPath)) {
      return 'vendor';
    }

    const upstream = this.readUpstreamFile(skillPath);
    if (upstream) {
      return { repo: upstream.source, commit: upstream.commit };
    }

    return 'local';
  }

  async listSkills(): Promise<Skill[]> {
    const agentConfig = this.config.agents['opencode'];
    const skills: Skill[] = [];

    if (!existsSync(agentConfig.skillsPath)) {
      return [];
    }

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
      const skillPath = join(agentConfig.skillsPath, dir);

      const stat = lstatSync(skillPath);
      if (!stat.isDirectory() && !stat.isSymbolicLink()) {
        continue;
      }

      const skillMdPath = join(skillPath, 'SKILL.md');
      if (!existsSync(skillMdPath)) {
        continue;
      }

      // Read and parse SKILL.md
      const content = readFileSync(skillMdPath, 'utf-8');
      const frontmatter = this.parseFrontmatter(content);

      // Determine source type
      const source = this.getSkillSource(skillPath);

      skills.push({
        name: frontmatter.name || dir,
        type: 'skill' as const,
        agent: 'opencode' as const,
        description: frontmatter.description,
        path: skillPath,
        enabled: !customized.has(dir) && !local.has(dir),
        source: source,
      });
    }

    return skills;
  }

  async addSkill(skill: Skill): Promise<void> {
    const agentConfig = this.config.agents['opencode'];

    if (!skill.path) {
      throw new Error('Skill path is required for OpenCode');
    }

    const targetPath = join(agentConfig.skillsPath, skill.name);

    // Remove existing symlink or directory
    if (this.isSymlink(targetPath)) {
      unlinkSync(targetPath);
    } else if (existsSync(targetPath)) {
      throw new Error(`Skill ${skill.name} already exists as a directory`);
    }

    // Create symlink to skill source (vendor pattern)
    symlinkSync(skill.path, targetPath);
  }

  async removeSkill(skillName: string): Promise<void> {
    const agentConfig = this.config.agents['opencode'];
    const skillPath = join(agentConfig.skillsPath, skillName);

    // Use lstatSync to check if the symlink/file itself exists (doesn't follow symlinks)
    if (!existsSync(skillPath) && !this.isSymlink(skillPath)) {
      return;
    }

    // Handle symlinks
    if (this.isSymlink(skillPath)) {
      unlinkSync(skillPath);
    } else {
      // Handle directories (customized or local skills)
      rmSync(skillPath, { recursive: true });
    }

    // Update manifest to remove from customized if present
    this.removeFromCustomized(skillName);
  }

  /**
   * Remove a skill from the customized array in manifest
   */
  removeFromCustomized(skillName: string): void {
    const manifestPath = this.getManifestPath();
    if (!existsSync(manifestPath)) {
      return;
    }

    try {
      const manifest = this.readManifest();
      if (manifest && Array.isArray((manifest as Record<string, unknown>).customized)) {
        const customized = (manifest as { customized: string[] }).customized;
        const index = customized.indexOf(skillName);
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
    const skills = installed ? await this.listSkills() : [];

    return {
      type: 'opencode',
      name: 'OpenCode',
      installed,
      configPath: agentConfig.configPath,
      skillsPath: agentConfig.skillsPath,
      skills: skills,
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
