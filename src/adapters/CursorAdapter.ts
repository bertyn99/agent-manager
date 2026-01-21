import { existsSync, readFileSync, writeFileSync } from 'fs-extra';
import { readJSON } from 'fs-extra';
import { AgentAdapter, AgentType, DetectedAgent, Skill } from '../types.js';
import { AgentManagerConfig } from '../config.js';

/**
 * Cursor Adapter
 * 
 * Manages skills via MCP servers in ~/.cursor/mcp.json
 * 
 * Supported formats:
 * - MCP HTTP servers (url-based)
 * - MCP command servers (command + args based)
 */
export class CursorAdapter implements AgentAdapter {
  readonly type: AgentType = 'cursor';
  readonly name = 'Cursor';
  
  constructor(private config: AgentManagerConfig) {}
  
  detect(): boolean {
    const agentConfig = this.config.agents['cursor'];
    return existsSync(agentConfig.configPath);
  }
  
  async listSkills(): Promise<Skill[]> {
    const agentConfig = this.config.agents['cursor'];
    
    if (!existsSync(agentConfig.configPath)) {
      return [];
    }
    
    try {
      const mcpConfig = await readJSON(agentConfig.configPath);
      const mcpServers = mcpConfig.mcpServers || {};
      
      return Object.entries(mcpServers).map(([name, cfg]) => ({
        name,
        type: 'mcp' as const,
        agent: 'cursor' as const,
        description: `MCP server: ${name}`,
        config: cfg as Record<string, unknown>,
        enabled: true,
      }));
    } catch {
      return [];
    }
  }
  
  async addSkill(skill: Skill): Promise<void> {
    const agentConfig = this.config.agents['cursor'];
    
    if (!skill.config) {
      throw new Error('Skill config is required for Cursor');
    }
    
    const mcpConfig = existsSync(agentConfig.configPath)
      ? await readJSON(agentConfig.configPath)
      : { mcpServers: {} };
    
    mcpConfig.mcpServers = mcpConfig.mcpServers || {};
    mcpConfig.mcpServers[skill.name] = skill.config;
    
    writeFileSync(
      agentConfig.configPath,
      JSON.stringify(mcpConfig, null, 2)
    );
  }
  
  async removeSkill(skillName: string): Promise<void> {
    const agentConfig = this.config.agents['cursor'];
    
    if (!existsSync(agentConfig.configPath)) {
      return;
    }
    
    const mcpConfig = await readJSON(agentConfig.configPath);
    delete mcpConfig.mcpServers?.[skillName];
    
    writeFileSync(
      agentConfig.configPath,
      JSON.stringify(mcpConfig, null, 2)
    );
  }
  
  async getAgentInfo(): Promise<DetectedAgent> {
    const agentConfig = this.config.agents['cursor'];
    const installed = this.detect();
    const skills = installed ? await this.listSkills() : [];
    
    return {
      type: 'cursor',
      name: 'Cursor',
      installed,
      configPath: agentConfig.configPath,
      skills: skills,
    };
  }
}
