/**
 * Resolve and validate `generation.stage1` from project config for Stage 1 survey prompts.
 */

import logger from '../../utils/logger.js';
import {
  STAGE1_EXHAUSTIVE_MIN_PATHS,
  STAGE1_HIGH_MIN_PATHS,
  STAGE1_MAX_PATHS_PER_CATEGORY,
} from '../../constants.js';
import type { Stage1PathPressurePreset, Stage1PathSelectionConfig } from '../../types/index.js';
import type { ResolvedStage1PathSelection } from '../../types/pipeline.js';

const VALID_PRESETS = new Set<Stage1PathPressurePreset>(['default', 'high', 'exhaustive']);

function presetBaseMins(preset: Stage1PathPressurePreset): { schema: number; service: number; api: number } {
  switch (preset) {
    case 'high':
      return { schema: STAGE1_HIGH_MIN_PATHS, service: STAGE1_HIGH_MIN_PATHS, api: STAGE1_HIGH_MIN_PATHS };
    case 'exhaustive':
      return {
        schema: STAGE1_EXHAUSTIVE_MIN_PATHS,
        service: STAGE1_EXHAUSTIVE_MIN_PATHS,
        api: STAGE1_EXHAUSTIVE_MIN_PATHS,
      };
    default:
      return { schema: 0, service: 0, api: 0 };
  }
}

function clampPathCount(
  key: 'schema' | 'service' | 'api',
  raw: unknown,
  fallback: number
): number {
  if (raw === undefined || raw === null) {
    return Math.min(Math.max(0, Math.floor(fallback)), STAGE1_MAX_PATHS_PER_CATEGORY);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    logger.warning(
      `Invalid generation.stage1.minPathsPerCategory.${key} — using preset default (${fallback})`
    );
    return Math.min(Math.max(0, Math.floor(fallback)), STAGE1_MAX_PATHS_PER_CATEGORY);
  }
  const floored = Math.floor(n);
  if (floored > STAGE1_MAX_PATHS_PER_CATEGORY) {
    logger.warning(
      `generation.stage1.minPathsPerCategory.${key} capped at ${STAGE1_MAX_PATHS_PER_CATEGORY}`
    );
  }
  return Math.min(Math.max(0, floored), STAGE1_MAX_PATHS_PER_CATEGORY);
}

/**
 * Normalize Stage 1 path selection config. Invalid `pathPressure` values fall back to `default`.
 */
export function resolveStage1PathSelection(
  config?: Stage1PathSelectionConfig | null
): ResolvedStage1PathSelection {
  if (!config || typeof config !== 'object') {
    return { preset: 'default', minSchema: 0, minService: 0, minApi: 0 };
  }

  let preset: Stage1PathPressurePreset = config.pathPressure ?? 'default';
  if (!VALID_PRESETS.has(preset)) {
    logger.warning(
      `Invalid generation.stage1.pathPressure "${String(config.pathPressure)}" — using "default"`
    );
    preset = 'default';
  }

  const base = presetBaseMins(preset);
  const mp = config.minPathsPerCategory;

  return {
    preset,
    minSchema: clampPathCount('schema', mp?.schema, base.schema),
    minService: clampPathCount('service', mp?.service, base.service),
    minApi: clampPathCount('api', mp?.api, base.api),
  };
}
