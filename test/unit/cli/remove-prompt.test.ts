import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../../src/utils/logger.js';
import type { ConsolaInstance } from 'consola';

vi.mock('../../../src/utils/logger.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/utils/logger.js')>(
    '../../../src/utils/logger.js'
  );
  return {
    ...actual,
    logger: {
      ...(actual.logger as ConsolaInstance),
      prompt: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock('../../../src/core/config.js', () => ({
  loadConfigSync: vi.fn(() => ({ 
    agentsDir: '/tmp/test-agents',
    agentManagerDir: '/tmp/test-agm',
  })),
}));

vi.mock('../../../src/core/skill-remover.js', () => ({
  removeExtension: vi.fn(async () => ({
    success: true,
    extension: 'test-extension',
    removedFrom: ['claude-code', 'cursor'],
  })),
}));

vi.mock('../../../src/core/dry-run.js', () => ({
  withDryRun: vi.fn(async (_msg: string, _dryRun: boolean, fn: () => Promise<unknown>) => fn()),
}));

import { runRemove } from '../../../src/cli/commands/remove.js';

describe('remove command prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prompt for extension name when not provided', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce('my-extension')
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(false);

    await runRemove({});

    expect(logger.prompt).toHaveBeenCalledWith(
      'Enter extension name to remove:',
      expect.objectContaining({ type: 'text', required: true })
    );
  });

  it('should prompt for agent selection when --from not provided', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce(['claude-code', 'cursor'])
      .mockResolvedValueOnce(false);

    await runRemove({ extension: 'provided-extension' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Select agent(s) to remove from:',
      expect.objectContaining({ type: 'multiselect' })
    );
  });

  it('should skip agent prompt when --from is provided', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce(false);

    await runRemove({ extension: 'my-extension', from: 'claude-code,cursor' });

    const multiselectCalls = vi.mocked(logger.prompt).mock.calls.filter(
      call => call[1]?.type === 'multiselect'
    );
    expect(multiselectCalls.length).toBe(0);
  });

  it('should prompt for dry-run preview when not provided', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce('my-extension')
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(true);

    await runRemove({});

    const confirmCalls = vi.mocked(logger.prompt).mock.calls.filter(
      call => call[1]?.type === 'confirm'
    );
    expect(confirmCalls.length).toBeGreaterThan(0);
  });

  it('should cancel operation when extension prompt returns undefined', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce(undefined);

    await runRemove({});

    expect(logger.info).toHaveBeenCalledWith('Operation cancelled.');
  });

  it('should handle no agent selection gracefully', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce('my-extension')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(false);

    await runRemove({});

    expect(logger.info).toHaveBeenCalledWith('No agents selected, will remove from all agents.');
  });
});
