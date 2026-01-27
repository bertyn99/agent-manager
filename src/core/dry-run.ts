export function withDryRun<T>(
  operationName: string,
  isDryRun: boolean,
  fn: () => Promise<T>
): Promise<T> {
  if (isDryRun) {
    const { logger } = require('../utils/logger.js');
    logger.info(`[DRY RUN] Would ${operationName}...`);
  }
  return fn();
}
