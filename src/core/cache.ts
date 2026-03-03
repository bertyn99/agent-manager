/**
 * File cache with mtime-based invalidation, LRU eviction, and content hashing
 */
import { statSync, readFileSync, existsSync } from "node:fs";
import { hash } from "ohash";

const MAX_CACHE_SIZE = 100;

interface CacheEntry<T> {
  content: T;
  mtime: number;
  contentHash?: string;
}

const fileCache = new Map<string, CacheEntry<unknown>>();

function ensureCapacity(): void {
  if (fileCache.size >= MAX_CACHE_SIZE) {
    const firstKey = fileCache.keys().next().value;
    if (firstKey !== undefined) {
      fileCache.delete(firstKey);
    }
  }
}

export interface CachedReadOptions<T> {
  parse: (content: string) => T;
  validate?: (result: T) => boolean;
  defaultValue?: T;
  /** Use content hash for deep equality checks (slower but more accurate) */
  useContentHash?: boolean;
}

export function cachedRead<T>(path: string, options: CachedReadOptions<T>): T;
export function cachedRead<T>(path: string, parse: (content: string) => T): T;
export function cachedRead<T>(
  path: string, 
  parseOrOptions: ((content: string) => T) | CachedReadOptions<T>
): T {
  const options: CachedReadOptions<T> = typeof parseOrOptions === "function"
    ? { parse: parseOrOptions }
    : parseOrOptions;
  
  const { parse, validate, defaultValue, useContentHash } = options;

  if (!existsSync(path)) {
    fileCache.delete(path);
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`File not found: ${path}`);
  }

  try {
    const stats = statSync(path);
    const mtime = stats.mtimeMs;
    const cached = fileCache.get(path);
    const rawContent = readFileSync(path, "utf-8");
    const contentHash = useContentHash ? hash(rawContent) : undefined;

    // Fast path: mtime unchanged and no content hash validation needed
    if (cached && cached.mtime === mtime) {
      if (useContentHash && contentHash && cached.contentHash) {
        // Hybrid: verify content hash for deep equality
        if (cached.contentHash === contentHash) {
          const cachedContent = cached.content as T;
          if (validate && !validate(cachedContent)) {
            fileCache.delete(path);
          } else {
            return cachedContent;
          }
        }
        // mtime same but content changed (edge case: same mtime, different content)
        // Fall through to re-read
      } else {
        const cachedContent = cached.content as T;
        if (validate && !validate(cachedContent)) {
          fileCache.delete(path);
        } else {
          return cachedContent;
        }
      }
    }

    ensureCapacity();

    const content = parse(rawContent);

    if (validate && !validate(content)) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Parsed content failed validation for: ${path}`);
    }

    fileCache.delete(path);
    fileCache.set(path, { content, mtime, contentHash });

    return content;
  } catch (error) {
    fileCache.delete(path);
    
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    
    throw error;
  }
}

export function invalidateCache(path: string): void {
  fileCache.delete(path);
}

export function clearCache(): void {
  fileCache.clear();
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: fileCache.size,
    keys: Array.from(fileCache.keys()),
  };
}

/**
 * Deep equality check using ohash
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return hash(a) === hash(b);
}

/**
 * Compute content hash for any value
 */
export function computeHash(value: unknown): string {
  return hash(value);
}
