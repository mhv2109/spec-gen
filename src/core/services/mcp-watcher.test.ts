/**
 * Tests for McpWatcher — handleChange (unit, no real FS watcher needed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LLMContext } from '../analyzer/artifact-generator.js';
import type { SerializedCallGraph } from '../analyzer/call-graph.js';

// ── chokidar mock (prevents real FS watcher from opening) ────────────────────

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
      const watcher = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (!handlers.has(event)) handlers.set(event, []);
          handlers.get(event)!.push(handler);
          // Fire 'ready' synchronously so start() resolves in tests
          if (event === 'ready') handler();
          return watcher;
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      return watcher;
    }),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<LLMContext> = {}): LLMContext {
  return {
    phase1_survey: { purpose: '', files: [], totalTokens: 0 },
    phase2_deep:   { purpose: '', files: [], totalTokens: 0 },
    phase3_validation: { purpose: '', files: [], totalTokens: 0 },
    signatures: [],
    ...overrides,
  };
}

function makeCallGraph(): SerializedCallGraph {
  return {
    nodes: [], edges: [], classes: [], inheritanceEdges: [],
    hubFunctions: [], entryPoints: [], layerViolations: [],
    stats: { totalNodes: 0, totalEdges: 0, avgFanIn: 0, avgFanOut: 0 },
  };
}

async function setupProject(ctx: LLMContext): Promise<{ rootPath: string; outputPath: string; contextPath: string }> {
  const rootPath = await mkdtemp(join(tmpdir(), 'mcp-watcher-test-'));
  const outputPath = join(rootPath, '.spec-gen', 'analysis');
  await mkdir(outputPath, { recursive: true });
  const contextPath = join(outputPath, 'llm-context.json');
  await writeFile(contextPath, JSON.stringify(ctx, null, 2), 'utf-8');
  return { rootPath, outputPath, contextPath };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('McpWatcher.handleChange', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('updates signatures for a changed TypeScript file', async () => {
    const ctx = makeContext();
    const { rootPath, outputPath, contextPath } = await setupProject(ctx);

    await mkdir(join(rootPath, 'src'), { recursive: true });
    const srcFile = join(rootPath, 'src', 'auth.ts');
    await writeFile(srcFile, 'export function login(user: string): boolean { return true; }', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await watcher.handleChange(srcFile);

    const updated = JSON.parse(await readFile(contextPath, 'utf-8')) as LLMContext;
    const entry = updated.signatures?.find(s => s.path === 'src/auth.ts');
    expect(entry).toBeDefined();
    expect(entry!.path).toBe('src/auth.ts');
    expect(entry!.language).toBe('TypeScript');
  });

  it('does not touch callGraph when patching signatures', async () => {
    const cg = makeCallGraph();
    const ctx = makeContext({ callGraph: cg });
    const { rootPath, outputPath, contextPath } = await setupProject(ctx);

    const srcFile = join(rootPath, 'index.ts');
    await writeFile(srcFile, 'export function foo() {}', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await watcher.handleChange(srcFile);

    const updated = JSON.parse(await readFile(contextPath, 'utf-8')) as LLMContext;
    expect(updated.callGraph).toEqual(cg);
  });

  it('replaces an existing signature entry for the same file', async () => {
    const ctx = makeContext({
      signatures: [{ path: 'src/foo.ts', language: 'TypeScript', entries: [] }],
    });
    const { rootPath, outputPath, contextPath } = await setupProject(ctx);

    await mkdir(join(rootPath, 'src'), { recursive: true });
    const srcFile = join(rootPath, 'src', 'foo.ts');
    await writeFile(srcFile, 'export function bar() {}', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await watcher.handleChange(srcFile);

    const updated = JSON.parse(await readFile(contextPath, 'utf-8')) as LLMContext;
    const entries = updated.signatures?.filter(s => s.path === 'src/foo.ts');
    expect(entries).toHaveLength(1);   // no duplicate
  });

  it('inserts a new entry when the file was not previously indexed', async () => {
    const ctx = makeContext({
      signatures: [{ path: 'src/other.ts', language: 'TypeScript', entries: [] }],
    });
    const { rootPath, outputPath, contextPath } = await setupProject(ctx);

    const srcFile = join(rootPath, 'new.ts');
    await writeFile(srcFile, 'export function baz() {}', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await watcher.handleChange(srcFile);

    const updated = JSON.parse(await readFile(contextPath, 'utf-8')) as LLMContext;
    expect(updated.signatures?.some(s => s.path === 'new.ts')).toBe(true);
    expect(updated.signatures?.some(s => s.path === 'src/other.ts')).toBe(true);
  });

  it('skips test files and does not write llm-context.json', async () => {
    const ctx = makeContext();
    const { rootPath, outputPath, contextPath } = await setupProject(ctx);
    const before = await readFile(contextPath, 'utf-8');

    const testFile = join(rootPath, 'auth.test.ts');
    await writeFile(testFile, 'it("test", () => {})', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await watcher.handleChange(testFile);

    const after = await readFile(contextPath, 'utf-8');
    expect(after).toBe(before);   // unchanged
  });

  it('skips files with unknown language', async () => {
    const ctx = makeContext();
    const { rootPath, outputPath, contextPath } = await setupProject(ctx);
    const before = await readFile(contextPath, 'utf-8');

    const txtFile = join(rootPath, 'notes.txt');
    await writeFile(txtFile, 'some text', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await watcher.handleChange(txtFile);

    const after = await readFile(contextPath, 'utf-8');
    expect(after).toBe(before);
  });

  it('warns to stderr and does not throw when llm-context.json is missing', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'mcp-watcher-missing-'));
    const outputPath = join(rootPath, '.spec-gen', 'analysis');
    // Do NOT create outputPath — simulate analyze never having been run

    const srcFile = join(rootPath, 'foo.ts');
    await writeFile(srcFile, 'export function x() {}', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await expect(watcher.handleChange(srcFile)).resolves.not.toThrow();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('run analyze first'));
  });

  it('warns to stderr and does not throw when llm-context.json is corrupted', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'mcp-watcher-corrupt-'));
    const outputPath = join(rootPath, '.spec-gen', 'analysis');
    await mkdir(outputPath, { recursive: true });
    await writeFile(join(outputPath, 'llm-context.json'), '{ invalid json !!!', 'utf-8');

    const srcFile = join(rootPath, 'foo.ts');
    await writeFile(srcFile, 'export function x() {}', 'utf-8');

    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath, outputPath });
    await expect(watcher.handleChange(srcFile)).resolves.not.toThrow();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('run analyze first'));
  });
});

// ── Debounce ──────────────────────────────────────────────────────────────────

describe('McpWatcher debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid changes to the same file into one handleChange call', async () => {
    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath: '/tmp/proj', debounceMs: 200 });
    const spy = vi.spyOn(watcher, 'handleChange').mockResolvedValue(undefined);

    // Simulate 5 rapid saves
    for (let i = 0; i < 5; i++) {
      (watcher as unknown as { scheduleChange(p: string): void }).scheduleChange('/tmp/proj/src/foo.ts');
    }

    await vi.runAllTimersAsync();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fires separate handleChange for two different files', async () => {
    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath: '/tmp/proj', debounceMs: 200 });
    const spy = vi.spyOn(watcher, 'handleChange').mockResolvedValue(undefined);

    (watcher as unknown as { scheduleChange(p: string): void }).scheduleChange('/tmp/proj/src/a.ts');
    (watcher as unknown as { scheduleChange(p: string): void }).scheduleChange('/tmp/proj/src/b.ts');

    await vi.runAllTimersAsync();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ── start / stop ──────────────────────────────────────────────────────────────

describe('McpWatcher start/stop', () => {
  it('starts without throwing and stop resolves', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { McpWatcher } = await import('./mcp-watcher.js');
    const watcher = new McpWatcher({ rootPath: '/tmp/proj' });
    await expect(watcher.start()).resolves.not.toThrow();
    await expect(watcher.stop()).resolves.not.toThrow();
  });
});
