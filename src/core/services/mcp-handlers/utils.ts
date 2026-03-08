/**
 * Shared utilities for MCP tool handlers.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { LLMContext } from '../../analyzer/artifact-generator.js';

/**
 * Resolve and validate a user-supplied directory path.
 *
 * Ensures the path resolves to an existing directory, which prevents path
 * traversal attacks where a client supplies `"../../../../etc"` or a plain
 * file path instead of a project directory.
 */
export async function validateDirectory(directory: string): Promise<string> {
  if (!directory || typeof directory !== 'string') {
    throw new Error('directory parameter is required and must be a string');
  }
  const absDir = resolve(directory);
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(absDir);
  } catch {
    throw new Error(`Directory not found: ${absDir}`);
  }
  if (!s.isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }
  return absDir;
}

/**
 * Strip common API key and token patterns from an error message before
 * returning it to MCP clients, to prevent secret leakage via error responses.
 */
export function sanitizeMcpError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/sk-ant-[A-Za-z0-9\-_]{10,}/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9\-_]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+\S{10,}/g, 'Bearer [REDACTED]')
    .replace(/Authorization:\s*\S+/gi, 'Authorization: [REDACTED]')
    .replace(/api[_-]?key[=:]\s*\S{8,}/gi, 'api_key=[REDACTED]');
}

export async function readCachedContext(directory: string): Promise<LLMContext | null> {
  try {
    const raw = await readFile(
      join(directory, '.spec-gen', 'analysis', 'llm-context.json'),
      'utf-8'
    );
    return JSON.parse(raw) as LLMContext;
  } catch {
    return null;
  }
}

/** Returns true if the cached analysis is present and less than 1 hour old. */
export async function isCacheFresh(directory: string): Promise<boolean> {
  try {
    const s = await stat(join(directory, '.spec-gen', 'analysis', 'llm-context.json'));
    return Date.now() - s.mtimeMs < 60 * 60 * 1000;
  } catch {
    return false;
  }
}
