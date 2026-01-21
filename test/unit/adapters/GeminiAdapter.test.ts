// GeminiAdapter Unit Tests

import { describe, it, expect } from 'vitest';
import { GeminiAdapter } from '../../../src/adapters/GeminiAdapter';
import { createMockConfig } from '../../helpers/mock-config';

describe('GeminiAdapter', () => {
  const config = createMockConfig();
  const adapter = new GeminiAdapter(config);

  describe('type and name', () => {
    it('should have correct type', () => {
      expect(adapter.type).toBe('gemini-cli');
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('Gemini CLI');
    });
  });
});
