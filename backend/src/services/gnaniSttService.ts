/**
 * Gnani Prisma STT Service
 *
 * Supports:
 * 1. Low-latency real-time WebSocket streaming STT (wss://api.vachana.ai/stt/v3/stream)
 *    - Expects raw 16-bit linear PCM little-endian audio frames at 16,000 Hz.
 *    - Real-time interim & final transcript callbacks.
 * 2. REST STT endpoint (https://api.vachana.ai/stt/v3) for audio buffer uploads and fallbacks.
 *
 * Language Code:
 *    Defaults to 'en-IN' (English - India).
 *    Also supports 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', etc., or 'indic-auto'.
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

const GNANI_API_KEY = process.env.GNANI_API_KEY || '';
const STT_WS_URL = 'wss://api.vachana.ai/stt/v3/stream';
const STT_REST_URL = 'https://api.vachana.ai/stt/v3';

export interface SttSessionOptions {
  languageCode?: string; // defaults to 'indic-auto' (Gnani Prisma automatic multilingual detection)
  sampleRate?: number;   // defaults to 16000
}

export interface SttTranscriptData {
  transcript: string;
  isFinal: boolean;
  detectedLanguage?: string;
  raw: any;
}

/**
 * Resolves user/frontend language parameter to Gnani Prisma API language code.
 * Maps 'auto', 'indic-auto', or empty values to Gnani's official 'indic-auto' identifier.
 */
export function resolveSttLanguage(lang?: string): string {
  const trimmed = (lang || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'auto' || trimmed === 'indic-auto') {
    return 'indic-auto';
  }
  return lang!.trim();
}

export class GnaniSttStreamingSession extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private isClosed = false;
  private bufferQueue: Buffer[] = [];
  private languageCode: string;
  private sampleRate: number;

  constructor(options: SttSessionOptions = {}) {
    super();
    this.languageCode = resolveSttLanguage(options.languageCode);
    this.sampleRate = options.sampleRate || 16000;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    if (!GNANI_API_KEY) {
      this.emit('error', new Error('GNANI_API_KEY is not configured in backend environment.'));
      return;
    }

    try {
      this.ws = new WebSocket(STT_WS_URL, {
        headers: {
          'x-api-key-id': GNANI_API_KEY,
          'lang_code': this.languageCode,
          'x-sample-rate': String(this.sampleRate),
          'x-format': 'transcribe',
        },
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.emit('ready');
        // Flush any buffered chunks received before socket opened
        while (this.bufferQueue.length > 0 && this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
          const chunk = this.bufferQueue.shift();
          if (chunk) {
            this.ws.send(chunk);
          }
        }
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const text = data.toString('utf-8');
          const json = JSON.parse(text);

          if (json.type === 'error') {
            this.emit('error', new Error(json.message || 'Gnani STT WebSocket error'));
            return;
          }

          // Handle transcript events from Gnani Prisma
          // Payload format: {"type": "transcript", "text": "...", "segment_id": "..."}
          const transcript = (json.text ?? json.transcript ?? json.result ?? '').trim();

          if (transcript) {
            const isPartial = json.type === 'partial' || json.type === 'interim' || json.partial === true;
            const isFinal = Boolean(
              json.type === 'transcript' ||
              json.type === 'final' ||
              json.type === 'segment' ||
              json.is_final === true ||
              json.final === true ||
              !isPartial
            );

            // Extract any language detection metadata emitted by Gnani Prisma
            const detectedLanguage = json.language_code || json.detected_language || json.lang || undefined;

            this.emit('transcript', {
              transcript,
              isFinal,
              detectedLanguage,
              raw: json,
            });
          }
        } catch {
          // Non-JSON or binary message
        }
      });

      this.ws.on('error', (err: Error) => {
        this.emit('error', err);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.isConnected = false;
        this.emit('close', { code, reason: reason.toString() });
      });
    } catch (err: any) {
      this.emit('error', err);
    }
  }

  /**
   * Sends raw PCM 16-bit little-endian audio chunk to Gnani STT
   */
  public sendAudioChunk(chunk: Buffer): void {
    if (this.isClosed) return;

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    } else {
      // Buffer up to 5 seconds of audio (~160KB at 16kHz 16-bit) while connecting
      if (this.bufferQueue.length < 50) {
        this.bufferQueue.push(chunk);
      }
    }
  }

  /**
   * Gracefully closes the STT session
   */
  public close(): void {
    this.isClosed = true;
    this.isConnected = false;
    this.bufferQueue = [];
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }
  }
}

export const gnaniSttService = {
  /**
   * Creates a new live streaming STT session
   */
  createStreamingSession: (options: SttSessionOptions = {}): GnaniSttStreamingSession => {
    return new GnaniSttStreamingSession(options);
  },

  /**
   * Transcribes a recorded audio buffer using the Gnani Prisma REST v3 endpoint
   */
  transcribeAudioBuffer: async (
    audioBuffer: Buffer,
    languageCode: string = 'auto'
  ): Promise<{ success: boolean; transcript: string; processingTime?: number; error?: string }> => {
    if (!GNANI_API_KEY) {
      return { success: false, transcript: '', error: 'GNANI_API_KEY is missing' };
    }

    const resolvedLanguage = resolveSttLanguage(languageCode);

    try {
      const form = new FormData();
      form.append('audio_file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
      form.append('language_code', resolvedLanguage);
      form.append('format', 'transcribe');

      const response = await fetch(STT_REST_URL, {
        method: 'POST',
        headers: {
          'X-API-Key-ID': GNANI_API_KEY,
        },
        body: form,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          transcript: '',
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const json = await response.json() as any;
      return {
        success: Boolean(json.success ?? true),
        transcript: (json.transcript || '').trim(),
        processingTime: json.processing_time,
      };
    } catch (err: any) {
      return {
        success: false,
        transcript: '',
        error: err.message || 'REST STT transcription failed',
      };
    }
  },
};
