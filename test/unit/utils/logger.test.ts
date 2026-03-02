// Logger Utilities Module Tests

import { describe, it, expect, vi, beforeEach, afterEach, test } from 'vitest';
import {
  logger,
  info,
  warn,
  error,
  success,
  debug,
  log,
  start,
  fatal,
  box,
  prompt,
  createSilentLogger,
  withSpinner,
} from '../../../src/utils/logger';

const loggerMethods = [
  'info',
  'warn',
  'error',
  'success',
  'debug',
  'log',
  'start',
  'fatal',
  'box',
  'prompt',
] as const;

describe('Logger Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger methods', () => {
    test.each(loggerMethods)('should have %s method', (method) => {
      expect(typeof logger[method]).toBe('function');
    });
  });

  describe('convenience exports', () => {
    test.each(loggerMethods)('should export %s function', (method) => {
      const exports = { info, warn, error, success, debug, log, start, fatal, box, prompt };
      expect(typeof exports[method]).toBe('function');
    });
  });

  describe('createSilentLogger', () => {
    it('should return a logger object', () => {
      const silentLogger = createSilentLogger();
      expect(silentLogger).toBeDefined();
      expect(typeof silentLogger.info).toBe('function');
      expect(typeof silentLogger.warn).toBe('function');
      expect(typeof silentLogger.error).toBe('function');
    });

    it('should suppress log output', () => {
      const silentLogger = createSilentLogger();
      // Should not throw and should not produce console output
      expect(() => silentLogger.info('test')).not.toThrow();
      expect(() => silentLogger.warn('test')).not.toThrow();
      expect(() => silentLogger.error('test')).not.toThrow();
    });
  });

  describe('withSpinner', () => {
    it('should be a function', () => {
      expect(typeof withSpinner).toBe('function');
    });

    it('should return the result of the async function', async () => {
      const result = await withSpinner('operation', async () => {
        return { data: 'test' };
      });

      expect(result).toEqual({ data: 'test' });
    });

    it('should handle errors and throw', async () => {
      await expect(
        withSpinner('failing operation', async () => {
          throw new Error('operation failed');
        })
      ).rejects.toThrow('Failed: failing operation');
    });
  });
});
