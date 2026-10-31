/**
 * Gnani Timbre TTS Service
 *
 * Implements:
 * 1. Low-latency Server-Sent Events (SSE) streaming TTS (https://api.vachana.ai/api/v1/tts/sse)
 *    - Streams base64 audio chunks progressively as they are generated.
 *    - Supports instant abort / cancellation on user interruption (barge-in).
 * 2. Synchronous REST TTS (https://api.vachana.ai/api/v1/tts/inference)
 *    - Generates complete audio WAV buffer.
 *
 * Model: timbre-v2.5 (default voice: Nalini)
 */

import dotenv from 'dotenv';

dotenv.config();

const GNANI_API_KEY = process.env.GNANI_API_KEY || '';
const TTS_SSE_URL = 'https://api.vachana.ai/api/v1/tts/sse';
const TTS_REST_URL = 'https://api.vachana.ai/api/v1/tts/inference';

export interface TtsSynthesisOptions {
  voice?: string;      // defaults to 'Nalini'
  language?: string;   // defaults to 'en-IN'
  sampleRate?: number; // defaults to 24000
  signal?: AbortSignal;
}

export interface AudioChunkEvent {
  chunkIndex: number;
  audioBase64: string;
}

export const gnaniTtsService = {
  /**
   * Streams synthesized audio chunks via SSE.
   * Calls onChunk callback progressively as chunks arrive.
   */
  streamSynthesize: async (
    text: string,
    onChunk: (chunk: AudioChunkEvent) => void,
    options: TtsSynthesisOptions = {}
  ): Promise<{ success: boolean; chunksReceived: number; error?: string }> => {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      return { success: true, chunksReceived: 0 };
    }

    if (!GNANI_API_KEY) {
      return { success: false, chunksReceived: 0, error: 'GNANI_API_KEY is missing' };
    }

    const voice = options.voice || 'Nalini';
    const language = options.language || 'en-IN';
    const sampleRate = options.sampleRate || 24000;

    try {
      const response = await fetch(TTS_SSE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key-ID': GNANI_API_KEY,
        },
        body: JSON.stringify({
          text: cleanText,
          model: 'timbre-v2.5',
          voice,
          language,
          speed: 1.0,
          audio_config: {
            encoding: 'linear_pcm',
            container: 'wav',
            num_channels: 1,
            sample_rate: sampleRate,
            sample_width: 2,
          },
        }),
        signal: options.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          chunksReceived: 0,
          error: `HTTP ${response.status}: ${errText}`,
        };
      }

      if (!response.body) {
        return { success: false, chunksReceived: 0, error: 'Response body is empty' };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let chunksCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.audio) {
                chunksCount++;
                onChunk({
                  chunkIndex: data.chunk_index ?? chunksCount,
                  audioBase64: data.audio,
                });
              }
            } catch {
              // Ignore non-json lines
            }
          }
        }
      }

      return { success: true, chunksReceived: chunksCount };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, chunksReceived: 0, error: 'Synthesis cancelled by user interruption' };
      }
      return {
        success: false,
        chunksReceived: 0,
        error: err.message || 'TTS streaming synthesis failed',
      };
    }
  },

  /**
   * Synthesizes text to a single WAV Audio Buffer using the REST endpoint
   */
  synthesizeToBuffer: async (
    text: string,
    options: TtsSynthesisOptions = {}
  ): Promise<{ success: boolean; audioBuffer?: Buffer; error?: string }> => {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      return { success: false, error: 'Empty text' };
    }

    if (!GNANI_API_KEY) {
      return { success: false, error: 'GNANI_API_KEY is missing' };
    }

    const voice = options.voice || 'Nalini';
    const language = options.language || 'en-IN';
    const sampleRate = options.sampleRate || 24000;

    try {
      const response = await fetch(TTS_REST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key-ID': GNANI_API_KEY,
        },
        body: JSON.stringify({
          text: cleanText,
          model: 'timbre-v2.5',
          voice,
          language,
          speed: 1.0,
          audio_config: {
            encoding: 'linear_pcm',
            container: 'wav',
            num_channels: 1,
            sample_rate: sampleRate,
            sample_width: 2,
          },
        }),
        signal: options.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errText}` };
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        success: true,
        audioBuffer: Buffer.from(arrayBuffer),
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Synthesis cancelled' };
      }
      return {
        success: false,
        error: err.message || 'REST TTS synthesis failed',
      };
    }
  },
};
