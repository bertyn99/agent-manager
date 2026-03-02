import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join, basename } from "pathe";
import { parse as parseToml } from "smol-toml";
import type { AgentType } from "./types.js";
import { validateGeminiCommand } from "./validators.js";

export interface CommandConfig {
  name: string;
  description?: string;
  prompt: string;
  args?: string[];
  totalBudget?: number;
  output?: "text" | "json" | "streaming";
}

export interface CommandOperationResult {
  success: boolean;
  name: string;
  agent?: AgentType;
  warnings?: string[];
  error?: string;
}

/**
 * CommandManager - Consolidates all Gemini CLI command operations
 * Handles TOML parsing, generation, validation, and special feature detection
 */
export class CommandManager {
  /**
   * Parse a TOML file into a CommandConfig
   * Returns validation result with warnings for special features
   */
  parseCommandFile(tomlPath: string): CommandConfig & { warnings: string[] } {
    const content = readFileSync(tomlPath, "utf-8");
    const toml = parseToml(content);

    const validation = validateGeminiCommand(toml);

    if (!validation.valid) {
      throw new Error(`Invalid command file: ${validation.errors.join(", ")}`);
    }

    return {
      name: basename(tomlPath).replace(".toml", ""),
      description: validation.data?.description,
      prompt: validation.data?.prompt || "",
      args: validation.data?.args,
      totalBudget: validation.data?.totalBudget,
      output: validation.data?.output,
      warnings: validation.warnings,
    };
  }

  /**
   * Parse TOML content directly
   */
  parseCommandContent(content: string, name: string): CommandConfig & { warnings: string[] } {
    const toml = parseToml(content);
    const validation = validateGeminiCommand(toml);

    if (!validation.valid) {
      throw new Error(`Invalid command: ${validation.errors.join(", ")}`);
    }

    return {
      name,
      description: validation.data?.description,
      prompt: validation.data?.prompt || "",
      args: validation.data?.args,
      totalBudget: validation.data?.totalBudget,
      output: validation.data?.output,
      warnings: validation.warnings,
    };
  }

  /**
   * Generate TOML content from a CommandConfig
   */
  toToml(config: CommandConfig): string {
    const lines: string[] = [];

    if (config.description) {
      lines.push(`description = "${this.escapeTomlString(config.description)}"`);
    }

    if (config.prompt) {
      lines.push("");
      lines.push('prompt = """');
      lines.push(this.escapeTomlString(config.prompt));
      lines.push('"""');
    }

    if (config.args && config.args.length > 0) {
      lines.push("");
      lines.push(`args = [${config.args.map((a) => `"${this.escapeTomlString(a)}"`).join(", ")}]`);
    }

    if (config.totalBudget !== undefined) {
      lines.push("");
      lines.push(`totalBudget = ${config.totalBudget}`);
    }

    if (config.output) {
      lines.push("");
      lines.push(`output = "${config.output}"`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Add a command to a specific agent
   */
  addCommand(
    config: CommandConfig,
    agentType: AgentType,
    commandsPath: string,
  ): CommandOperationResult {
    const result: CommandOperationResult = {
      success: false,
      name: config.name,
      agent: agentType,
    };

    try {
      // Validate the command
      const validation = validateGeminiCommand({
        description: config.description,
        prompt: config.prompt,
        args: config.args,
        totalBudget: config.totalBudget,
        output: config.output,
      });

      if (!validation.valid) {
        result.error = validation.errors.join(", ");
        return result;
      }

      // Generate TOML
      const toml = this.toToml(config);

      // Ensure directory exists
      mkdirSync(commandsPath, { recursive: true });

      // Write command file
      const filePath = join(commandsPath, `${config.name}.toml`);
      writeFileSync(filePath, toml);

      result.success = true;
      result.warnings = validation.warnings;
    } catch (error) {
      result.error = String(error);
    }

    return result;
  }

  /**
   * Remove a command from a specific agent
   */
  removeCommand(name: string, agentType: AgentType, commandsPath: string): CommandOperationResult {
    const result: CommandOperationResult = {
      success: false,
      name,
      agent: agentType,
    };

    try {
      const filePath = join(commandsPath, `${name}.toml`);

      if (existsSync(filePath)) {
        unlinkSync(filePath);
        result.success = true;
      } else {
        result.error = `Command file not found: ${filePath}`;
      }
    } catch (error) {
      result.error = String(error);
    }

    return result;
  }

  /**
   * List all commands in a directory
   */
  listCommands(commandsPath: string): Array<CommandConfig & { warnings: string[] }> {
    const commands: Array<CommandConfig & { warnings: string[] }> = [];

    if (!existsSync(commandsPath)) {
      return commands;
    }

    for (const file of readdirSync(commandsPath)) {
      if (file.endsWith(".toml")) {
        try {
          const command = this.parseCommandFile(join(commandsPath, file));
          commands.push(command);
        } catch {
          // Skip invalid command files
        }
      }
    }

    return commands;
  }

  /**
   * Detect special features in a prompt and return warnings
   */
  detectSpecialFeatures(prompt: string): string[] {
    const warnings: string[] = [];

    const shellMatches = prompt.match(/!\{[^}]+\}/g);
    if (shellMatches) {
      warnings.push(`Shell command detected: ${shellMatches[0]} - will require user confirmation`);
    }

    const fileMatches = prompt.match(/@\{[^}]+\}/g);
    if (fileMatches) {
      warnings.push(`File injection detected: ${fileMatches[0]} - files will be read into context`);
    }

    return warnings;
  }

  /**
   * Escape special characters in a TOML string
   */
  private escapeTomlString(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }
}

// Export singleton instance for convenience
export const commandManager = new CommandManager();
