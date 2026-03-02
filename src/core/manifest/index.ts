export type { AgentManagerManifest, SkillOriginGroup, SkillEntry } from "../types.js";

export { getManifestPath, readManifest, writeManifest, clearManifest } from "./core.js";
export { filterSkillsByRules } from "./filter.js";
export { addMcpToManifest, removeMcpFromManifest } from "./mcp.js";
export {
  addSkillOriginGroup,
  updateSkillInOrigin,
  getSkillInOrigin,
  addExtensionToManifest,
  removeExtensionFromManifest,
  getSkillsByOrigin,
  removeAllSkillsFromOrigin,
} from "./skills.js";
export {
  cloneSourceToCache,
  parseRepoString,
  syncFromSources,
  importFromOpenCodeManifest,
} from "./sync.js";
