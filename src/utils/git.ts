// Git utilities using simple-git for agent-manager CLI

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { resolve, join } from 'pathe';
import { existsSync } from 'fs-extra';

export interface CloneOptions {
  depth?: number;
  branch?: string;
  singleBranch?: boolean;
}

export interface GitRepoInfo {
  url: string;
  org: string;
  repo: string;
  branch: string;
  path: string;
}

export interface GitCloneResult {
  path: string;
  commit: string;
  branch: string;
}

export interface GitStatusResult {
  isDirty: boolean;
  currentBranch: string;
  commit: string;
  ahead?: number;
  behind?: number;
}

/**
 * Create a simple-git instance with base options
 */
function createGit(repoPath: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    binary: 'git',
    maxConcurrentProcesses: 6,
  };
  return simpleGit(repoPath, options);
}

/**
 * Clone a git repository to destination
 * 
 * @param repo - Repository URL (https://github.com/org/repo or git@github.com:org/repo)
 * @param dest - Destination directory path
 * @param options - Clone options (depth, branch, singleBranch)
 * @returns Promise<GitCloneResult>
 */
export async function cloneRepo(
  repo: string,
  dest: string,
  options: CloneOptions = {}
): Promise<GitCloneResult> {
  const git = simpleGit();
  const args: string[] = [];

  if (options.depth && options.depth > 0) {
    args.push('--depth', String(options.depth));
  }

  if (options.branch) {
    args.push('--branch', options.branch);
  }

  if (options.singleBranch) {
    args.push('--single-branch');
  }

  await git.clone(repo, dest, args);

  // Get the commit hash and branch of cloned repo
  const clonedGit = createGit(dest);
  const log = await clonedGit.log();
  const status = await clonedGit.status();

  return {
    path: dest,
    commit: log.latest?.hash || '',
    branch: status.current || options.branch || 'main',
  };
}

/**
 * Pull latest changes from remote
 * 
 * @param repoPath - Path to the git repository
 * @param branch - Optional branch to pull (default: current branch)
 * @returns Promise<void>
 */
export async function pullRepo(repoPath: string, branch?: string): Promise<void> {
  const git = createGit(repoPath);
  
  if (branch) {
    await git.checkout(branch);
  }
  
  await git.pull();
}

/**
 * Checkout a specific branch
 * 
 * @param repoPath - Path to the git repository
 * @param branch - Branch name to checkout
 * @returns Promise<void>
 */
export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  const git = createGit(repoPath);
  await git.checkout(branch);
}

/**
 * Get the current commit hash
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<string> - Commit hash
 */
export async function getCurrentCommit(repoPath: string): Promise<string> {
  const git = createGit(repoPath);
  const log = await git.log();
  return log.latest?.hash || '';
}

/**
 * Get the latest semver tag
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<string | null> - Latest tag or null if no tags
 */
export async function getLatestTag(repoPath: string): Promise<string | null> {
  const git = createGit(repoPath);
  
  try {
    const tags = await git.tags();
    // Tags are sorted by version semver automatically
    const latest = tags.latest;
    return latest || null;
  } catch {
    return null;
  }
}

/**
 * Check if the repository has uncommitted changes
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<boolean>
 */
export async function isRepoDirty(repoPath: string): Promise<boolean> {
  const git = createGit(repoPath);
  const status = await git.status();
  return status.files.length > 0;
}

/**
 * Get comprehensive git status for a repository
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<GitStatusResult>
 */
export async function getRepoStatus(repoPath: string): Promise<GitStatusResult> {
  const git = createGit(repoPath);
  const log = await git.log();
  const status = await git.status();

  return {
    isDirty: status.files.length > 0,
    currentBranch: status.current || 'detached',
    commit: log.latest?.hash || '',
    ahead: status.ahead,
    behind: status.behind,
  };
}

/**
 * Fetch latest changes from remote
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<void>
 */
export async function fetchRepo(repoPath: string): Promise<void> {
  const git = createGit(repoPath);
  await git.fetch();
}

/**
 * Get remote URL for a repository
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<string> - Remote URL
 */
export async function getRemoteUrl(repoPath: string): Promise<string> {
  const git = createGit(repoPath);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find(r => r.name === 'origin');
  return origin?.refs.fetch || origin?.refs.push || '';
}

/**
 * Parse a git repository URL into components
 * 
 * @param repoUrl - Repository URL
 * @returns GitRepoInfo
 */
export function parseRepoUrl(repoUrl: string): GitRepoInfo {
  // Handle SSH format: git@github.com:org/repo.git
  let url = repoUrl;
  let org = '';
  let repo = '';
  let branch = 'main';
  let path = '';

  // Handle HTTPS format
  if (repoUrl.startsWith('https://')) {
    url = repoUrl.replace('https://github.com/', '');
    const parts = url.replace('.git', '').split('/');
    if (parts.length >= 2) {
      org = parts[0];
      repo = parts[1];
    }
    if (parts.length >= 4 && parts[2] === 'blob') {
      branch = parts[3];
    }
    path = parts.slice(4).join('/');
  }
  // Handle SSH format
  else if (repoUrl.startsWith('git@')) {
    url = repoUrl.replace('git@github.com:', '');
    const parts = url.replace('.git', '').split('/');
    if (parts.length >= 2) {
      org = parts[0];
      repo = parts[1];
    }
    if (parts.length >= 4 && parts[2] === 'blob') {
      branch = parts[3];
    }
    path = parts.slice(4).join('/');
  }

  return {
    url: repoUrl,
    org,
    repo,
    branch,
    path,
  };
}

/**
 * Initialize a new git repository
 * 
 * @param repoPath - Path to initialize git
 * @returns Promise<void>
 */
export async function initRepo(repoPath: string): Promise<void> {
  const git = createGit(repoPath);
  await git.init(true);
}

/**
 * Add remote to a repository
 * 
 * @param repoPath - Path to the git repository
 * @param name - Remote name (e.g., 'origin')
 * @param url - Remote URL
 * @returns Promise<void>
 */
export async function addRemote(repoPath: string, name: string, url: string): Promise<void> {
  const git = createGit(repoPath);
  await git.addRemote(name, url);
}

/**
 * Get list of branches
 * 
 * @param repoPath - Path to the git repository
 * @returns Promise<string[]> - List of branch names
 */
export async function getBranches(repoPath: string): Promise<string[]> {
  const git = createGit(repoPath);
  const branches = await git.branch();
  return branches.all;
}

/**
 * Check if a repository exists and is valid
 * 
 * @param repoPath - Path to check
 * @returns boolean
 */
export function isValidRepo(repoPath: string): boolean {
  if (!existsSync(repoPath)) {
    return false;
  }
  const gitDir = join(repoPath, '.git');
  return existsSync(gitDir);
}
