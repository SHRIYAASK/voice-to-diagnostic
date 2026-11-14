/**
 * Hugging Face Evon LLM Service
 * Model: gnani/gnani-evon-v3.3-30B-A3B
 *
 * Implements an OpenAI-compatible chat completions interface:
 * - Direct connection to vLLM, SGLang, or Hugging Face Dedicated Inference Endpoint
 * - Streaming token processing with dynamic sentence-boundary chunking
 * - Strips internal reasoning traces (<think>...</think>) per model card instructions
 *   using chat_template_kwargs: { "enable_thinking": false }
 * - Never silently falls back to other models: reports exact endpoint status if unavailable
 */

import dotenv from 'dotenv';

dotenv.config();

const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_MODEL_ID = process.env.HF_MODEL_ID || 'gnani/gnani-evon-v3.3-30B-A3B';
const HF_LLM_BASE_URL = (process.env.HF_LLM_BASE_URL || 'http://localhost:8000/v1').replace(/\/+$/, '');

let _lastHealthCheckTime = 0;
let _cachedReachable = false;

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface EvonCompletionOptions {
  temperature?: number; // default: 0.6
  top_p?: number;       // default: 0.95
  max_tokens?: number;  // default: 1024
  signal?: AbortSignal;
}

/**
 * Strips internal thinking/reasoning tags from generated text
 */
export function stripThinkingTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[THINK\][\s\S]*?\[\/THINK\]/gi, '')
    .trim();
}

/**
 * Splits streaming text chunks at meaningful sentence/phrase boundaries
 * for incremental TTS synthesis.
 */
export class SentenceChunker {
  private buffer = '';
  // Sentence delimiters: Period, Question mark, Exclamation mark, Purna Viram (Hindi ।), newline
  private readonly delimiterRegex = /([.?!।\n]+)(\s+|$)/;

  /**
   * Appends incoming text chunk and yields any completed sentences
   */
  public push(chunk: string): string[] {
    this.buffer += chunk;
    const completedSentences: string[] = [];

    while (true) {
      const match = this.delimiterRegex.exec(this.buffer);
      if (!match) break;

      const boundaryIndex = match.index + match[1].length;
      const sentence = this.buffer.slice(0, boundaryIndex).trim();
      this.buffer = this.buffer.slice(match.index + match[0].length);

      const cleaned = stripThinkingTags(sentence);
      if (cleaned.length > 0) {
        completedSentences.push(cleaned);
      }
    }

    return completedSentences;
  }

  /**
   * Flushes any remaining text in the buffer
   */
  public flush(): string | null {
    const remaining = stripThinkingTags(this.buffer.trim());
    this.buffer = '';
    return remaining.length > 0 ? remaining : null;
  }
}

export const hfEvonService = {
  getModelId: (): string => HF_MODEL_ID,
  getBaseUrl: (): string => HF_LLM_BASE_URL,

  /**
   * Checks health and reachability of the configured Evon inference endpoint
   */
  checkHealth: async (): Promise<{ reachable: boolean; model: string; error?: string }> => {
    try {
      const url = `${HF_LLM_BASE_URL}/models`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

      const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        return { reachable: true, model: HF_MODEL_ID };
      }
      return {
        reachable: false,
        model: HF_MODEL_ID,
        error: `Inference endpoint returned HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      return {
        reachable: false,
        model: HF_MODEL_ID,
        error: `Cannot connect to Evon endpoint at ${HF_LLM_BASE_URL}: ${err.message}`,
      };
    }
  },

  /**
   * Fast reachability check with 15-second caching to prevent latency penalties
   */
  isAvailable: async (): Promise<boolean> => {
    const now = Date.now();
    if (now - _lastHealthCheckTime < 15000) {
      return _cachedReachable;
    }
    _lastHealthCheckTime = now;
    try {
      const url = `${HF_LLM_BASE_URL}/models`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;
      const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(400) });
      _cachedReachable = res.ok;
    } catch {
      _cachedReachable = false;
    }
    return _cachedReachable;
  },

  /**
   * Streams chat completion tokens from gnani/gnani-evon-v3.3-30B-A3B.
   * Calls onSentenceChunk callback as soon as each sentence boundary is reached.
   */
  streamChatCompletion: async (
    messages: ChatMessagePayload[],
    onSentenceChunk: (sentence: string) => Promise<void> | void,
    options: EvonCompletionOptions = {}
  ): Promise<{ fullText: string; totalSentences: number; error?: string }> => {
    const url = `${HF_LLM_BASE_URL}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (HF_TOKEN) {
      headers['Authorization'] = `Bearer ${HF_TOKEN}`;
    }

    const payload = {
      model: HF_MODEL_ID,
      messages,
      temperature: options.temperature ?? 0.6,
      top_p: options.top_p ?? 0.95,
      max_tokens: options.max_tokens ?? 1024,
      stream: true,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    };

    const chunker = new SentenceChunker();
    let accumulatedText = '';
    let sentenceCount = 0;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: options.signal,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        const errorMsg = `Hugging Face Evon endpoint (${HF_MODEL_ID}) failed with HTTP ${res.status}: ${errorBody}`;
        console.error('[Evon LLM Error]', errorMsg);
        return { fullText: '', totalSentences: 0, error: errorMsg };
      }

      if (!res.body) {
        return { fullText: '', totalSentences: 0, error: 'Empty stream response from Evon LLM' };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let streamBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          if (trimmed === 'data: [DONE]') break;

          try {
            const data = JSON.parse(trimmed.slice(5).trim());
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulatedText += delta;
              const sentences = chunker.push(delta);
              for (const s of sentences) {
                sentenceCount++;
                await onSentenceChunk(s);
              }
            }
          } catch {
            // Ignore parse errors on malformed chunks
          }
        }
      }

      // Flush any trailing sentence
      const trailing = chunker.flush();
      if (trailing) {
        sentenceCount++;
        await onSentenceChunk(trailing);
      }

      return {
        fullText: stripThinkingTags(accumulatedText),
        totalSentences: sentenceCount,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          fullText: stripThinkingTags(accumulatedText),
          totalSentences: sentenceCount,
          error: 'Evon generation cancelled by user interruption',
        };
      }
      return {
        fullText: stripThinkingTags(accumulatedText),
        totalSentences: sentenceCount,
        error: `Evon inference request failed: ${err.message}`,
      };
    }
  },
};
