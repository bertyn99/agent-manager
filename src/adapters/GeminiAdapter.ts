import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, readFileSync as readFile } from 'fs-extra';
import { join } from 'pathe';
import { parse as parseToml } from 'destr';
import { AgentAdapter, AgentType, DetectedAgent, Skill } from '../types.js';
import { AgentManagerConfig } from '../config.js';

/**
 * Gemini CLI Adapter
 * 
 * Manages skills via:
 * - MCP servers in ~/.gemini/settings.json
 * - Commands in ~/.gemini/commands/*.toml
 * - Antigravity agents in ~/.gemini/antigravity/
 */
export class GeminiAdapter implements AgentAdapter {
  readonly type: AgentType = 'gemini-cli';
  readonly name = 'Gemini CLI';
  
  constructor(private config: AgentManagerConfig) {}
  
  detect(): boolean {
    const agentConfig = this.config.agents['gemini-cli'];
    return existsSync(agentConfig.configPath);
  }
  
  async listSkills(): Promise<Skill[]> {
    const agentConfig = this.config.agents['gemini-cli'];
    const skills: Skill[] = [];
    
    // List MCP servers from settings.json
    if (existsSync(agentConfig.configPath)) {
      try {
        const settings = JSON.parse(readFileSync(agentConfig.configPath, 'utf-8'));
        const mcpServers = settings.mcpServers || {};
        
        Object.entries(mcpServers).forEach(([name, cfg]) => {
          skills.push({
            name,
            type: 'mcp' as const,
            agent: 'gemini-cli' as const,
            description: `MCP server: ${name}`,
            config: cfg as Record<string, unknown>,
            enabled: true,
          });
        });
      } catch {
        // Ignore parse errors
      }
    }
    
    // List commands from commands/ directory
    const commandsPath = agentConfig.skillsPath;
    if (commandsPath && existsSync(commandsPath)) {
      for (const file of readdirSync(commandsPath)) {
        if (file.endsWith('.toml')) {
          try {
            const content = readFile(join(commandsPath, file), 'utf-8');
            const toml = parseToml(content);
            
            skills.push({
              name: file.replace('.toml', ''),
              type: 'command' as const,
              agent: 'gemini-cli' as const,
              description: toml.description as string || 'Gemini command',
              config: toml as Record<string, unknown>,
              enabled: true,
            });
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
    
    return skills;
  }
  
  async addSkill(skill: Skill): Promise<void> {
    const agentConfig = this.config.agents['gemini-cli'];
    
    // Add MCP server to settings.json
    if (skill.type === 'mcp' && skill.config) {
      const settings = existsSync(agentConfig.configPath)
        ? JSON.parse(readFileSync(agentConfig.configPath, 'utf-8'))
        : { mcpServers: {} };
      
      settings.mcpServers = settings.mcpServers || {};
      settings.mcpServers[skill.name] = skill.config;
      
      writeFileSync(
        agentConfig.configPath,
        JSON.stringify(settings, null, 2)
      );
    }
    
    // Add command to commands/ directory
    if (skill.type === 'command' && skill.config) {
      const commandsPath = agentConfig.skillsPath;
      if (!commandsPath) {
        throw new Error('Gemini commands path not configured');
      }
      
      const commandToml = generateGeminiCommandToml(skill);
      const filePath = join(commandsPath, `${skill.name}.toml`);
      writeFileSync(filePath, commandToml);
    }
  }
  
  async removeSkill(skillName: string): Promise<void> {
    const agentConfig = this.config.agents['gemini-cli'];
    
    // Remove MCP server from settings.json
    if (existsSync(agentConfig.configPath)) {
      try {
        const settings = JSON.parse(readFileSync(agentConfig.configPath, 'utf-8'));
        delete settings.mcpServers?.[skillName];
        writeFileSync(agentConfig.configPath, JSON.stringify(settings, null, 2));
      } catch {
        // Ignore parse errors
      }
    }
    
    // Remove command from commands/ directory
    const commandsPath = agentConfig.skillsPath;
    if (commandsPath) {
      const commandPath = join(commandsPath, `${skillName}.toml`);
      if (existsSync(commandPath)) {
        unlinkSync(commandPath);
      }
    }
  }
  
  async getAgentInfo(): Promise<DetectedAgent> {
    const agentConfig = this.config.agents['gemini-cli'];
    const installed = this.detect();
    const skills = installed ? await this.listSkills() : [];
    
    return {
      type: 'gemini-cli',
      name: 'Gemini CLI',
      installed,
      configPath: agentConfig.configPath,
      skillsPath: agentConfig.skillsPath,
      skills: skills,
    };
  }
}

// Helper function to generate Gemini command TOML
function generateGeminiCommandToml(skill: Skill): string {
  const config = skill.config || {};
  
  let toml = '';
  
  if (config.description) {
    toml += `description = "${config.description}"\n`;
  }
  
  if (config.prompt) {
    toml += `\nprompt = """\n${config.prompt}\n"""\n`;
  }
  
  if (config.args && Array.isArray(config.args) && config.args.length > 0) {
    toml += `\nargs = [${config.args.map(a => `"${a}"`).join(', ')}]\n`;
  }
  
  if (config.totalBudget) {
    toml += `\ntotalBudget = ${config.totalBudget}\n`;
  }
  
  return toml;
}