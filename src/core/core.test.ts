// Core Tests - Config, Logger, and Utilities

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "pathe";
import { homedir } from "os";

// Mock logger before importing
vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    start: vi.fn(),
    fatal: vi.fn(),
    box: vi.fn(),
    prompt: vi.fn(),
  },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  start: vi.fn(),
  fatal: vi.fn(),
  box: vi.fn(),
  prompt: vi.fn(),
  createSilentLogger: vi.fn(),
  withSpinner: vi.fn(),
}));

describe("Config Module", () => {
  const testDir = join(homedir(), ".test-agent-manager");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("should export required functions", async () => {
    const { loadConfigSync, getDefaultConfig, ensureDirs, saveConfig } =
      await import("../core/config.js");

    expect(typeof loadConfigSync).toBe("function");
    expect(typeof getDefaultConfig).toBe("function");
    expect(typeof ensureDirs).toBe("function");
    expect(typeof saveConfig).toBe("function");
  });

  it("should return default config when no config file exists", async () => {
    const { loadConfigSync, getDefaultConfig } = await import("../core/config.js");

    const config = loadConfigSync("/nonexistent/path/config.json");
    const defaultConfig = getDefaultConfig();

    expect(config.home).toBeDefined();
    expect(config.manifestPath).toBeDefined();
    expect(config.skillsPath).toBeDefined();
    expect(config.vendorPath).toBeDefined();
    expect(config.agents).toBeDefined();
  });

  it("should load config from file if exists", async () => {
    const { loadConfigSync } = await import("../core/config.js");

    const testConfigPath = join(testDir, "test-skills.json");
    const testConfig = {
      home: testDir,
      manifestPath: join(testDir, "skills.yaml"),
      skillsPath: join(testDir, "skill"),
      vendorPath: join(testDir, "vendor"),
      agents: {
        "claude-code": {
          enabled: true,
          configPath: join(testDir, ".claude", "settings.json"),
        },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig));

    const loadedConfig = loadConfigSync(testConfigPath);

    expect(loadedConfig.home).toBe(testDir);
    expect(loadedConfig.agents["claude-code"]).toBeDefined();
  });
});

describe("Logger Module", () => {
  it("should export logger functions", async () => {
    const { logger, info, warn, error, success, debug, log, start } =
      await import("../utils/logger.js");

    expect(logger).toBeDefined();
    expect(typeof info).toBe("function");
    expect(typeof warn).toBe("function");
    expect(typeof error).toBe("function");
    expect(typeof success).toBe("function");
    expect(typeof debug).toBe("function");
    expect(typeof log).toBe("function");
    expect(typeof start).toBe("function");
  });

  it("should have createSilentLogger function", async () => {
    const { createSilentLogger } = await import("../utils/logger.js");

    // Function should exist
    expect(typeof createSilentLogger).toBe("function");
  });
});

describe("Git Utilities", () => {
  it("should export git functions", async () => {
    const { cloneRepo, parseRepoUrl, isValidRepo } = await import("./git.js");

    expect(typeof cloneRepo).toBe("function");
    expect(typeof parseRepoUrl).toBe("function");
    expect(typeof isValidRepo).toBe("function");
  });

  it("should parse GitHub URL correctly", async () => {
    const { parseRepoUrl } = await import("./git.js");

    const result = parseRepoUrl("https://github.com/owner/repo");

    expect(result.url).toBe("https://github.com/owner/repo");
    expect(result.org).toBe("owner");
    expect(result.repo).toBe("repo");
    expect(result.branch).toBe("main");
  });

  it("should parse SSH URL correctly", async () => {
    const { parseRepoUrl } = await import("./git.js");

    const result = parseRepoUrl("git@github.com:owner/repo.git");

    expect(result.org).toBe("owner");
    expect(result.repo).toBe("repo");
  });
});

describe("Extension Installer", () => {
  it("should export required functions", async () => {
    const { parseExtensionMd, parseExtensionJson, detectExtensionFormat, addExtension } =
      await import("../core/skill-installer.js");

    expect(typeof parseExtensionMd).toBe("function");
    expect(typeof parseExtensionJson).toBe("function");
    expect(typeof detectExtensionFormat).toBe("function");
    expect(typeof addExtension).toBe("function");
  });

  it("should parse EXTENSION.md frontmatter", async () => {
    const { parseExtensionMd } = await import("../core/skill-installer.js");

    const content = `---
name: test-extension
description: A test extension
version: 1.0.0
author: Test Author
---

# Test Extension
This is a test extension.
`;

    const frontmatter = parseExtensionMd(content);

    expect(frontmatter.name).toBe("test-extension");
    expect(frontmatter.description).toBe("A test extension");
    expect(frontmatter.version).toBe("1.0.0");
    expect(frontmatter.author).toBe("Test Author");
  });

  it("should parse extension.json", async () => {
    const { parseExtensionJson } = await import("../core/skill-installer.js");

    const json = JSON.stringify({
      name: "test-extension",
      description: "A test extension",
    });

    const result = parseExtensionJson(json);

    expect(result.name).toBe("test-extension");
    expect(result.description).toBe("A test extension");
  });
});

describe("Extension Remover", () => {
  it("should export removeExtension function", async () => {
    const { removeExtension } = await import("../core/skill-remover.js");

    expect(typeof removeExtension).toBe("function");
  });
});

describe("Extension Sync", () => {
  it("should export sync and upgrade functions", async () => {
    const { syncExtensions, upgradeExtension, upgradeAllExtensions } =
      await import("../core/skill-sync.js");

    expect(typeof syncExtensions).toBe("function");
    expect(typeof upgradeExtension).toBe("function");
    expect(typeof upgradeAllExtensions).toBe("function");
  });
});
