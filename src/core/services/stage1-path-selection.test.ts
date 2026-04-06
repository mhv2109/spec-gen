/**
 * Unit tests for Stage 1 path selection config resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  default: {
    warning: vi.fn(),
    analysis: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import logger from '../../utils/logger.js';
import { resolveStage1PathSelection } from './stage1-path-selection.js';
import {
  STAGE1_EXHAUSTIVE_MIN_PATHS,
  STAGE1_HIGH_MIN_PATHS,
  STAGE1_MAX_PATHS_PER_CATEGORY,
} from '../../constants.js';

describe('resolveStage1PathSelection', () => {
  beforeEach(() => {
    vi.mocked(logger.warning).mockClear();
  });

  it('returns all zeros for undefined config', () => {
    expect(resolveStage1PathSelection(undefined)).toEqual({
      preset: 'default',
      minSchema: 0,
      minService: 0,
      minApi: 0,
    });
  });

  it('applies high preset minimums', () => {
    expect(resolveStage1PathSelection({ pathPressure: 'high' })).toEqual({
      preset: 'high',
      minSchema: STAGE1_HIGH_MIN_PATHS,
      minService: STAGE1_HIGH_MIN_PATHS,
      minApi: STAGE1_HIGH_MIN_PATHS,
    });
  });

  it('applies exhaustive preset minimums', () => {
    expect(resolveStage1PathSelection({ pathPressure: 'exhaustive' })).toEqual({
      preset: 'exhaustive',
      minSchema: STAGE1_EXHAUSTIVE_MIN_PATHS,
      minService: STAGE1_EXHAUSTIVE_MIN_PATHS,
      minApi: STAGE1_EXHAUSTIVE_MIN_PATHS,
    });
  });

  it('warns and uses default for invalid preset', () => {
    // Intentionally invalid preset string from JSON
    const r = resolveStage1PathSelection({ pathPressure: 'mega' as never });
    expect(r.preset).toBe('default');
    expect(r.minSchema).toBe(0);
    expect(logger.warning).toHaveBeenCalled();
  });

  it('overrides per category with clamping', () => {
    const r = resolveStage1PathSelection({
      pathPressure: 'high',
      minPathsPerCategory: { schema: 10, service: 999 },
    });
    expect(r.minSchema).toBe(10);
    expect(r.minService).toBe(STAGE1_MAX_PATHS_PER_CATEGORY);
    expect(logger.warning).toHaveBeenCalled();
  });

  it('allows default preset with explicit minimums only', () => {
    const r = resolveStage1PathSelection({
      pathPressure: 'default',
      minPathsPerCategory: { api: 5 },
    });
    expect(r.preset).toBe('default');
    expect(r.minApi).toBe(5);
    expect(r.minSchema).toBe(0);
  });

  it('warns on invalid numeric and uses fallback', () => {
    const r = resolveStage1PathSelection({
      pathPressure: 'high',
      minPathsPerCategory: { schema: 'nope' as unknown as number },
    });
    expect(r.minSchema).toBe(STAGE1_HIGH_MIN_PATHS);
    expect(logger.warning).toHaveBeenCalled();
  });
});
