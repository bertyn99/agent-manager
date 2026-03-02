import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "pathe";
import { mkdirSync, rmSync, existsSync } from "fs";

const TEST_STATE_DIR = join(__dirname, ".test-state");
const TEST_CONFIG_PATH = join(TEST_STATE_DIR, "scheduler.json");

describe("Scheduler Module", () => {
  beforeEach(async () => {
    // Reset module cache to ensure fresh imports
    vi.resetModules();

    // Set test config path
    process.env.AGENT_SCHEDULER_PATH = TEST_CONFIG_PATH;

    // Clean up test state directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test state
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
    // Clean up env var
    delete process.env.AGENT_SCHEDULER_PATH;
  });

  it("should create a new schedule", async () => {
    const { createSchedule } = await import("./scheduler");
    const result = await createSchedule("daily-test", "daily", 7, true);

    expect(result.id).toBe("daily-test");
    expect(result.interval).toBe("daily");
    expect(result.retention).toBe(7);
    expect(result.enabled).toBe(true);
  });

  it("should throw error for invalid interval", async () => {
    const { createSchedule } = await import("./scheduler");
    await expect(createSchedule("test", "invalid", 7, true)).rejects.toThrow(
      "Invalid interval: invalid. Valid options: daily, weekly, hourly, monthly",
    );
  });

  it("should throw error for schedule name collision", async () => {
    const { createSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);

    await expect(createSchedule("daily-test", "daily", 7, true)).rejects.toThrow(
      "Schedule 'daily-test' already exists",
    );
  });

  it("should get existing schedule", async () => {
    const { createSchedule, getSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);

    const schedule = getSchedule("daily-test");
    expect(schedule).toBeDefined();
    expect(schedule?.interval).toBe("daily");
    expect(schedule?.retention).toBe(7);
    expect(schedule?.enabled).toBe(true);
  });

  it("should list all schedules", async () => {
    const { createSchedule, listSchedules } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);

    const schedules = listSchedules();
    expect(typeof schedules).toBe("object");
    expect(Object.keys(schedules)).toContain("daily-test");
    expect(schedules["daily-test"]).toBeDefined();
  });

  it("should enable a schedule", async () => {
    const { createSchedule, enableSchedule, getSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, false);
    await enableSchedule("daily-test");

    const schedule = getSchedule("daily-test");
    expect(schedule?.enabled).toBe(true);
  });

  it("should disable a schedule", async () => {
    const { createSchedule, disableSchedule, getSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);
    await disableSchedule("daily-test");

    const schedule = getSchedule("daily-test");
    expect(schedule?.enabled).toBe(false);
  });

  it("should update schedule interval", async () => {
    const { createSchedule, updateSchedule, getSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);
    await updateSchedule("daily-test", "weekly");

    const schedule = getSchedule("daily-test");
    expect(schedule?.interval).toBe("weekly");
  });

  it("should update schedule retention", async () => {
    const { createSchedule, updateSchedule, getSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);
    await updateSchedule("daily-test", undefined, 14);

    const schedule = getSchedule("daily-test");
    expect(schedule?.retention).toBe(14);
  });

  it("should delete a schedule", async () => {
    const { createSchedule, deleteSchedule, getSchedule } = await import("./scheduler");
    await createSchedule("daily-test", "daily", 7, true);
    await deleteSchedule("daily-test");

    const schedule = getSchedule("daily-test");
    expect(schedule).toBeUndefined();
  });
});
