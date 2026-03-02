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
}));

vi.mock('../../../src/adapters/index.js', () => ({
  createAgentRegistry: vi.fn(() => ({
    listAllExtensions: vi.fn(async () => []),
    removeExtension: vi.fn(async () => ({
      success: true,
      removedFrom: ['gemini-cli', 'claude-code'],
    })),
  })),
}));

import { runMCP } from '../../../src/cli/commands/mcp.js';

describe('mcp remove command prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prompt for MCP server name when not provided', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce('my-server');
    vi.mocked(logger.prompt).mockResolvedValueOnce(['gemini-cli']);
    vi.mocked(logger.prompt).mockResolvedValueOnce(false);

    await runMCP({ subcommand: 'remove' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Enter MCP server name to remove:',
      expect.objectContaining({ type: 'text', required: true })
    );
  });

  it('should prompt for agent selection when --to not provided', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce('my-server');
    vi.mocked(logger.prompt).mockResolvedValueOnce(['gemini-cli', 'claude-code']);
    vi.mocked(logger.prompt).mockResolvedValueOnce(false);

    await runMCP({ subcommand: 'remove' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Select agent(s) to remove from:',
      expect.objectContaining({ type: 'multiselect' })
    );
  });

  it('should skip agent prompt when --to is provided', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce(false);

    await runMCP({ subcommand: 'remove', name: 'my-server', to: 'gemini-cli' });

    const multiselectCalls = vi.mocked(logger.prompt).mock.calls.filter(
      call => call[1]?.type === 'multiselect'
    );
    expect(multiselectCalls.length).toBe(0);
  });

  it('should prompt for dry-run preview when not provided', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce('my-server');
    vi.mocked(logger.prompt).mockResolvedValueOnce(['gemini-cli']);
    vi.mocked(logger.prompt).mockResolvedValueOnce(true);

    await runMCP({ subcommand: 'remove' });

    expect(logger.prompt).toHaveBeenCalledWith(
      'Preview changes before applying?',
      expect.objectContaining({ type: 'confirm', initial: true })
    );
  });

  it('should cancel operation when server name prompt returns undefined', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce(undefined);

    await runMCP({ subcommand: 'remove' });

    expect(logger.info).toHaveBeenCalledWith('Operation cancelled.');
  });

  it('should handle no agent selection gracefully', async () => {
    vi.mocked(logger.prompt).mockResolvedValueOnce('my-server');
    vi.mocked(logger.prompt).mockResolvedValueOnce([]);
    vi.mocked(logger.prompt).mockResolvedValueOnce(false);

    await runMCP({ subcommand: 'remove' });

    expect(logger.info).toHaveBeenCalledWith('No agents selected, will remove from all agents.');
  });
});
