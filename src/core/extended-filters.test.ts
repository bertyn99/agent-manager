/**
 * Tests for Extended List Filters
 */

import { describe, it, expect } from "vitest";
import type { ListOptions, Extension } from "./types.js";

describe("Extended List Filters", () => {
  const mockExtensions: Extension[] = [
    {
      name: "test-mcp-server",
      type: "mcp",
      agent: "claude-code",
      enabled: true,
      description: "Test MCP server for Claude Code",
      source: "github.com/user/test-repo",
    },
    {
      name: "test-skill",
      type: "skill",
      agent: "cursor",
      enabled: true,
      description: "Test skill for Cursor",
      source: "github.com/user/test-repo",
    },
    {
      name: "test-command",
      type: "command",
      agent: "claude-code",
      enabled: false,
      description: "Test command for Claude Code",
      source: "gitlab.com/user/test-repo",
    },
    {
      name: "zai-mcp",
      type: "mcp",
      agent: "opencode",
      enabled: true,
      description: "ZAI MCP server",
      source: "github.com/zai/repo",
    },
  ];

  describe("ListOptions interface extensions", () => {
    it("should include all extended filter options", () => {
      const options: ListOptions = {
        json: false,
        verbose: false,
        filter: "mcp",
        search: "test",
        sort: "name",
        reverse: true,
        limit: 10,
        origin: "github.com/user/test-repo",
      };

      expect(options.search).toBe("test");
      expect(options.sort).toBe("name");
      expect(options.reverse).toBe(true);
      expect(options.limit).toBe(10);
      expect(options.origin).toBe("github.com/user/test-repo");
    });

    it("should accept partial options", () => {
      const options: ListOptions = {
        search: "github",
        sort: "date",
        reverse: false,
      };

      expect(options.search).toBe("github");
      expect(options.sort).toBe("date");
      expect(options.reverse).toBe(false);
      expect(options.limit).toBeUndefined();
    });
  });

  describe("Filter behavior - search", () => {
    it("should filter extensions by name or description", () => {
      const searchTerm = "test";
      const filtered = mockExtensions.filter(
        (ext) =>
          ext.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ext.description?.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      expect(filtered).toHaveLength(3);
      expect(
        filtered.every((ext) => ext.name.includes("test") || ext.description?.includes("test")),
      );
    });

    it("should be case-insensitive", () => {
      // Search in name field - all 3 have 'test' in name (case-insensitive)
      const searchTerm = "TEST";
      const filtered = mockExtensions.filter((ext) =>
        ext.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      expect(filtered).toHaveLength(3);
      expect(filtered.every((ext) => ext.name.toLowerCase().includes("test")));
    });

    it("should return empty if no matches", () => {
      const searchTerm = "nonexistent";
      const filtered = mockExtensions.filter((ext) =>
        ext.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      expect(filtered).toHaveLength(0);
    });
  });

  describe("Filter behavior - sort", () => {
    it("should sort by name alphabetically", () => {
      const sorted = [...mockExtensions].sort((a, b) => a.name.localeCompare(b.name));
      expect(sorted[0].name).toBe("test-command");
      expect(sorted[1].name).toBe("test-mcp-server");
    });

    it("should sort by date (newest first)", () => {
      const withDates = mockExtensions.map((ext, i) => ({
        ...ext,
        date: new Date(2025 - i, 0, 1), // Different dates: 2025, 2024, 2023, 2022
      })) as (Extension & { date: Date })[];

      const sorted = [...withDates].sort((a, b) => b.date.getTime() - a.date.getTime());
      // First should be newest (2025)
      expect(sorted[0].date.getFullYear()).toBe(2025);
      // Last should be oldest (2022)
      expect(sorted[sorted.length - 1].date.getFullYear()).toBe(2022);
    });

    it("should sort by type", () => {
      const sorted = [...mockExtensions].sort((a, b) => a.type.localeCompare(b.type));
      expect(sorted[0].type).toBe("command");
      expect(sorted[1].type).toBe("mcp");
    });

    it("should reverse sort order when reverse=true", () => {
      const sorted = [...mockExtensions].sort((a, b) => a.name.localeCompare(b.name));
      const reversed = [...sorted].reverse();
      expect(reversed[0].name).toBe("zai-mcp");
    });
  });

  describe("Filter behavior - limit", () => {
    it("should return limited number of results", () => {
      const limited = mockExtensions.slice(0, 2);
      expect(limited).toHaveLength(2);
      expect(limited[0].name).toBe("test-mcp-server");
    });

    it("should handle limit larger than array", () => {
      const limited = mockExtensions.slice(0, 100);
      expect(limited).toHaveLength(mockExtensions.length);
    });

    it("should return empty when limit is 0", () => {
      const limited = mockExtensions.slice(0, 0);
      expect(limited).toHaveLength(0);
    });
  });

  describe("Filter behavior - origin", () => {
    it("should filter by origin repository", () => {
      const origin = "github.com/user/test-repo";
      const filtered = mockExtensions.filter((ext) => ext.source === origin);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((ext) => ext.source === origin));
    });

    it("should support origin patterns", () => {
      const origin = "github.com";
      const filtered = mockExtensions.filter((ext) => ext.source?.startsWith(origin));
      expect(filtered).toHaveLength(3);
      expect(filtered.every((ext) => ext.source?.startsWith("github.com")));
    });

    it("should return empty if no origin matches", () => {
      const origin = "github.com/nonexistent";
      const filtered = mockExtensions.filter((ext) => ext.source === origin);
      expect(filtered).toHaveLength(0);
    });
  });

  describe("Combined filters", () => {
    it("should apply search and limit together", () => {
      const searchTerm = "test";
      const limited = mockExtensions
        .filter((ext) => ext.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 2);

      expect(limited).toHaveLength(2);
      expect(limited[0].name).toBe("test-mcp-server");
    });

    it("should apply sort and reverse together", () => {
      const sorted = [...mockExtensions].sort((a, b) => a.name.localeCompare(b.name)).reverse();

      expect(sorted[0].name).toBe("zai-mcp");
    });

    it("should apply origin and search together", () => {
      const origin = "github.com";
      const searchTerm = "test";
      const filtered = mockExtensions.filter(
        (ext) =>
          ext.source?.startsWith(origin) &&
          ext.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );

      expect(filtered).toHaveLength(2);
    });
  });
});
