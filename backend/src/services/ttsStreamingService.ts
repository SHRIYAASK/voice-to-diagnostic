/**
 * ApplianceCare AI – Continuous TTS Streaming Service
 *
 * Implements low-latency continuous streaming TTS synthesis:
 * - Accepts safety-validated speech text
 * - Sends text to Gnani Timbre TTS (timbre-v2.5) as a continuous SSE audio stream
 * - Emits ordered chunks tagged with turnId and monotonic sequenceNumber
 * - Instantly cancels synthesis on AbortSignal (barge-in / interruption)
 * - Seamless fallback to REST buffer synthesis if SSE yields no chunks
 */

import { gnaniTtsService, TtsSynthesisOptions, AudioChunkEvent } from './gnaniTtsService';
import { VoiceResponseFormatter } from './voiceResponseFormatter';

export interface TTSStreamChunk {
  turnId: number;
  sequenceNumber: number;
  isFinal: boolean;
  audioBase64: string;
  sampleRate: number;
}

export interface TTSStreamingResult {
  success: boolean;
  totalChunks: number;
  error?: string;
}

export class TTSStreamingService {
  /**
   * Synthesizes safety-approved speech text continuously via streaming SSE.
   *
   * @param text Validated spoken text
   * @param turnId Monotonic turn identifier
   * @param onChunk Callback receiving each audio chunk progressively as it arrives
   * @param options Language, voice, sample rate, and AbortSignal
   */
  public async streamText(
    text: string,
    turnId: number,
    onChunk: (chunk: TTSStreamChunk) => void,
    options: TtsSynthesisOptions = {}
  ): Promise<TTSStreamingResult> {
    const signal = options.signal;
    if (signal?.aborted) {
      return { success: false, totalChunks: 0, error: 'Cancelled before synthesis' };
    }

    const cleanText = VoiceResponseFormatter.formatForSpeech(text, options.language);
    if (!cleanText) {
      return { success: true, totalChunks: 0 };
    }

    let globalSequence = 0;
    const sampleRate = options.sampleRate || 24000;

    const res = await gnaniTtsService.streamSynthesize(
      cleanText,
      (chunk: AudioChunkEvent) => {
        if (signal?.aborted) return;
        globalSequence++;
        onChunk({
          turnId,
          sequenceNumber: globalSequence,
          isFinal: false,
          audioBase64: chunk.audioBase64,
          sampleRate,
        });
      },
      options
    );

    // If streaming synthesis failed to yield chunks, attempt REST fallback
    if ((!res.success || globalSequence === 0) && !signal?.aborted) {
      try {
        const restRes = await gnaniTtsService.synthesizeToBuffer(cleanText, options);
        if (restRes.success && restRes.audioBuffer && !signal?.aborted) {
          globalSequence++;
          onChunk({
            turnId,
            sequenceNumber: globalSequence,
            isFinal: true,
            audioBase64: restRes.audioBuffer.toString('base64'),
            sampleRate,
          });
        }
      } catch {
        // Fallback failed
      }
    }

    return {
      success: globalSequence > 0,
      totalChunks: globalSequence,
    };
  }
}

export const ttsStreamingService = new TTSStreamingService();
