export function filterSkillsByRules(
  allSkillFolders: string[],
  include: string[],
  exclude: string[],
): string[] {
  if (include.length > 0) {
    return allSkillFolders.filter((folder) => include.includes(folder));
  }
  if (exclude.length > 0) {
    return allSkillFolders.filter((folder) => !exclude.includes(folder));
  }
  return allSkillFolders;
}
