import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "pathe";
import { load as yamlLoad } from "js-yaml";
import type { GitRepoInfo, SkillEntry } from "../types.js";
import { logger } from "../../utils/logger.js";
import { readManifest, writeManifest } from "./core.js";
import { filterSkillsByRules } from "./filter.js";

function parseRepoUrlForCache(repo: string): { org: string; repoName: string } {
  const cleanUrl = repo.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const parts = cleanUrl.split("/");

  if (parts.length >= 2) {
    return {
      org: parts[parts.length - 2],
      repoName: parts[parts.length - 1],
    };
  }

  return {
    org: "unknown",
    repoName: cleanUrl,
  };
}

function convertToGigetSource(origin: string, branch: string): string {
  const url = new URL(origin);
  const pathParts = url.pathname
    .replace(/^\//, "")
    .replace(/\.git$/, "")
    .split("/");

  if (pathParts.length < 2) {
    throw new Error(`Invalid repository URL: ${origin}`);
  }

  const org = pathParts[0];
  const repo = pathParts[1];

  let provider = "github";
  if (url.hostname.includes("gitlab")) provider = "gitlab";
  else if (url.hostname.includes("bitbucket")) provider = "bitbucket";
  else if (url.hostname.includes("sourcehut")) provider = "sourcehut";

  return `${provider}:${org}/${repo}#${branch}`;
}

export async function cloneSourceToCache(
  origin: string,
  branch: string,
  configHome: string,
): Promise<string | null> {
  const { org, repoName } = parseRepoUrlForCache(origin);
  const cachePath = join(configHome, "cache", org, repoName);

  try {
    const { downloadTemplate } = await import("giget");
    const gigetSource = convertToGigetSource(origin, branch);

    await downloadTemplate(gigetSource, {
      dir: cachePath,
      forceClean: true,
      offline: false,
    });

    return cachePath;
  } catch (error) {
    console.error(`Failed to clone ${origin}:`, error);
    return null;
  }
}

export function parseRepoString(repo: string): GitRepoInfo {
  const cleanUrl = repo.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const parts = cleanUrl.split("/");

  if (parts.length >= 2) {
    return {
      url: repo,
      org: parts[parts.length - 2],
      repo: parts[parts.length - 1],
      branch: "main",
      path: "",
    };
  }

  return {
    url: repo,
    org: "unknown",
    repo: cleanUrl,
    branch: "main",
    path: "",
  };
}

async function readSkillManifestsParallel(
  folderNames: string[],
  skillsPath: string,
  maxConcurrency: number = 10,
): Promise<Map<string, { name: string; folderName: string; description?: string }>> {
  const results = new Map<string, { name: string; folderName: string; description?: string }>();

  for (let i = 0; i < folderNames.length; i += maxConcurrency) {
    const batch = folderNames.slice(i, i + maxConcurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (folderName) => {
        const skillManifestPath = join(skillsPath, folderName, "SKILL.md");

        if (!existsSync(skillManifestPath)) {
          return null;
        }

        try {
          const content = readFileSync(skillManifestPath, "utf-8");
          const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);

          let name = folderName;
          let description: string | undefined;

          if (frontmatter) {
            const yamlContent = frontmatter[1];
            const nameMatch = yamlContent.match(/name:\s*(.+)/);
            const descMatch = yamlContent.match(/description:\s*(.+)/);

            if (nameMatch) {
              name = nameMatch[1].trim();
            }
            if (descMatch) {
              description = descMatch[1].trim();
            }
          }

          return { name, folderName, description };
        } catch (error) {
          return null;
        }
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value !== null) {
        results.set(result.value.folderName, result.value);
      }
    }
  }

  return results;
}

export async function syncFromSources(
  configHome: string,
  options: { dryRun?: boolean; verbose?: boolean; maxConcurrency?: number } = {},
): Promise<{
  success: boolean;
  added: number;
  removed: number;
  updated: number;
  details: string[];
}> {
  const result: {
    success: boolean;
    added: number;
    removed: number;
    updated: number;
    details: string[];
  } = {
    success: false,
    added: 0,
    removed: 0,
    updated: 0,
    details: [],
  };

  if (options.verbose) {
    logger.info("Syncing skills from configured sources...");
  }

  const manifest = readManifest(configHome);
  const maxConcurrency = options.maxConcurrency ?? 3;

  for (const originGroup of manifest.skills) {
    if (options.verbose) {
      logger.info(`Processing origin: ${originGroup.origin}`);
    }

    if (!originGroup.origin || originGroup.origin === "local") {
      if (originGroup.origin) {
        result.details.push(`Skipping local origin: ${originGroup.origin}`);
      }
      continue;
    }

    const cachePath = await cloneSourceToCache(originGroup.origin, originGroup.branch, configHome);

    if (!cachePath) {
      result.details.push(`Failed to clone/update: ${originGroup.origin}`);
      continue;
    }

    const skillsPath = join(cachePath, originGroup.path);

    if (!existsSync(skillsPath)) {
      result.details.push(`Skills path not found: ${skillsPath}`);
      continue;
    }

    const allSkillFolders = [];

    try {
      const entries = readdirSync(skillsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderName = entry.name;
          const skillManifestPath = join(skillsPath, folderName, "SKILL.md");

          if (existsSync(skillManifestPath)) {
            allSkillFolders.push(folderName);
          } else {
            if (options.verbose) {
              logger.info(`Skipping ${folderName} (no SKILL.md found)`);
            }
          }
        }
      }
    } catch (error) {
      result.details.push(`Error scanning ${skillsPath}: ${String(error)}`);
      continue;
    }

    if (options.verbose) {
      logger.info(`Found ${allSkillFolders.length} skill folders`);
    }

    const filteredFolders = filterSkillsByRules(
      allSkillFolders,
      originGroup.include,
      originGroup.exclude,
    );

    if (options.verbose) {
      logger.info(`After filtering: ${filteredFolders.length} skills`);
      logger.info(`  Include: [${originGroup.include.join(", ") || "all"}]`);
      logger.info(`  Exclude: [${originGroup.exclude.join(", ") || "none"}]`);
    }

    const currentSkills = new Set(originGroup.skills.map((s) => s.name));
    const newSkills = new Set(filteredFolders);

    const added = [...newSkills].filter((s) => !currentSkills.has(s));
    const removed = [...currentSkills].filter((s) => !newSkills.has(s));

    const updatedSkills: SkillEntry[] = originGroup.skills.filter((s) => newSkills.has(s.name));

    if (added.length > 0) {
      if (options.verbose) {
        logger.info(`Reading ${added.length} skill manifests in parallel...`);
      }

      const skillManifests = await readSkillManifestsParallel(added, skillsPath, 10);

      for (const folderName of added) {
        const skillData = skillManifests.get(folderName);

        if (skillData) {
          updatedSkills.push({
            name: skillData.name,
            folderName: skillData.folderName,
            agents: [],
            description: skillData.description,
          });

          if (options.verbose) {
            logger.info(`  + Added skill: ${skillData.name}`);
          }

          result.added++;
          result.details.push(`Added: ${skillData.name} from ${originGroup.origin}`);
        } else {
          result.details.push(`Error reading ${folderName}: File read failed`);
        }
      }
    }

    const groupIndex = manifest.skills.findIndex((g) => g.origin === originGroup.origin);

    if (groupIndex !== -1) {
      if (options.dryRun) {
        if (options.verbose) {
          logger.info(`[DRY RUN] Would update origin group: ${originGroup.origin}`);
          logger.info(`  Added: ${added.length}, Removed: ${removed.length}`);
        }
      } else {
        manifest.skills[groupIndex] = {
          ...originGroup,
          skills: updatedSkills,
        };

        if (options.verbose) {
          logger.info(`  Updated origin: ${originGroup.origin}`);
        }

        result.updated += updatedSkills.length;
      }

      result.details.push(
        `Processed ${originGroup.origin}: ${added.length} added, ${removed.length} removed`,
      );
    }
  }

  if (!options.dryRun) {
    writeManifest(configHome, manifest);

    if (options.verbose) {
      logger.info("Manifest updated");
    }
  }

  result.success = true;
  return result;
}

export function importFromOpenCodeManifest(
  configHome: string,
  openCodeManifestPath: string,
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  if (!existsSync(openCodeManifestPath)) {
    return { imported, skipped };
  }

  try {
    const content = readFileSync(openCodeManifestPath, "utf-8");
    const parsed = yamlLoad(content) as {
      sources?: Array<{
        repo: string;
        path: string;
        branch: string;
        include?: string[];
        exclude?: string[];
      }>;
      customized?: string[];
      local?: string[];
    };

    const manifest = readManifest(configHome);

    if (Array.isArray(parsed.sources)) {
      for (const source of parsed.sources) {
        const existingGroup = manifest.skills.find((g) => g.origin === source.repo);
        if (!existingGroup) {
          manifest.skills.push({
            origin: source.repo,
            path: source.path || "skills",
            branch: source.branch || "main",
            include: source.include || [],
            exclude: source.exclude || [],
            skills: [],
          });
          imported++;
        } else {
          skipped++;
        }
      }
    }

    writeManifest(configHome, manifest);
  } catch {}

  return { imported, skipped };
}
