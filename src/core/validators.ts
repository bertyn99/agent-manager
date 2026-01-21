import { z } from 'zod';

// Skill manifest schema (Agent Skills Spec)
export const AgentSkillsFrontmatterSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  'allowed-tools': z.string().optional(),
});

// Unified skill manifest schema
export const UnifiedSkillSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  
  formats: z.object({
    agentSkills: z.object({
      enabled: z.boolean(),
      path: z.string(),
    }).optional(),
    
    mcp: z.object({
      enabled: z.boolean(),
      type: z.enum(['http', 'command', 'sse', 'websocket']),
      url: z.string().url().optional(),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      sseEndpoint: z.string().optional(),
      websocketEndpoint: z.string().optional(),
    }).optional(),
    
    geminiCommand: z.object({
      enabled: z.boolean(),
      name: z.string(),
      description: z.string(),
    }).optional(),
    
    geminiAgent: z.object({
      enabled: z.boolean(),
      name: z.string(),
      brain: z.string().optional(),
    }).optional(),
    
    vscode: z.object({
      enabled: z.boolean(),
      id: z.string().optional(),
      marketplace: z.string().optional(),
      vsix: z.string().optional(),
    }).optional(),
    
    codex: z.object({
      enabled: z.boolean(),
      format: z.string().optional(),
    }).optional(),
  }),
  
  content: z.object({
    readme: z.string().optional(),
    prompt: z.string().optional(),
    references: z.array(z.string()).optional(),
    scripts: z.array(z.string()).optional(),
    assets: z.array(z.string()).optional(),
  }).optional(),
  
  source: z.object({
    type: z.enum(['git', 'local', 'http']),
    repo: z.string().optional(),
    path: z.string().optional(),
    pinned: z.string().nullable().optional(),
  }).optional(),
});

// Gemini command TOML schema
export const GeminiCommandSchema = z.object({
  description: z.string(),
  prompt: z.string().optional(),
  args: z.array(z.string()).optional(),
  totalBudget: z.number().optional(),
  output: z.enum(['text', 'json', 'streaming']).optional(),
});

// Gemini command validation with special feature detection
export interface GeminiCommandValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data?: {
    description: string;
    prompt?: string;
    args?: string[];
    totalBudget?: number;
    output?: 'text' | 'json' | 'streaming';
  };
}

// Special feature patterns in Gemini commands
const SHELL_COMMAND_PATTERN = /!\{[^}]+\}/g;
const FILE_INJECTION_PATTERN = /@\{[^}]+\}/g;

// Manifest source schema
export const ManifestSourceSchema = z.object({
  repo: z.string(),
  path: z.string(),
  nested: z.boolean().default(false),
  branch: z.string().default('main'),
  pinned: z.string().nullable().optional(),
  include: z.array(z.string()).default(['*']),
  exclude: z.array(z.string()).default([]),
});

// Skills manifest schema
export const SkillsManifestSchema = z.object({
  sources: z.array(ManifestSourceSchema).default([]),
  customized: z.array(z.string()).default([]),
  local: z.array(z.string()).default([]),
  disabled: z.array(z.string()).default([]),
  upgraded: z.array(z.string()).default([]),
});

// Validation functions
export function validateAgentSkillsFrontmatter(
  frontmatter: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const result = AgentSkillsFrontmatterSchema.safeParse(frontmatter);
  
  if (result.success) {
    return { valid: true, errors: [] };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map(e => 
      `${e.path.join('.')}: ${e.message}`
    ),
  };
}

export function validateUnifiedSkill(
  skill: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const result = UnifiedSkillSchema.safeParse(skill);
  
  if (result.success) {
    return { valid: true, errors: [] };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map(e =>
      `${e.path.join('.')}: ${e.message}`
    ),
  };
}

export function validateGeminiCommand(
  toml: Record<string, unknown>
): GeminiCommandValidation {
  const result = GeminiCommandSchema.safeParse(toml);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(e =>
        `${e.path.join('.')}: ${e.message}`
      ),
      warnings: [],
    };
  }

  // Detect special features and generate warnings
  const warnings: string[] = [];
  const prompt = result.data.prompt;

  if (prompt) {
    const shellMatches = prompt.match(SHELL_COMMAND_PATTERN);
    if (shellMatches) {
      warnings.push(
        `Shell command (${shellMatches[0]}) detected - will require user confirmation before execution`
      );
    }

    const fileMatches = prompt.match(FILE_INJECTION_PATTERN);
    if (fileMatches) {
      warnings.push(
        `File injection (${fileMatches[0]}) detected - files will be read and included in context`
      );
    }
  }

  return {
    valid: true,
    errors: [],
    warnings,
    data: result.data,
  };
}
