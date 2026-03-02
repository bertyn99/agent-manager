// Skill Sync Module Tests

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentManagerConfig, AgentType } from "./types.js";

const mockListExtensions = vi.fn();
const mockDetect = vi.fn();
const mockGetAdapter = vi.fn();

function createMockConfig(): AgentManagerConfig {
  return {
    home: "/mock/config/agent-manager",
    manifestPath: "/mock/config/agent-manager/manifest.yaml",
    skillsPath: "/mock/config/agent-manager/skill",
    vendorPath: "/mock/config/agent-manager/vendor",
    agents: {
      "claude-code": {
        enabled: true,
        configPath: "/mock/.claude/settings.json",
        skillsPath: "/mock/.claude/skills",
      },
      cursor: {
        enabled: true,
        configPath: "/mock/.cursor/mcp.json",
        skillsPath: "/mock/.cursor/skills",
      },
      "gemini-cli": {
        enabled: true,
        configPath: "/mock/.gemini/settings.json",
        skillsPath: "/mock/.gemini/commands",
      },
      opencode: {
        enabled: true,
        configPath: "/mock/.config/opencode/skills.yaml",
        skillsPath: "/mock/.config/opencode/skill",
      },
      "vscode-copilot": { enabled: true, configPath: "/mock/.vscode/copilot-agents.json" },
      "openai-codex": { enabled: true, configPath: "/mock/.codex/config.json" },
    },
  };
}

vi.mock("../adapters/index.js", () => ({
  createAgentRegistry: vi.fn(() => ({
    detect: mockDetect,
    getAdapter: mockGetAdapter,
    listAllExtensions: mockListExtensions,
  })),
}));

vi.mock("./manifest.js", () => ({
  readManifest: vi.fn(() => ({
    skills: [],
  })),
  readManifestV2: vi.fn(() => ({
    version: "2.0.0",
    updated: new Date().toISOString(),
    origins: [],
    skills: [],
    mcpServers: [],
    commands: [],
  })),
  writeManifestV2: vi.fn(),
  getSkillInOrigin: vi.fn(() => null),
  addExtensionToManifest: vi.fn(),
}));

// Mock node:fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

// Mock skill-installer to avoid file system operations
vi.mock("./skill-installer.js", () => ({
  detectExtensionFormat: vi.fn((path: string) => {
    if (path.includes("/some/path") || path.includes("/nonexistent")) {
      return {
        name: "test-skill",
        description: "A test skill",
        formats: {
          agentSkills: { enabled: true, path: "SKILL.md" },
        },
      };
    }
    return null;
  }),
}));

describe("SkillSync", () => {
  let syncExtensions: (
    config: AgentManagerConfig,
    options: { dryRun?: boolean; from?: AgentType[]; to?: AgentType[] },
  ) => Promise<{
    success: boolean;
    synced: number;
    skipped: number;
    failed: number;
    added: string[];
    details: string[];
  }>;
  let upgradeExtension: (
    extensionName: string,
    config: AgentManagerConfig,
    options: { force?: boolean },
  ) => Promise<{ success: boolean; message: string }>;
  let upgradeAllExtensions: (
    config: AgentManagerConfig,
    options: { force?: boolean },
  ) => Promise<{ success: boolean; upgraded: number; failed: number }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("./skill-sync.js");
    syncExtensions = module.syncExtensions;
    upgradeExtension = module.upgradeExtension;
    upgradeAllExtensions = module.upgradeAllExtensions;

    // Default mock implementations
    mockDetect.mockReturnValue([]);
    mockGetAdapter.mockReturnValue({
      detect: mockDetect,
      listExtensions: mockListExtensions,
      addExtension: vi.fn().mockResolvedValue(undefined),
    });
    mockListExtensions.mockResolvedValue([]);
    mockExistsSync.mockReturnValue(true);
  });

  describe("syncExtensions", () => {
    it("should return no agents detected when none are detected", async () => {
      mockDetect.mockReturnValue([]);

      const config = createMockConfig();
      const result = await syncExtensions(config, {});

      expect(result.success).toBe(false);
      expect(result.details).toContain("No agents detected");
    });

    it("should skip extension if source path not found", async () => {
      mockExistsSync.mockReturnValue(false);

      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([
          {
            name: "test-skill",
            type: "skill" as const,
            agent: "claude-code",
            path: "/nonexistent/path",
          },
        ]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(["claude-code", "cursor"] as AgentType[]);

      const result = await syncExtensions(config, {
        from: ["claude-code"] as AgentType[],
        to: ["cursor"] as AgentType[],
      });

      expect(result.failed).toBe(1);
      expect(result.details.some((d) => d.includes("source path not found"))).toBe(true);
    });

    it("should skip agent if not compatible with extension format", async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([
          {
            name: "test-skill",
            type: "mcp" as const,
            agent: "claude-code",
            config: { command: "test" },
          },
        ]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(["claude-code", "vscode-copilot"] as AgentType[]);

      // VS Code Copilot doesn't support MCP format (no mcp.enabled)
      const result = await syncExtensions(config, {
        from: ["claude-code"] as AgentType[],
        to: ["vscode-copilot"] as AgentType[],
      });

      expect(result.skipped).toBe(1);
      expect(result.details.some((d) => d.includes("doesn't support this format"))).toBe(true);
    });

    it("should not install in dry run mode", async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([
          {
            name: "test-skill",
            type: "skill" as const,
            agent: "claude-code",
            path: "/some/path",
          },
        ]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(["claude-code", "cursor"] as AgentType[]);

      const result = await syncExtensions(config, {
        dryRun: true,
        from: ["claude-code"] as AgentType[],
        to: ["cursor"] as AgentType[],
      });

      expect(mockAdapter.addExtension).not.toHaveBeenCalled();
    });

    it("should install extension to target agent", async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([
          {
            name: "test-skill",
            type: "skill" as const,
            agent: "claude-code",
            path: "/some/path",
          },
        ]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(["claude-code", "cursor"] as AgentType[]);

      const result = await syncExtensions(config, {
        from: ["claude-code"] as AgentType[],
        to: ["cursor"] as AgentType[],
      });

      expect(result.added).toContain("cursor");
      expect(mockAdapter.addExtension).toHaveBeenCalled();
    });

    it("should skip duplicate extensions from same source", async () => {
      const config = createMockConfig();
      const mockAdapter = {
        detect: () => true,
        listExtensions: vi.fn().mockResolvedValue([
          { name: "test-skill", type: "skill" as const, agent: "claude-code", path: "/some/path" },
          { name: "test-skill", type: "skill" as const, agent: "cursor", path: "/some/path" },
        ]),
        addExtension: vi.fn().mockResolvedValue(undefined),
      };
      mockGetAdapter.mockReturnValue(mockAdapter);
      mockDetect.mockReturnValue(["claude-code", "cursor"] as AgentType[]);

      const result = await syncExtensions(config, {
        from: ["claude-code", "cursor"] as AgentType[],
        to: ["opencode"] as AgentType[],
      });

      // Should only attempt to install once (deduplicated by name)
      expect(mockAdapter.addExtension).toHaveBeenCalledTimes(1);
    });
  });

  describe("upgradeExtension", () => {
    it("should return not found for non-existent extension", async () => {
      const config = createMockConfig();
      const result = await upgradeExtension("test-skill", config, {});

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found in manifest");
    });

    it("should handle manifest with standalone skills (no skills array)", async () => {
      // Manifest with Type B entry (standalone skill without skills array)
      const { readManifest } = await import("./manifest.js");
      vi.mocked(readManifest).mockReturnValueOnce({
        version: "2.0.0",
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          // Type A: normal group with skills array
          {
            origin: "https://github.com/test/repo",
            path: "skills",
            branch: "main",
            include: [],
            exclude: [],
            skills: [
              { name: "test-skill", folderName: "test-skill", agents: [], description: "Test" },
            ],
          },
          // Type B: standalone skill (no skills array - just properties directly)
          {
            name: "standalone-skill",
            description: "A standalone skill",
            installedAt: new Date().toISOString(),
            source: { repo: "https://github.com/test/repo2", commit: "abc123", path: "extensions" },
            agents: [{ agent: "claude-code" as AgentType, installedAt: new Date().toISOString() }],
          },
        ],
        commands: {},
      });

      const config = createMockConfig();
      // Should not throw TypeError when searching for a skill
      const result = await upgradeExtension("test-skill", config, {});
      // Should find the skill and proceed (may fail for other reasons like no repo access)
      expect(result).toBeDefined();
      expect(result).toHaveProperty("success");
    });

    it("should not crash when skills array is undefined", async () => {
      const { readManifest } = await import("./manifest.js");
      vi.mocked(readManifest).mockReturnValueOnce({
        version: "2.0.0",
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          // Entry with skills: undefined (missing property)
          { origin: "test", path: "skills", branch: "main", include: [], exclude: [] },
        ],
        commands: {},
      });

      const config = createMockConfig();
      // Should not throw TypeError
      const result = await upgradeExtension("nonexistent", config, {});
      expect(result.success).toBe(false);
    });

    it("should not crash when skills array contains null/undefined entries", async () => {
      const { readManifest } = await import("./manifest.js");
      vi.mocked(readManifest).mockReturnValueOnce({
        version: "2.0.0",
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          {
            origin: "test",
            path: "skills",
            branch: "main",
            include: [],
            exclude: [],
            skills: [
              null as unknown as { name: string; folderName: string; agents: AgentType[] },
              undefined as unknown as { name: string; folderName: string; agents: AgentType[] },
              { name: "valid-skill", folderName: "valid", agents: [], description: "Valid" },
            ],
          },
        ],
        commands: {},
      });

      const config = createMockConfig();
      // Should skip null/undefined and find valid skill
      const result = await upgradeExtension("valid-skill", config, {});
      expect(result).toBeDefined();
      expect(result).toHaveProperty("success");
    });
  });

  describe("upgradeAllExtensions", () => {
    it("should return success when no extensions to upgrade", async () => {
      const config = createMockConfig();
      const result = await upgradeAllExtensions(config, {});

      // With no skills installed to any agents, result.success should be true (0 failed)
      expect(result.success).toBe(true);
      expect(result.upgraded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should handle manifest with mixed Type A and Type B entries without crashing", async () => {
      // This is a regression test for the bug where upgradeAllExtensions crashed
      // when processing a manifest with both Type A (skills array) and
      // Type B (standalone skills without skills array) entries.
      //
      // The crash occurred at line 251-252 in skill-sync.ts:
      //   .flatMap(g => g.skills)
      // which failed for Type B entries that don't have a 'skills' property.
      const { readManifest } = await import("./manifest.js");
      vi.mocked(readManifest).mockReturnValueOnce({
        version: "2.0.0",
        updated: new Date().toISOString(),
        mcp: {},
        skills: [
          // Type A: normal group with skills array
          {
            origin: "https://github.com/test/repo",
            path: "skills",
            branch: "main",
            include: [],
            exclude: [],
            skills: [
              { name: "skill-a", folderName: "skill-a", agents: [], description: "Skill A" },
              { name: "skill-b", folderName: "skill-b", agents: [], description: "Skill B" },
            ],
          },
          // Type B: standalone skill (no skills array)
          {
            name: "standalone-skill",
            description: "A standalone skill",
            installedAt: new Date().toISOString(),
            source: { repo: "https://github.com/test/repo2", commit: "abc123", path: "extensions" },
            agents: [{ agent: "claude-code" as AgentType, installedAt: new Date().toISOString() }],
          },
          // Another Type A
          {
            origin: "https://github.com/test/repo3",
            path: "packages",
            branch: "main",
            include: [],
            exclude: [],
            skills: [
              { name: "skill-c", folderName: "skill-c", agents: [], description: "Skill C" },
            ],
          },
        ],
        commands: {},
      });

      const config = createMockConfig();
      // Should not throw TypeError when processing mixed manifest
      const result = await upgradeAllExtensions(config, {});
      // Should return a result object (not crash)
      expect(result).toBeDefined();
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("upgraded");
      expect(result).toHaveProperty("failed");
    });
  });
});
