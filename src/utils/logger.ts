// Utils - Logger with Consola v3
// Elegant console logging with reporters and prompts

import { createConsola } from 'consola';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConsolaMethod = (...args: any[]) => void;

// Create configurable logger instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loggerInstance = createConsola() as any;

export const logger = loggerInstance;

// Convenience exports with type assertions
export const info = loggerInstance.info as ConsolaMethod;
export const warn = loggerInstance.warn as ConsolaMethod;
export const error = loggerInstance.error as ConsolaMethod;
export const success = loggerInstance.success as ConsolaMethod;
export const debug = loggerInstance.debug as ConsolaMethod;
export const log = loggerInstance.log as ConsolaMethod;
export const start = loggerInstance.start as ConsolaMethod;
export const fatal = loggerInstance.fatal as ConsolaMethod;
export const box = loggerInstance.box as ConsolaMethod;
export const prompt = loggerInstance.prompt as ConsolaMethod;

// Silent logger for testing
export function createSilentLogger() {
  return createConsola({
    reporters: [
      {
        log() {
          // Suppress all output
        },
      },
    ],
  });
}

// Progress spinner helper
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  start(message);
  try {
    const result = await fn();
    success(message);
    return result;
  } catch {
    error(message);
    throw new Error(`Failed: ${message}`);
  }
}
