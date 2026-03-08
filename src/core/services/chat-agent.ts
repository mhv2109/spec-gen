/**
 * ChatAgent — agentic tool-use loop for the diagram chatbot.
 *
 * Supports two provider formats:
 *   - OpenAI-compatible  (function calling via /chat/completions)
 *   - Google Gemini      (function calling via generateContent)
 *
 * Provider resolution (same priority as generate.ts):
 *   1. GEMINI_API_KEY                → Gemini
 *   2. OPENAI_COMPAT_BASE_URL        → any OpenAI-compatible endpoint
 *   3. specGenConfig.generation      → reads provider + openaiCompatBaseUrl from config
 *   4. OPENAI_API_KEY                → OpenAI directly
 *
 * Model: OPENAI_COMPAT_MODEL env var → specGenConfig.generation.model → provider default.
 *
 * Max iterations: 8 (prevents runaway loops).
 */

import { CHAT_TOOLS, toChatToolDefinitions } from './chat-tools.js';
import { readSpecGenConfig } from './config-manager.js';

// ============================================================================
// TYPES — OpenAI
// ============================================================================

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OAIResponse {
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: OAIToolCall[] };
    finish_reason: string;
  }>;
}

// ============================================================================
// TYPES — Gemini
// ============================================================================

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: GeminiPart[]; role: string };
    finishReason: string;
  }>;
}

// ============================================================================
// PROVIDER DETECTION
// ============================================================================

type ProviderKind = 'gemini' | 'openai-compat';

interface ProviderConfig {
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

async function resolveProviderConfig(directory: string): Promise<ProviderConfig> {
  const geminiKey     = process.env.GEMINI_API_KEY ?? '';
  const compatBase    = process.env.OPENAI_COMPAT_BASE_URL ?? '';
  const compatKey     = process.env.OPENAI_COMPAT_API_KEY ?? '';
  const openaiKey     = process.env.OPENAI_API_KEY ?? '';
  const envModel      = process.env.OPENAI_COMPAT_MODEL ?? '';

  // Load project config once
  let cfgProvider: string | undefined;
  let cfgBase: string | undefined;
  let cfgModel: string | undefined;
  try {
    const cfg = await readSpecGenConfig(directory);
    cfgProvider = cfg?.generation?.provider;
    cfgBase     = cfg?.generation?.openaiCompatBaseUrl;
    cfgModel    = cfg?.generation?.model;
  } catch { /* ignore */ }

  const effectiveProvider = cfgProvider ?? (geminiKey ? 'gemini' : compatBase ? 'openai-compat' : 'openai-compat');

  if (effectiveProvider === 'gemini' || geminiKey) {
    return {
      kind:    'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      apiKey:  geminiKey,
      model:   envModel || cfgModel || 'gemini-2.0-flash',
    };
  }

  const base = compatBase || cfgBase || 'https://api.openai.com/v1';
  const key  = compatKey  || openaiKey;
  return {
    kind:    'openai-compat',
    baseUrl: base.replace(/\/$/, ''),
    apiKey:  key,
    model:   envModel || cfgModel || 'gpt-4o-mini',
  };
}

// ============================================================================
// SHARED
// ============================================================================

export interface ChatAgentOptions {
  directory: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string) => void;
}

export interface ChatAgentResult {
  reply: string;
  filePaths: string[];
}

const MAX_ITERATIONS = 8;

const SYSTEM_PROMPT = `You are a code analysis assistant embedded in a dependency diagram viewer.
You have access to tools that query the codebase's static analysis data.
When the user asks a question, use the appropriate tools to gather information,
then synthesise a clear, concise answer. Always explain what the highlighted files/functions are.
Keep replies focused and actionable. Use markdown for code and lists.`;

async function executeTool(
  toolMap: Map<string, (typeof CHAT_TOOLS)[number]>,
  directory: string,
  name: string,
  args: Record<string, unknown>,
  callbacks?: Pick<ChatAgentOptions, 'onToolStart' | 'onToolEnd'>
): Promise<{ content: string; filePaths: string[] }> {
  callbacks?.onToolStart?.(name);
  const tool = toolMap.get(name);
  if (!tool) {
    return { content: JSON.stringify({ error: `Unknown tool: ${name}` }), filePaths: [] };
  }
  try {
    const { result, filePaths } = await tool.execute(directory, args);
    const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    callbacks?.onToolEnd?.(name);
    return { content, filePaths };
  } catch (err) {
    callbacks?.onToolEnd?.(name);
    return {
      content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      filePaths: [],
    };
  }
}

// ============================================================================
// OPENAI-COMPATIBLE LOOP
// ============================================================================

async function runOpenAILoop(
  cfg: ProviderConfig,
  directory: string,
  messages: ChatAgentOptions['messages'],
  callbacks?: Pick<ChatAgentOptions, 'onToolStart' | 'onToolEnd'>
): Promise<ChatAgentResult> {
  const toolDefs = toChatToolDefinitions();
  const toolMap  = new Map(CHAT_TOOLS.map(t => [t.name, t]));
  const allFilePaths: string[] = [];

  const history: OAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.model, messages: history, tools: toolDefs, tool_choice: 'auto' }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Chat API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as OAIResponse;
    const choice = data.choices[0];
    if (!choice) throw new Error('Empty response from chat API');

    const msg = choice.message;
    history.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content ?? '(no response)', filePaths: [...new Set(allFilePaths)] };
    }

    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      const { content, filePaths } = await executeTool(toolMap, directory, tc.function.name, args, callbacks);
      allFilePaths.push(...filePaths);
      history.push({ role: 'tool', tool_call_id: tc.id, content });
    }
  }

  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant' && m.content);
  return {
    reply: lastAssistant?.content ?? 'Analysis complete. Check highlighted nodes.',
    filePaths: [...new Set(allFilePaths)],
  };
}

// ============================================================================
// GEMINI LOOP
// ============================================================================

async function runGeminiLoop(
  cfg: ProviderConfig,
  directory: string,
  messages: ChatAgentOptions['messages'],
  callbacks?: Pick<ChatAgentOptions, 'onToolStart' | 'onToolEnd'>
): Promise<ChatAgentResult> {
  const toolMap = new Map(CHAT_TOOLS.map(t => [t.name, t]));
  const allFilePaths: string[] = [];

  // Build function declarations for Gemini
  const functionDeclarations = CHAT_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

  // Convert history to Gemini content format (no system role — handled separately)
  const contents: GeminiContent[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const url = `${cfg.baseUrl}/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const headers = { 'Content-Type': 'application/json' };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ function_declarations: functionDeclarations }],
      tool_config: { function_calling_config: { mode: 'AUTO' } },
    };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Empty response from Gemini API');

    const parts = candidate.content.parts;

    // Collect text and function calls from this turn
    const textParts = parts.filter((p): p is { text: string } => 'text' in p);
    const fnCalls   = parts.filter((p): p is { functionCall: { name: string; args: Record<string, unknown> } } => 'functionCall' in p);

    // Append model turn
    contents.push({ role: 'model', parts });

    if (fnCalls.length === 0) {
      // Final answer — join all text parts
      const reply = textParts.map(p => p.text).join('').trim();
      return { reply: reply || '(no response)', filePaths: [...new Set(allFilePaths)] };
    }

    // Execute tool calls and build a single user turn with all responses
    const responseParts: GeminiPart[] = [];
    for (const fc of fnCalls) {
      const { content, filePaths } = await executeTool(toolMap, directory, fc.functionCall.name, fc.functionCall.args, callbacks);
      allFilePaths.push(...filePaths);
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(content) as Record<string, unknown>; }
      catch { parsed = { result: content }; }
      responseParts.push({ functionResponse: { name: fc.functionCall.name, response: parsed } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  // Max iterations — extract last model text
  const lastModel = [...contents].reverse().find(c => c.role === 'model');
  const lastText  = lastModel?.parts.filter((p): p is { text: string } => 'text' in p).map(p => p.text).join('') ?? '';
  return {
    reply: lastText || 'Analysis complete. Check highlighted nodes.',
    filePaths: [...new Set(allFilePaths)],
  };
}

// ============================================================================
// ENTRY POINT
// ============================================================================

export async function runChatAgent(options: ChatAgentOptions): Promise<ChatAgentResult> {
  const { directory, messages, onToolStart, onToolEnd } = options;
  const cfg = await resolveProviderConfig(directory);
  const callbacks = { onToolStart, onToolEnd };
  return cfg.kind === 'gemini'
    ? runGeminiLoop(cfg, directory, messages, callbacks)
    : runOpenAILoop(cfg, directory, messages, callbacks);
}
