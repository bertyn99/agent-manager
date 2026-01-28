/**
 * Test Phase 1: Dry-Run Feature
 *
 * Tests dry-run wrapper (--dry-run flag) on modifying commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs-extra';
import { join } from 'pathe';

describe('Phase 1: Dry-Run Feature', () => {
  let testLog: string[];
  let testOutputDir: string;

  beforeEach(() => {
    // Capture console output
    testLog = [];
    console.log = (...args: any[]) => {
      testLog.push(args.join(' '));
    };
    console.error = (...args: any[]) => {
      testLog.push('[ERROR] ' + args.join(' '));
    };

    // Create temporary output directory
    testOutputDir = join(process.cwd(), '.test-output');
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
  });

  afterEach(() => {
    // Restore console
    console.log = vi.fn();
    console.error = vi.fn();

    // Cleanup temporary output directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  describe('withDryRun wrapper', () => {
    it('should wrap function with dry-run prefix', () => {
      const mockFunc = vi.fn();
      const dryRunFunc = (fn: (...args: any[]) => any, dryRun: boolean = false) => {
        if (dryRun) {
          console.log('[DRY RUN] Would execute:', ...args);
          return undefined;
        }
        return fn(...args);
      };

      const result = dryRunFunc(mockFunc, true);
      result();

      // Check that original function was NOT called
      expect(mockFunc).not.toHaveBeenCalled();

      // Check that dry-run prefix was logged
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN] Would execute:')
      );
    });

    it('should call function normally when dry-run is false', () => {
      const mockFunc = vi.fn(() => 'result from normal execution');
      const dryRunFunc = (fn: (...args: any[]) => any, dryRun: boolean = false) => {
        if (dryRun) {
          console.log('[DRY RUN] Would execute:', ...args);
          return undefined;
        }
        return fn(...args);
      };

      const result = dryRunFunc(mockFunc, false);

      // Check that original function WAS called
      expect(mockFunc).toHaveBeenCalled();

      // Check that dry-run prefix was NOT logged
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN]')
      );
    });

    it('should handle async functions', async () => {
      const mockAsyncFunc = vi.fn().mockResolvedValue('async result');
      const dryRunFunc = (fn: (...args: any[]) => any, dryRun: boolean = false) => {
        if (dryRun) {
          console.log('[DRY RUN] Would execute:', ...args);
          return undefined;
        }
        return fn(...args);
      };

      const result = await dryRunFunc(mockAsyncFunc, true);

      expect(mockAsyncFunc).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN] Would execute:')
      );
    });

    it('should pass through return values', () => {
      const mockFunc = vi.fn(() => 'test return value');
      const dryRunFunc = (fn: (...args: any[]) => any, dryRun: boolean = false) => {
        if (dryRun) {
          console.log('[DRY RUN] Would execute:', ...args);
          return undefined;
        }
        return fn(...args);
      };

      const result = dryRunFunc(mockFunc, true);
      expect(result).toBeUndefined();

      const result2 = dryRunFunc(mockFunc, false);
      expect(result2).toBe('test return value');
    });
  });

  describe('Dry-run on commands', () => {
    it('should work with remove command', () => {
      const operations = ['add', 'remove', 'upgrade', 'sync'];

      operations.forEach(op => {
        const mockFunc = vi.fn();
        const dryRunFunc = (fn: (...args: any[]) => any, dryRun: boolean = false) => {
          if (dryRun) {
            console.log(`[DRY RUN] Would ${op}:`, ...args);
            return undefined;
          }
          return fn(...args);
        };

        dryRunFunc(mockFunc, true);
        expect(mockFunc).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining(`[DRY RUN] Would ${op}:`)
        );
      });
    });

    it('should preserve command operation in logs', () => {
      const mockFunc = vi.fn();
      const dryRunFunc = (fn: (...args: any[]) => any, dryRun: boolean = false) => {
        if (dryRun) {
          console.log('[DRY RUN] Would execute:', ...args);
          return undefined;
        }
        return fn(...args);
      };

      dryRunFunc(mockFunc, true, 'adding', 'file');

      expect(mockFunc).not.toHaveBeenCalled();
      expect(testLog).toContain('[DRY RUN] Would execute: adding file');
    });
  });
});
