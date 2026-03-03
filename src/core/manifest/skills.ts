import type { AgentType, AgentManagerManifest, SkillOriginGroup, SkillEntry } from "../types.js";
import { readManifest, writeManifest } from "./core.js";

export function addSkillOriginGroup(
  configHome: string,
  origin: string,
  path: string,
  branch: string,
  filters: { include?: string[]; exclude?: string[] },
): void {
  const manifest = readManifest(configHome);

  const newGroup: SkillOriginGroup = {
    origin,
    path,
    branch,
    include: filters.include || [],
    exclude: filters.exclude || [],
    skills: [],
  };

  manifest.skills.push(newGroup);
  writeManifest(configHome, manifest);
}

export function updateSkillInOrigin(
  configHome: string,
  origin: string,
  skillName: string,
  agents: AgentType[],
): void {
  const manifest = readManifest(configHome);

  const originGroup = manifest.skills.find((g) => g.origin === origin);

  if (!originGroup) {
    throw new Error(`Origin not found: ${origin}`);
  }

  const skill = originGroup.skills.find((s) => s.name === skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  skill.agents = agents;
  writeManifest(configHome, manifest);
}

export function getSkillInOrigin(
  manifest: AgentManagerManifest,
  origin: string,
  skillName: string,
): SkillEntry | undefined {
  const originGroup = manifest.skills.find((g) => g.origin === origin);

  if (!originGroup) {
    return undefined;
  }

  return originGroup.skills.find((s) => s.name === skillName);
}

export function addExtensionToManifest(
  configHome: string,
  skillName: string,
  agent: AgentType,
  options: {
    description?: string;
    repo?: string;
    commit?: string;
    path?: string;
  },
): void {
  const manifest = readManifest(configHome);

  const origin = options.repo || "local";
  let originGroup = manifest.skills.find((g) => g.origin === origin);

  if (!originGroup) {
    originGroup = {
      origin,
      path: options.path || "skills",
      branch: "main",
      include: [],
      exclude: [],
      skills: [],
    };
    manifest.skills.push(originGroup);
  }

  let skill = originGroup.skills.find((s) => s.name === skillName);

  if (!skill) {
    skill = {
      name: skillName,
      folderName: skillName,
      agents: [],
      description: options.description,
    };
    originGroup.skills.push(skill);
  }

  if (!skill.agents.includes(agent)) {
    skill.agents.push(agent);
  }

  writeManifest(configHome, manifest);
}

export function addExtensionToManifestBatch(
  configHome: string,
  skillName: string,
  agents: AgentType[],
  options: {
    description?: string;
    repo?: string;
    commit?: string;
    path?: string;
  },
): void {
  const manifest = readManifest(configHome);
  const origin = options.repo || "local";
  let originGroup = manifest.skills.find((g) => g.origin === origin);

  if (!originGroup) {
    originGroup = {
      origin,
      path: options.path || "skills",
      branch: "main",
      include: [],
      exclude: [],
      skills: [],
    };
    manifest.skills.push(originGroup);
  }

  let skill = originGroup.skills.find((s) => s.name === skillName);

  if (!skill) {
    skill = {
      name: skillName,
      folderName: skillName,
      agents: [],
      description: options.description,
    };
    originGroup.skills.push(skill);
  }

  for (const agent of agents) {
    if (!skill.agents.includes(agent)) {
      skill.agents.push(agent);
    }
  }

  writeManifest(configHome, manifest);
}

export function removeExtensionFromManifest(
  configHome: string,
  skillName: string,
  agent: AgentType,
): boolean {
  const manifest = readManifest(configHome);

  for (const originGroup of manifest.skills) {
    const skillIndex = originGroup.skills.findIndex((s) => s.name === skillName);

    if (skillIndex !== -1) {
      const skill = originGroup.skills[skillIndex];

      skill.agents = skill.agents.filter((a) => a !== agent);

      if (skill.agents.length === 0) {
        originGroup.skills.splice(skillIndex, 1);
      }

      writeManifest(configHome, manifest);
      return true;
    }
  }

  return false;
}

export function getSkillsByOrigin(configHome: string, origin: string): SkillEntry[] {
  const manifest = readManifest(configHome);
  const originGroup = manifest.skills.find((g) => g.origin === origin);
  return originGroup?.skills || [];
}

export function removeAllSkillsFromOrigin(
  configHome: string,
  origin: string,
): { removed: SkillEntry[]; agents: AgentType[] } {
  const manifest = readManifest(configHome);
  const originGroupIndex = manifest.skills.findIndex((g) => g.origin === origin);

  if (originGroupIndex === -1) {
    return { removed: [], agents: [] };
  }

  const originGroup = manifest.skills[originGroupIndex];
  const removed = [...originGroup.skills];
  const agentsSet = new Set<AgentType>();

  for (const skill of removed) {
    for (const agent of skill.agents) {
      agentsSet.add(agent);
    }
  }

  manifest.skills.splice(originGroupIndex, 1);
  writeManifest(configHome, manifest);

  return { removed, agents: Array.from(agentsSet) };
}
