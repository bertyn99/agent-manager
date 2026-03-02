import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  ensureDirs: vi.fn(),
}));

vi.mock('../../../src/core/skill-installer.js', () => ({
  addExtension: vi.fn(async () => ({
    success: true,
    extension: 'test-extension',
    installedTo: ['claude-code', 'cursor'],
  })),
  addGlobalSkill: vi.fn(async () => ({
    success: true,
    extension: 'global-skill',
  })),
}));

import { runAdd } from '../../../src/cli/commands/add.js';

describe('add command prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prompt for repo URL when not provided', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce('https://github.com/owner/repo')
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runAdd({});

    expect(logger.prompt).toHaveBeenCalledWith(
      'Enter repository URL:',
      expect.objectContaining({ type: 'text', required: true })
    );
  });

  it('should prompt for agent selection when --to not provided', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce('https://github.com/owner/repo')
      .mockResolvedValueOnce(['claude-code', 'cursor'])
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runAdd({});

    expect(logger.prompt).toHaveBeenCalledWith(
      'Select target agent(s):',
      expect.objectContaining({ type: 'multiselect' })
    );
  });

  it('should skip agent prompt when --to is provided', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runAdd({ repo: 'https://github.com/owner/repo', to: 'claude-code' });

    const multiselectCalls = vi.mocked(logger.prompt).mock.calls.filter(
      call => call[1]?.type === 'multiselect'
    );
    expect(multiselectCalls.length).toBe(0);
  });

  it('should prompt for nested repository confirmation', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('src/skills')
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runAdd({ repo: 'https://github.com/owner/repo' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Is this a nested repository (extensions in subdirectories)?',
      expect.objectContaining({ type: 'confirm', initial: false })
    );
  });

  it('should prompt for skills mode selection', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('include')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runAdd({ repo: 'https://github.com/owner/repo' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Select skills mode:',
      expect.objectContaining({ type: 'select' })
    );
  });

  it('should prompt for global skill confirmation', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await runAdd({ repo: 'https://github.com/owner/repo' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Install as global Claude skill?',
      expect.objectContaining({ type: 'confirm', initial: false })
    );
  });

  it('should prompt for dry-run preview', async () => {
    vi.mocked(logger.prompt)
      .mockResolvedValueOnce(['claude-code'])
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await runAdd({ repo: 'https://github.com/owner/repo' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Preview changes before applying?',
      expect.objectContaining({ type: 'confirm', initial: true })
    );
  });

  it('should cancel operation when repo prompt returns undefined', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce(undefined);

    await runAdd({});

    expect(logger.info).toHaveBeenCalledWith('Operation cancelled.');
  });
});
