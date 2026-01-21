// Utils - Path utilities with Pathe
// Cross-platform path normalization and utilities

import {
  normalize,
  join,
  resolve,
  dirname,
  basename,
  extname,
  relative,
  isAbsolute,
  parse,
  format,
  toNamespacedPath,
  posix,
  win32,
} from 'pathe';

// Re-export for convenience
export {
  normalize,
  join,
  resolve,
  dirname,
  basename,
  extname,
  relative,
  isAbsolute,
  parse,
  format,
  toNamespacedPath,
};

// Always use POSIX-style paths (forward slashes) for consistency
export function joinPath(...paths: string[]): string {
  return posix.join(...paths);
}

export function resolvePath(...paths: string[]): string {
  return posix.resolve(...paths);
}

// Normalize to forward slashes regardless of OS
export function normalizePath(path: string): string {
  return normalize(path).replace(/\\/g, '/');
}

// Get relative path with forward slashes
export function relativePath(from: string, to: string): string {
  return posix.relative(from, to);
}

// Check if path is absolute (with forward slashes)
export function isAbsolutePath(path: string): boolean {
  return posix.isAbsolute(path);
}

// Get extension without dot
export function getExtension(path: string): string {
  return extname(path).replace(/^\./, '');
}

// Get filename without extension
export function getBasename(path: string): string {
  return basename(path, getExtension(path));
}

// Ensure path ends without slash
export function withoutTrailingSlash(path: string): string {
  return path.replace(/\/$/, '');
}

// Ensure path ends with slash
export function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : path + '/';
}

// Convert Windows path to POSIX
export function toPosixPath(windowsPath: string): string {
  return windowsPath.replace(/\\/g, '/');
}

// Get parent directory
export function getParentDir(path: string): string {
  return dirname(normalizePath(path));
}

// Safe join that handles edge cases
export function safeJoin(base: string, ...paths: string[]): string {
  const normalizedBase = normalizePath(base);
  return paths.reduce((acc, path) => {
    if (isAbsolutePath(path)) {
      return normalizePath(path);
    }
    return joinPath(acc, path);
  }, normalizedBase);
}

// Type guards
export function isFilePath(path: string): boolean {
  const ext = getExtension(path);
  return Boolean(ext) && !path.endsWith('/');
}

export function isDirPath(path: string): boolean {
  return path.endsWith('/') || (!getExtension(path) && !isAbsolutePath(path));
}
