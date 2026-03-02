// TransportValidator - Validates MCP server configurations before storage

export type TransportType = "http" | "command" | "sse" | "websocket";

export interface MCPServerConfig {
  type: TransportType;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
  envFile?: string;
  timeout?: number;
  sseEndpoint?: string;
  websocketEndpoint?: string;
}

export interface TransportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * TransportValidator - Validates MCP server configurations
 * Ensures configs are valid before being stored in agent config files
 */
export class TransportValidator {
  /**
   * Validate a complete MCP server config
   */
  validate(config: MCPServerConfig): TransportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate transport type
    if (!config.type) {
      errors.push("Transport type is required");
      return { valid: false, errors, warnings };
    }

    // Validate based on transport type
    switch (config.type) {
      case "http":
        this.validateHttp(config, errors, warnings);
        break;
      case "command":
        this.validateCommand(config, errors, warnings);
        break;
      case "sse":
        this.validateSSE(config, errors, warnings);
        break;
      case "websocket":
        this.validateWebSocket(config, errors, warnings);
        break;
      default:
        errors.push(`Unknown transport type: ${config.type}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate HTTP transport configuration
   */
  private validateHttp(config: MCPServerConfig, errors: string[], warnings: string[]): void {
    if (!config.url) {
      errors.push("HTTP transport requires a URL");
      return;
    }

    // Validate URL format
    try {
      new URL(config.url);
    } catch {
      errors.push(`Invalid URL format: ${config.url}`);
    }

    // Check for http vs https
    if (!config.url.startsWith("https://")) {
      warnings.push("Using HTTP instead of HTTPS - data may be transmitted unencrypted");
    }

    // Validate headers if present
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        if (!key || !value) {
          errors.push("Header keys and values must be non-empty strings");
        }
        if (key.toLowerCase() === "authorization" && !value.startsWith("Bearer ")) {
          warnings.push("Authorization header detected - ensure token is properly secured");
        }
      }
    }

    // Timeout validation
    if (config.timeout !== undefined && config.timeout < 0) {
      errors.push("Timeout must be a positive number");
    }
  }

  /**
   * Validate command transport configuration
   */
  private validateCommand(config: MCPServerConfig, errors: string[], warnings: string[]): void {
    if (!config.command) {
      errors.push("Command transport requires a command");
      return;
    }

    // Check for dangerous patterns in command
    if (config.command.includes("rm -rf") || config.command.includes("del /")) {
      errors.push("Command contains dangerous operations - refusing to store");
      return;
    }

    // Warn about potential security concerns
    if (config.command.includes("sudo") || config.command.includes("admin")) {
      warnings.push("Command requires elevated privileges - ensure this is intentional");
    }

    // Validate args if present
    if (config.args) {
      for (const arg of config.args) {
        if (arg.includes(";") || arg.includes("&&") || arg.includes("||")) {
          warnings.push("Arguments contain shell operators - ensure this is intentional");
        }
      }
    }

    // Check for envFile
    if (config.envFile) {
      if (!config.envFile.startsWith("~/") && !config.envFile.startsWith("/")) {
        warnings.push("envFile path should be absolute or start with ~");
      }
    }
  }

  /**
   * Validate SSE transport configuration
   */
  private validateSSE(config: MCPServerConfig, errors: string[], warnings: string[]): void {
    // SSE can use either url or sseEndpoint
    const endpoint = config.url || config.sseEndpoint;

    if (!endpoint) {
      errors.push("SSE transport requires a URL or sseEndpoint");
      return;
    }

    // Validate URL format
    try {
      new URL(endpoint);
    } catch {
      errors.push(`Invalid SSE endpoint URL: ${endpoint}`);
    }

    // SSE typically uses GET
    if (config.headers?.["method"]?.toUpperCase() !== "GET") {
      warnings.push("SSE typically uses GET method - current config may not work as expected");
    }
  }

  /**
   * Validate WebSocket transport configuration
   */
  private validateWebSocket(config: MCPServerConfig, errors: string[], warnings: string[]): void {
    // WebSocket can use either url or websocketEndpoint
    const endpoint = config.url || config.websocketEndpoint;

    if (!endpoint) {
      errors.push("WebSocket transport requires a URL or websocketEndpoint");
      return;
    }

    // Validate WebSocket URL format (ws:// or wss://)
    if (!endpoint.startsWith("ws://") && !endpoint.startsWith("wss://")) {
      errors.push(`WebSocket URL must use ws:// or wss:// protocol: ${endpoint}`);
      return;
    }

    try {
      new URL(endpoint);
    } catch {
      errors.push(`Invalid WebSocket URL: ${endpoint}`);
    }

    // Warn about unencrypted WebSocket
    if (endpoint.startsWith("ws://")) {
      warnings.push("Using unencrypted WebSocket (ws://) - data may be transmitted unencrypted");
    }
  }

  /**
   * Validate just the transport type
   */
  validateTransportType(type: string): TransportValidationResult {
    const validTypes: TransportType[] = ["http", "command", "sse", "websocket"];

    if (!type) {
      return {
        valid: false,
        errors: ["Transport type is required"],
        warnings: [],
      };
    }

    if (!validTypes.includes(type as TransportType)) {
      return {
        valid: false,
        errors: [`Invalid transport type: ${type}. Valid types: ${validTypes.join(", ")}`],
        warnings: [],
      };
    }

    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Create a config object from raw input with validation
   */
  createConfig(input: {
    type: TransportType;
    url?: string;
    command?: string;
    args?: string[];
    headers?: Record<string, string>;
    env?: Record<string, string>;
    envFile?: string;
    timeout?: number;
    sseEndpoint?: string;
    websocketEndpoint?: string;
  }): { config: MCPServerConfig | null; result: TransportValidationResult } {
    const config: MCPServerConfig = {
      type: input.type,
      url: input.url,
      command: input.command,
      args: input.args,
      headers: input.headers,
      env: input.env,
      envFile: input.envFile,
      timeout: input.timeout,
      sseEndpoint: input.sseEndpoint,
      websocketEndpoint: input.websocketEndpoint,
    };

    const result = this.validate(config);

    return {
      config: result.valid ? config : null,
      result,
    };
  }
}

// Export singleton instance
export const transportValidator = new TransportValidator();
