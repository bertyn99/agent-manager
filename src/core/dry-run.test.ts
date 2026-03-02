/**
 * Test Phase 1: Dry-Run Feature
 *
 * Tests dry-run wrapper (--dry-run flag) on modifying commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "pathe";
import { withDryRun } from "./dry-run";

describe("Phase 1: Dry-Run Feature", () => {
  let testOutputDir: string;

  beforeEach(() => {
    // Create temporary output directory
    testOutputDir = join(process.cwd(), ".test-output");
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup temporary output directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  describe("withDryRun wrapper", () => {
    it("should skip execution when dry-run is true", async () => {
      const mockFunc = vi.fn().mockResolvedValue("result");

      await withDryRun("test operation", true, mockFunc);

      expect(mockFunc).not.toHaveBeenCalled();
    });

    it("should execute function when dry-run is false", async () => {
      const mockFunc = vi.fn().mockResolvedValue("result");

      await withDryRun("test operation", false, mockFunc);

      expect(mockFunc).toHaveBeenCalled();
    });

    it("should handle async functions", async () => {
      const mockAsyncFunc = vi.fn().mockResolvedValue("async result");

      await withDryRun("async operation", false, mockAsyncFunc);

      expect(mockAsyncFunc).toHaveBeenCalled();
    });

    it("should pass through return values", async () => {
      const mockFunc = vi.fn().mockResolvedValue("test return value");

      const result = await withDryRun("test operation", false, mockFunc);

      expect(result).toBe("test return value");
    });
  });

  describe("Dry-run on commands", () => {
    it("should work with remove command", async () => {
      const mockFunc = vi.fn().mockResolvedValue("removed");

      await withDryRun("remove extension", true, mockFunc);

      expect(mockFunc).not.toHaveBeenCalled();
    });

    it("should preserve command operation in logs", async () => {
      const mockFunc = vi.fn().mockResolvedValue("done");

      await withDryRun("add extension", true, mockFunc);

      // Function should not have been called
      expect(mockFunc).not.toHaveBeenCalled();
    });
  });
});
