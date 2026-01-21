// Test Setup File for Agent Manager Tests

import { beforeEach, afterEach } from 'vitest';

/**
 * Setup global test configuration
 * Clears mocks before each test and resets after
 */
beforeEach(() => {
  // Clear any previous mock calls
  vi.clearAllMocks();
});

afterEach(() => {
  // Reset all mocks to clean state
  vi.resetAllMocks();
});
