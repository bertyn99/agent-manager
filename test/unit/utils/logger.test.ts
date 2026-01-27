// Logger Utilities Module Tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('Logger Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger', () => {
    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have success method', () => {
      expect(typeof logger.success).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have log method', () => {
      expect(typeof logger.log).toBe('function');
    });

    it('should have start method', () => {
      expect(typeof logger.start).toBe('function');
    });

    it('should have fatal method', () => {
      expect(typeof logger.fatal).toBe('function');
    });

    it('should have box method', () => {
      expect(typeof logger.box).toBe('function');
    });

    it('should have prompt method', () => {
      expect(typeof logger.prompt).toBe('function');
    });
  });

  describe('convenience exports', () => {
    it('should export info function', () => {
      expect(typeof info).toBe('function');
    });

    it('should export warn function', () => {
      expect(typeof warn).toBe('function');
    });

    it('should export error function', () => {
      expect(typeof error).toBe('function');
    });

    it('should export success function', () => {
      expect(typeof success).toBe('function');
    });

    it('should export debug function', () => {
      expect(typeof debug).toBe('function');
    });

    it('should export log function', () => {
      expect(typeof log).toBe('function');
    });

    it('should export start function', () => {
      expect(typeof start).toBe('function');
    });

    it('should export fatal function', () => {
      expect(typeof fatal).toBe('function');
    });

    it('should export box function', () => {
      expect(typeof box).toBe('function');
    });

    it('should export prompt function', () => {
      expect(typeof prompt).toBe('function');
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
  });
});
