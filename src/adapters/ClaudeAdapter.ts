import { existsSync, readFileSync, writeFileSync } from 'fs-extra';
import { readJSON } from 'fs-extra';
import { AgentAdapter, AgentType, DetectedAgent, Skill } from '../types.js';
import { AgentManagerConfig } from '../config.js';

/**
 * Claude Code Adapter
 * 
 * Manages skills via MCP servers in ~/.claude/settings.json
 * 
 * Supported formats:
 * - MCP HTTP servers (url-based)
 * - MCP command servers (command + args based)
 */
export class ClaudeAdapter implements AgentAdapter {
  readonly type: AgentType = 'claude-code';
  readonly name = 'Claude Code';
  
  constructor(private config: AgentManagerConfig) {}
  
  detect(): boolean {
    const agentConfig = this.config.agents['claude-code'];
    return existsSync(agentConfig.configPath);
  }
  
  async listSkills(): Promise<Skill[]> {
    const agentConfig = this.config.agents['claude-code'];
    
    if (!existsSync(agentConfig.configPath)) {
      return [];
    }
    
    try {
      const settings = await readJSON(agentConfig.configPath);
      const mcpServers = settings.mcpServers || {};
      
      return Object.entries(mcpServers).map(([name, cfg]) => ({
        name,
        type: 'mcp' as const,
        agent: 'claude-code' as const,
        description: `MCP server: ${name}`,
        config: cfg as Record<string, unknown>,
        enabled: true,
      }));
    } catch {
      return [];
    }
  }
  
  async addSkill(skill: Skill): Promise<void> {
    const agentConfig = this.config.agents['claude-code'];
    
    if (!skill.config) {
      throw new Error('Skill config is required for Claude Code');
    }
    
    const settings = existsSync(agentConfig.configPath)
      ? await readJSON(agentConfig.configPath)
      : { mcpServers: {} };
    
    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers[skill.name] = skill.config;
    
    writeFileSync(
      agentConfig.configPath,
      JSON.stringify(settings, null, 2)
    );
  }
  
  async removeSkill(skillName: string): Promise<void> {
    const agentConfig = this.config.agents['claude-code'];
    
    if (!existsSync(agentConfig.configPath)) {
      return;
    }
    
    const settings = await readJSON(agentConfig.configPath);
    delete settings.mcpServers?.[skillName];
    
    writeFileSync(
      agentConfig.configPath,
      JSON.stringify(settings, null, 2)
    );
  }
  
  async getAgentInfo(): Promise<DetectedAgent> {
    const agentConfig = this.config.agents['claude-code'];
    const installed = this.detect();
    const skills = installed ? await this.listSkills() : [];
    
    return {
      type: 'claude-code',
      name: 'Claude Code',
      installed,
      configPath: agentConfig.configPath,
      skills: skills,
    };
  }
}
