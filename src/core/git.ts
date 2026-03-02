import { existsSync } from "node:fs";
import { join } from "pathe";

export interface GitRepoInfo {
  url: string;
  org: string;
  repo: string;
  branch: string;
  path: string;
}

export interface CloneOptions {
  branch?: string;
  force?: boolean;
  depth?: number;
}

export interface CloneResult {
  path: string;
  branch: string;
}

function parseProviderFromUrl(url: string): string {
  const hostname = new URL(url).hostname;
  if (hostname.includes("gitlab")) return "gitlab";
  if (hostname.includes("bitbucket")) return "bitbucket";
  if (hostname.includes("sourcehut")) return "sourcehut";
  return "github";
}

function convertToGigetSource(repoUrl: string, branch?: string): string {
  const url = new URL(repoUrl);
  const pathParts = url.pathname
    .replace(/^\//, "")
    .replace(/\.git$/, "")
    .split("/");

  if (pathParts.length < 2) {
    throw new Error(`Invalid repository URL: ${repoUrl}`);
  }

  const org = pathParts[0];
  const repo = pathParts[1];
  const provider = parseProviderFromUrl(repoUrl);
  const ref = branch || "main";

  return `${provider}:${org}/${repo}#${ref}`;
}

export async function cloneRepo(
  repo: string,
  dest: string,
  options: CloneOptions = {},
): Promise<CloneResult> {
  const { downloadTemplate } = await import("giget");

  const gigetSource = convertToGigetSource(repo, options.branch);

  await downloadTemplate(gigetSource, {
    dir: dest,
    forceClean: options.force ?? true,
    offline: false,
  });

  return {
    path: dest,
    branch: options.branch || "main",
  };
}

export function parseRepoUrl(repoUrl: string): GitRepoInfo {
  let url = repoUrl;
  let org = "";
  let repo = "";
  let branch = "main";
  let path = "";

  if (repoUrl.startsWith("https://")) {
    url = repoUrl.replace("https://github.com/", "");
    const parts = url.replace(".git", "").split("/");
    if (parts.length >= 2) {
      org = parts[0];
      repo = parts[1];
    }
    if (parts.length >= 4 && (parts[2] === "blob" || parts[2] === "tree")) {
      branch = parts[3];
    }
    path = parts.slice(4).join("/");
  } else if (repoUrl.startsWith("git@")) {
    url = repoUrl.replace("git@github.com:", "");
    const parts = url.replace(".git", "").split("/");
    if (parts.length >= 2) {
      org = parts[0];
      repo = parts[1];
    }
    if (parts.length >= 4 && (parts[2] === "blob" || parts[2] === "tree")) {
      branch = parts[3];
    }
    path = parts.slice(4).join("/");
  }

  return {
    url: repoUrl,
    org,
    repo,
    branch,
    path,
  };
}

export function isValidRepo(repoPath: string): boolean {
  if (!existsSync(repoPath)) {
    return false;
  }
  return existsSync(join(repoPath, ".git"));
}
