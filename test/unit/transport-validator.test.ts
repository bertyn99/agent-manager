// TransportValidator Unit Tests

import { describe, it, expect } from 'vitest';
import { TransportValidator, transportValidator } from '../../src/core/transport-validator.js';

describe('TransportValidator', () => {
  describe('validateTransportType', () => {
    it('should accept valid transport types', () => {
      const validTypes = ['http', 'command', 'sse', 'websocket'];
      
      for (const type of validTypes) {
        const result = transportValidator.validateTransportType(type);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });

    it('should reject invalid transport types', () => {
      const result = transportValidator.validateTransportType('invalid');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject empty transport type', () => {
      const result = transportValidator.validateTransportType('');
      
      expect(result.valid).toBe(false);
    });
  });

  describe('validate (main method)', () => {
    it('should validate HTTP transport', () => {
      const result = transportValidator.validate({
        type: 'http',
        url: 'https://mcp.example.com',
      });

      expect(result.valid).toBe(true);
    });

    it('should accept valid HTTP config', () => {
      const config = {
        type: 'http' as const,
        url: 'https://mcp.example.com/sse',
        headers: {
          'Authorization': 'Bearer token',
        },
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
    });

    it('should require URL for HTTP transport', () => {
      const config = {
        type: 'http' as const,
        // missing url
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('URL'));
    });

    it('should reject invalid URL', () => {
      const config = {
        type: 'http' as const,
        url: 'not-a-valid-url',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
    });

    it('should warn about unencrypted HTTP', () => {
      const config = {
        type: 'http' as const,
        url: 'http://mcp.example.com/sse',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('unencrypted'));
    });

    it('should validate command transport', () => {
      const result = transportValidator.validate({
        type: 'command',
        command: 'npx',
      });

      expect(result.valid).toBe(true);
    });

    it('should accept valid command config', () => {
      const config = {
        type: 'command' as const,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: {
          'HOME': '/home/user',
        },
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
    });

    it('should require command field', () => {
      const config = {
        type: 'command' as const,
        // missing command
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('command'));
    });

    it('should reject dangerous commands', () => {
      const config = {
        type: 'command' as const,
        command: 'rm -rf /',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('dangerous'));
    });

    it('should warn about dangerous commands that pass validation', () => {
      const config = {
        type: 'command' as const,
        command: 'sudo',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('elevated privileges'));
    });

    it('should warn about shell injection in args', () => {
      const config = {
        type: 'command' as const,
        command: 'echo',
        args: ['hello; whoami'],
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('shell operators'));
    });

    it('should validate SSE transport', () => {
      const result = transportValidator.validate({
        type: 'sse',
        url: 'https://mcp.example.com/sse',
      });

      expect(result.valid).toBe(true);
    });

    it('should accept valid SSE config', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://mcp.example.com/events',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
    });

    it('should require URL for SSE', () => {
      const config = {
        type: 'sse' as const,
        // missing url
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
    });

    it('should warn about GET method for SSE', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://mcp.example.com/events',
        headers: {
          'method': 'POST',  // Non-GET method should trigger warning
        },
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('GET method'));
    });

    it('should validate WebSocket transport', () => {
      const result = transportValidator.validate({
        type: 'websocket',
        url: 'wss://mcp.example.com/ws',
      });

      expect(result.valid).toBe(true);
    });

    it('should accept valid WebSocket config', () => {
      const config = {
        type: 'websocket' as const,
        url: 'wss://mcp.example.com/ws',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
    });

    it('should require URL for WebSocket', () => {
      const config = {
        type: 'websocket' as const,
        // missing url
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
    });

    it('should require ws:// or wss:// protocol for WebSocket', () => {
      const config = {
        type: 'websocket' as const,
        url: 'https://mcp.example.com/ws',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(false);
    });

    it('should warn about unencrypted WebSocket', () => {
      const config = {
        type: 'websocket' as const,
        url: 'ws://mcp.example.com/ws',
      };

      const result = transportValidator.validate(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('unencrypted'));
    });

    it('should return errors and warnings', () => {
      const result = transportValidator.validate({
        type: 'invalid-transport' as any,
        url: 'not-a-url',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('createConfig', () => {
    it('should create valid HTTP config', () => {
      const { config, result } = transportValidator.createConfig({
        type: 'http',
        url: 'https://example.com/mcp',
      });

      expect(result.valid).toBe(true);
      expect(config).toBeDefined();
      expect(config!.type).toBe('http');
      expect(config!.url).toBe('https://example.com/mcp');
    });

    it('should create valid command config', () => {
      const { config, result } = transportValidator.createConfig({
        type: 'command',
        command: 'npx',
        args: ['server'],
      });

      expect(result.valid).toBe(true);
      expect(config).toBeDefined();
      expect(config!.type).toBe('command');
      expect(config!.command).toBe('npx');
      expect(config!.args).toEqual(['server']);
    });

    it('should return null config for invalid input', () => {
      const { config, result } = transportValidator.createConfig({
        type: 'http',
        // missing url
      });

      expect(result.valid).toBe(false);
      expect(config).toBeNull();
    });

    it('should include default enabled value', () => {
      const { config } = transportValidator.createConfig({
        type: 'command',
        command: 'test',
      });

      expect(config!.enabled).toBeUndefined(); // Not set by default
    });
  });
});
