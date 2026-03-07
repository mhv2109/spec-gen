/**
 * Stage 6: ADR Enrichment
 *
 * Expands architectural decisions into full ADRs.
 */

import { PROMPTS } from '../prompts.js';
import type { ArchitectureSynthesis, EnrichedADR, PipelineContext, StageResult } from '../../../types/pipeline.js';

export async function runStage6(
  pipeline: PipelineContext,
  architecture: ArchitectureSynthesis
): Promise<StageResult<EnrichedADR[]>> {
  const startTime = Date.now();

  const userPrompt = `Expand these ${architecture.keyDecisions.length} architectural decisions into full ADRs:

${architecture.keyDecisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;

  try {
    const result = await pipeline.llm.completeJSON<EnrichedADR[]>({
      systemPrompt: PROMPTS.stage6_adr(architecture),
      userPrompt,
      temperature: 0.3,
      maxTokens: 5000,
    });

    const stageResult: StageResult<EnrichedADR[]> = {
      stage: 'adr',
      success: true,
      data: result,
      tokens: pipeline.llm.getTokenUsage().totalTokens,
      duration: Date.now() - startTime,
    };

    if (pipeline.options.saveIntermediate) {
      await pipeline.saveResult('stage6-adr-enrichment', stageResult);
    }

    return stageResult;
  } catch (error) {
    return {
      stage: 'adr',
      success: false,
      error: (error as Error).message,
      tokens: 0,
      duration: Date.now() - startTime,
    };
  }
}
