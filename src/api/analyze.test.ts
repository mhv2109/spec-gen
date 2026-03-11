/**
 * Tests for specGenAnalyze programmatic API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { specGenAnalyze } from './analyze.js';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../core/services/config-manager.js', () => ({
  readSpecGenConfig: vi.fn(),
}));

vi.mock('../core/analyzer/repository-mapper.js', () => ({
  RepositoryMapper: vi.fn().mockImplementation(function (this: unknown) {
    Object.assign(this as object, { map: vi.fn() });
  }),
}));

vi.mock('../core/analyzer/dependency-graph.js', () => ({
  DependencyGraphBuilder: vi.fn().mockImplementation(function (this: unknown) {
    Object.assign(this as object, { build: vi.fn() });
  }),
}));

vi.mock('../core/analyzer/artifact-generator.js', () => ({
  AnalysisArtifactGenerator: vi.fn().mockImplementation(function (this: unknown) {
    Object.assign(this as object, { generateAndSave: vi.fn() });
  }),
}));

import { access, stat, readFile } from 'node:fs/promises';
import { readSpecGenConfig } from '../core/services/config-manager.js';
import { RepositoryMapper } from '../core/analyzer/repository-mapper.js';
import { DependencyGraphBuilder } from '../core/analyzer/dependency-graph.js';
import { AnalysisArtifactGenerator } from '../core/analyzer/artifact-generator.js';

const mockAccess = vi.mocked(access);
const mockStat = vi.mocked(stat);
const mockReadFile = vi.mocked(readFile);
const mockReadSpecGenConfig = vi.mocked(readSpecGenConfig);

// ============================================================================
// FIXTURES
// ============================================================================

const ROOT = '/test/project';
const MOCK_CONFIG = { version: '1.0.0', openspecPath: './openspec' };
const MOCK_REPO_STRUCTURE = JSON.stringify({ architecture: { pattern: 'layered' }, domains: [] });
const MOCK_DEP_GRAPH = JSON.stringify({
  statistics: {
    nodeCount: 1,
    edgeCount: 0,
    clusterCount: 0,
    cycleCount: 0,
    avgDegree: 0,
    density: 0,
  },
});
const MOCK_ARTIFACTS = {
  repoStructure: { architecture: { pattern: 'layered' }, domains: [] },
  llmContext: { callGraph: null },
};
const OLD_MTIME = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
const RECENT_MTIME = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

function setupMocks() {
  mockReadSpecGenConfig.mockResolvedValue(
    MOCK_CONFIG as ReturnType<typeof readSpecGenConfig> extends Promise<infer T> ? T : never
  );

  vi.mocked(RepositoryMapper).mockImplementation(function (this: unknown) {
    Object.assign(this as object, {
      map: vi.fn().mockResolvedValue({
        allFiles: [],
        highValueFiles: [],
        summary: { totalFiles: 1, analyzedFiles: 1, skippedFiles: 0, languages: ['typescript'] },
      }),
    });
  });

  vi.mocked(DependencyGraphBuilder).mockImplementation(function (this: unknown) {
    Object.assign(this as object, {
      build: vi.fn().mockResolvedValue({
        statistics: {
          nodeCount: 1,
          edgeCount: 0,
          clusterCount: 0,
          cycleCount: 0,
          avgDegree: 0,
          density: 0,
        },
      }),
    });
  });

  vi.mocked(AnalysisArtifactGenerator).mockImplementation(function (this: unknown) {
    Object.assign(this as object, { generateAndSave: vi.fn().mockResolvedValue(MOCK_ARTIFACTS) });
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('specGenAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('config validation', () => {
    it('throws if no spec-gen config found', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockReadSpecGenConfig.mockResolvedValue(
        null as unknown as ReturnType<typeof readSpecGenConfig> extends Promise<infer T> ? T : never
      );

      await expect(specGenAnalyze({ rootPath: ROOT })).rejects.toThrow();
    });
  });

  describe('cache hit — recent analysis', () => {
    beforeEach(() => {
      mockAccess.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ mtime: RECENT_MTIME } as Awaited<ReturnType<typeof stat>>);
      mockReadFile.mockImplementation((path) => {
        const p = String(path);
        if (p.includes('dependency-graph')) return Promise.resolve(MOCK_DEP_GRAPH);
        return Promise.resolve(MOCK_REPO_STRUCTURE);
      });
    });

    it('skips mapper when recent cache exists', async () => {
      await specGenAnalyze({ rootPath: ROOT });
      expect(RepositoryMapper).not.toHaveBeenCalled();
    });

    it('force=true bypasses cache and runs full analysis', async () => {
      await specGenAnalyze({ rootPath: ROOT, force: true });
      expect(RepositoryMapper).toHaveBeenCalled();
    });
  });

  describe('cache miss — stale analysis', () => {
    beforeEach(() => {
      mockAccess.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ mtime: OLD_MTIME } as Awaited<ReturnType<typeof stat>>);
    });

    it('runs full analysis pipeline', async () => {
      await specGenAnalyze({ rootPath: ROOT });

      expect(RepositoryMapper).toHaveBeenCalled();
      expect(DependencyGraphBuilder).toHaveBeenCalled();
      expect(AnalysisArtifactGenerator).toHaveBeenCalled();
    });
  });

  describe('cache miss — no existing file', () => {
    beforeEach(() => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
    });

    it('runs full analysis pipeline', async () => {
      await specGenAnalyze({ rootPath: ROOT });

      expect(RepositoryMapper).toHaveBeenCalled();
      expect(AnalysisArtifactGenerator).toHaveBeenCalled();
    });

    it('returns analysis result with repo map', async () => {
      const result = await specGenAnalyze({ rootPath: ROOT });
      expect(result.repoMap).toBeDefined();
      expect(result.depGraph).toBeDefined();
    });
  });

  describe('progress callbacks', () => {
    beforeEach(() => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
    });

    it('fires progress events during analysis', async () => {
      const events: Array<{ step: string; status: string }> = [];
      await specGenAnalyze({
        rootPath: ROOT,
        onProgress: (e) => events.push({ step: e.step, status: e.status }),
      });
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.step.includes('Scanning') || e.step.includes('Building'))).toBe(
        true
      );
    });
  });
});
