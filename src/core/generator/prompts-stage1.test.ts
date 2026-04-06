/**
 * Stage 1 survey prompt building
 */

import { describe, it, expect } from 'vitest';
import { buildStage1SurveySystemPrompt, STAGE1_SURVEY_BASE } from './prompts.js';
import {
  STAGE1_EXHAUSTIVE_MIN_PATHS,
  STAGE1_HIGH_MIN_PATHS,
} from '../../constants.js';

describe('buildStage1SurveySystemPrompt', () => {
  it('returns baseline only for default preset with zero minimums', () => {
    const p = buildStage1SurveySystemPrompt({
      preset: 'default',
      minSchema: 0,
      minService: 0,
      minApi: 0,
    });
    expect(p).toBe(STAGE1_SURVEY_BASE);
    expect(p).not.toContain('Path selection emphasis');
  });

  it('appends path pressure for high preset', () => {
    const p = buildStage1SurveySystemPrompt({
      preset: 'high',
      minSchema: STAGE1_HIGH_MIN_PATHS,
      minService: STAGE1_HIGH_MIN_PATHS,
      minApi: STAGE1_HIGH_MIN_PATHS,
    });
    expect(p.startsWith(STAGE1_SURVEY_BASE)).toBe(true);
    expect(p).toContain('Path selection emphasis');
    expect(p).toContain(`at least ${STAGE1_HIGH_MIN_PATHS} paths`);
  });

  it('includes exhaustive minimums in prompt', () => {
    const p = buildStage1SurveySystemPrompt({
      preset: 'exhaustive',
      minSchema: STAGE1_EXHAUSTIVE_MIN_PATHS,
      minService: STAGE1_EXHAUSTIVE_MIN_PATHS,
      minApi: STAGE1_EXHAUSTIVE_MIN_PATHS,
    });
    expect(p).toContain(String(STAGE1_EXHAUSTIVE_MIN_PATHS));
  });

  it('adds emphasis when only one category has a minimum under default preset', () => {
    const p = buildStage1SurveySystemPrompt({
      preset: 'default',
      minSchema: 7,
      minService: 0,
      minApi: 0,
    });
    expect(p).toContain('Path selection emphasis');
    expect(p).toContain('schemaFiles: at least 7 paths');
    expect(p).not.toContain('serviceFiles: at least');
  });
});
