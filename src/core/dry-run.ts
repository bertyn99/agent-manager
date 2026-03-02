import { logger } from "../utils/logger.js";

export function withDryRun<T>(
  operationName: string,
  isDryRun: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  if (isDryRun) {
    logger.info(`[DRY RUN] Would ${operationName}...`);
    // Return a resolved promise without executing the function
    return Promise.resolve(undefined) as Promise<T>;
  }
  return fn();
}
