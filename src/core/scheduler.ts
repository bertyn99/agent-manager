/**
 * Scheduled Backups Module - Phase 2 Feature
 *
 * Exports schedule management functionality
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "pathe";
import { homedir } from "os";

/**
 * Get the scheduler config path
 * Can be overridden via AGENT_SCHEDULER_PATH env var for testing
 */
function getConfigPath(): string {
  if (process.env.AGENT_SCHEDULER_PATH) {
    return process.env.AGENT_SCHEDULER_PATH;
  }
  return join(homedir(), ".config", "agent-manager", "scheduler.json");
}

/**
 * Scheduler configuration interface
 */
export interface Schedule {
  interval: string; // cron-like: "daily", "weekly", "0 2 * * *"
  retention: number; // keep N backups
  enabled: boolean;
  lastRun?: string; // ISO timestamp of last run
}

/**
 * Schedules configuration (map of named schedules)
 */
export type Schedules = Record<string, Schedule>;

/**
 * Scheduler handle for managing background jobs
 */
export interface SchedulerHandle {
  id: string;
  interval: string;
  retention: number;
  enabled: boolean;
}

/**
 * Scheduler state persisted to file
 */
export interface SchedulerState {
  version: string;
  schedules: Schedules;
}

/**
 * Create a new schedule
 */
export async function createSchedule(
  name: string,
  interval: string,
  retention: number,
  enabled: boolean = true,
): Promise<SchedulerHandle> {
  const configPath = getConfigPath();

  // Load existing state
  let state: SchedulerState;
  if (existsSync(configPath)) {
    state = JSON.parse(readFileSync(configPath, "utf-8"));
  } else {
    state = {
      version: "1.0",
      schedules: {},
    };
  }

  // Validate interval
  const validIntervals = ["daily", "weekly", "hourly", "monthly"];
  if (!validIntervals.includes(interval)) {
    throw new Error(`Invalid interval: ${interval}. Valid options: ${validIntervals.join(", ")}`);
  }

  // Check for duplicate schedule name
  if (state.schedules[name]) {
    throw new Error(`Schedule '${name}' already exists`);
  }

  // Add new schedule
  state.schedules[name] = {
    interval,
    retention,
    enabled,
    lastRun: undefined,
  };

  // Ensure directory exists
  mkdirSync(dirname(configPath), { recursive: true });

  // Save state
  writeFileSync(configPath, JSON.stringify(state, null, 2), "utf-8");

  return {
    id: name,
    interval,
    retention,
    enabled,
  };
}

/**
 * Get a schedule by name
 */
export function getSchedule(name: string): SchedulerHandle | undefined {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return undefined;
  }

  const state = JSON.parse(readFileSync(configPath, "utf-8"));
  return state.schedules[name];
}

/**
 * List all schedules
 */
export function listSchedules(): Schedules {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return {};
  }

  const state = JSON.parse(readFileSync(configPath, "utf-8"));
  return state.schedules;
}

/**
 * Enable a schedule
 */
export async function enableSchedule(name: string): Promise<void> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error("Scheduler state file not found. Run: agent-manager scheduler init");
  }

  const state = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!state.schedules[name]) {
    throw new Error(`Schedule '${name}' not found`);
  }

  state.schedules[name].enabled = true;
  writeFileSync(configPath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Disable a schedule
 */
export async function disableSchedule(name: string): Promise<void> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error("Scheduler state file not found. Run: agent-manager scheduler init");
  }

  const state = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!state.schedules[name]) {
    throw new Error(`Schedule '${name}' not found`);
  }

  state.schedules[name].enabled = false;
  writeFileSync(configPath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Update a schedule
 */
export async function updateSchedule(
  name: string,
  interval?: string,
  retention?: number,
  enabled?: boolean,
): Promise<void> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error("Scheduler state file not found. Run: agent-manager scheduler init");
  }

  const state = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!state.schedules[name]) {
    throw new Error(`Schedule '${name}' not found`);
  }

  const schedule = state.schedules[name];

  if (interval !== undefined) {
    schedule.interval = interval;
  }
  if (retention !== undefined) {
    schedule.retention = retention;
  }
  if (enabled !== undefined) {
    schedule.enabled = enabled;
  }

  state.schedules[name] = schedule;
  writeFileSync(configPath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Delete a schedule
 */
export async function deleteSchedule(name: string): Promise<void> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error("Scheduler state file not found. Run: agent-manager scheduler init");
  }

  const state = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!state.schedules[name]) {
    throw new Error(`Schedule '${name}' not found`);
  }

  delete state.schedules[name];
  writeFileSync(configPath, JSON.stringify(state, null, 2), "utf-8");
}
