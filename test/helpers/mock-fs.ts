// Mock Filesystem Functions for Agent Manager Tests

import { vi } from 'vitest';

/**
 * Mock existsSync function
 * By default returns false
 */
export const mockExistsSync = vi.fn(() => false);

/**
 * Mock readFileSync function
 * By default returns empty string
 */
export const mockReadFileSync = vi.fn(() => '');

/**
 * Mock writeFileSync function
 * No-op by default
 */
export const mockWriteFileSync = vi.fn();

/**
 * Mock mkdirSync function
 * No-op by default
 */
export const mockMkdirSync = vi.fn();

/**
 * Mock rmSync function
 * No-op by default
 */
export const mockRmSync = vi.fn();

/**
 * Mock unlinkSync function
 * No-op by default
 */
export const mockUnlinkSync = vi.fn();

/**
 * Mock readdirSync function
 * By default returns empty array
 */
export const mockReaddirSync = vi.fn(() => []);

/**
 * Mock lstatSync function
 * By default returns a mock Stats object
 */
export const mockLstatSync = vi.fn(() => ({
  isDirectory: () => false,
  isSymbolicLink: () => false,
  isFile: () => false,
}));

/**
 * Mock symlinkSync function
 * No-op by default
 */
export const mockSymlinkSync = vi.fn();

/**
 * Setup all fs mocks with vitest
 */
export function setupFsMocks() {
  vi.mock('fs-extra', async () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    rmSync: mockRmSync,
    unlinkSync: mockUnlinkSync,
    readdirSync: mockReaddirSync,
    lstatSync: mockLstatSync,
    symlinkSync: mockSymlinkSync,
  }));
}

/**
 * Reset all fs mocks
 */
export function resetFsMocks() {
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
  mockWriteFileSync.mockReset();
  mockMkdirSync.mockReset();
  mockRmSync.mockReset();
  mockUnlinkSync.mockReset();
  mockReaddirSync.mockReset();
  mockLstatSync.mockReset();
  mockSymlinkSync.mockReset();
}

/**
 * Clear all fs mocks
 */
export function clearFsMocks() {
  mockExistsSync.mockClear();
  mockReadFileSync.mockClear();
  mockWriteFileSync.mockClear();
  mockMkdirSync.mockClear();
  mockRmSync.mockClear();
  mockUnlinkSync.mockClear();
  mockReaddirSync.mockClear();
  mockLstatSync.mockClear();
  mockSymlinkSync.mockClear();
}
