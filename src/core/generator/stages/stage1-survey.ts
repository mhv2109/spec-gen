/**
 * Stage 1: Project Survey
 *
 * Analyzes repository structure to categorize the project and identify key files.
 */

import logger from '../../../utils/logger.js';
import { formatSignatureMaps, STAGE1_MAX_CHARS } from '../../analyzer/signature-extractor.js';
import type { LLMService } from '../../services/llm-service.js';
import type { PipelineOptions, ProjectSurveyResult, StageResult } from '../../../types/pipeline.js';
import type { LLMContext, RepoStructure } from '../../analyzer/artifact-generator.js';
import { PROMPTS } from '../prompts.js';

export async function runStage1(
  llm: LLMService,
  options: PipelineOptions,
  saveResult: (name: string, result: unknown) => Promise<void>,
  repoStructure: RepoStructure,
  llmContext: LLMContext
): Promise<StageResult<ProjectSurveyResult>> {
  if (llmContext.signatures && llmContext.signatures.length > 0) {
    const chunks = formatSignatureMaps(llmContext.signatures, STAGE1_MAX_CHARS);
    if (chunks.length === 1) {
      return runStage1WithSection(llm, options, saveResult, repoStructure, chunks[0], true);
    }
    logger.analysis(`Stage 1: ${chunks.length} signature chunks across ${llmContext.signatures.length} files`);
    const results = await Promise.all(chunks.map((c: string) => runStage1WithSection(llm, options, saveResult, repoStructure, c, true)));
    return mergeStage1Results(results);
  }
  // Legacy fallback — only the 20 files in phase2_deep are visible
  const section = llmContext.phase2_deep.files.map(f => `- ${f.path}`).join('\n');
  return runStage1WithSection(llm, options, saveResult, repoStructure, section, false);
}

/**
 * Single Stage 1 LLM call for one chunk of files/signatures.
 */
export async function runStage1WithSection(
  llm: LLMService,
  options: PipelineOptions,
  saveResult: (name: string, result: unknown) => Promise<void>,
  repoStructure: RepoStructure,
  fileListingSection: string,
  isSignatures: boolean,
): Promise<StageResult<ProjectSurveyResult>> {
  const startTime = Date.now();

  const sectionLabel = isSignatures
    ? 'Function/class signatures extracted from all project files (use exact file paths shown in === headers for schemaFiles/serviceFiles/apiFiles):'
    : 'Available file paths for analysis (use ONLY these exact strings for schemaFiles/serviceFiles/apiFiles):';

  const userPrompt = `Analyze this project structure:

Project Name: ${repoStructure.projectName}
Project Type: ${repoStructure.projectType}
Frameworks: ${repoStructure.frameworks.join(', ')}
Architecture Pattern: ${repoStructure.architecture.pattern}

 Layers:
 ${repoStructure.architecture.layers.map(l => `- ${l.name}: ${l.purpose} (${l.files.length} files)`).join('\n')}

 Detected Domains:
 ${repoStructure.domains.map(d => `- ${d.name}: ${d.files.length} files, entities: ${d.entities.join(', ')}`).join('\n')}

Statistics:
- Total files: ${repoStructure.statistics.totalFiles}
- Analyzed files: ${repoStructure.statistics.analyzedFiles}
- Node count: ${repoStructure.statistics.nodeCount}
- Edge count: ${repoStructure.statistics.edgeCount}
- Clusters: ${repoStructure.statistics.clusterCount}

${sectionLabel}
${fileListingSection}`;

  try {
    const result = await llm.completeJSON<ProjectSurveyResult>({
      systemPrompt: PROMPTS.stage1_survey,
      userPrompt,
      temperature: 0.3,
      maxTokens: 3000,
    });

    const stageResult: StageResult<ProjectSurveyResult> = {
      stage: 'survey',
      success: true,
      data: result,
      tokens: llm.getTokenUsage().totalTokens,
      duration: Date.now() - startTime,
    };

    if (options.saveIntermediate) {
      await saveResult('stage1-survey', stageResult);
    }

    return stageResult;
  } catch (error) {
    return {
      stage: 'survey',
      success: false,
      error: (error as Error).message,
      tokens: 0,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Merge multiple Stage 1 results (from chunked runs) into one.
 * Uses the highest-confidence result for metadata; concatenates + deduplicates file lists.
 */
export function mergeStage1Results(results: StageResult<ProjectSurveyResult>[]): StageResult<ProjectSurveyResult> {
  const successful = results.filter(r => r.success && r.data);
  if (successful.length === 0) return results[0];

  const best = successful.reduce((a, b) => (a.data!.confidence >= b.data!.confidence ? a : b));

  return {
    ...best,
    data: {
      ...best.data!,
      frameworks:       [...new Set(successful.flatMap(r => r.data!.frameworks       ?? []))],
      suggestedDomains: [...new Set(successful.flatMap(r => r.data!.suggestedDomains ?? []))],
      schemaFiles:      [...new Set(successful.flatMap(r => r.data!.schemaFiles      ?? []))],
      serviceFiles:     [...new Set(successful.flatMap(r => r.data!.serviceFiles     ?? []))],
      apiFiles:         [...new Set(successful.flatMap(r => r.data!.apiFiles         ?? []))],
    },
    tokens:   results.reduce((s, r) => s + r.tokens, 0),
    duration: results.reduce((s, r) => s + r.duration, 0),
  };
}
