/**
 * ApplianceCare AI – Voice Response Formatter
 *
 * Formats structured chatbot responses into natural spoken prose:
 * - Strips UI markdown, symbols, emojis, and raw diagnostic IDs
 * - Removes verbose parenthetical chip example lists that belong to UI buttons, not speech
 * - Expands technical acronyms via TTSPronunciationService
 * - Formats into clean, single-concept speech units with prioritized safety alerts
 * - Segments text into sentence units for streaming TTS synthesis
 */

import { TTSPronunciationService } from './ttsPronunciationService';

export type VoiceResponseType =
  | 'QUESTION'
  | 'INSTRUCTION'
  | 'EXPLANATION'
  | 'SAFETY_WARNING'
  | 'CONFIRMATION';

export type VoicePriority = 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface VoiceResponse {
  text: string;
  language: string;
  responseType: VoiceResponseType;
  priority: VoicePriority;
  turnId: number;
}

export class VoiceResponseFormatter {
  /**
   * Cleans text for voice synthesis: strips markdown, removes UI example lists,
   * humanizes internal identifiers, and applies pronunciation rules.
   */
  public static formatForSpeech(rawText: string, language: string = 'en'): string {
    if (!rawText) return '';

    let cleaned = rawText
      // 1. Remove thinking tags if present
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      // 2. Strip internal metadata, tree codes, and database IDs
      .replace(/\bissue\s+AC\d{2}\b/gi, 'the issue')
      .replace(/\bAC\d{2}\b/gi, '')
      .replace(/\(AC\d{2}\)/gi, '')
      .replace(/\bdiagnostic tree(s)?\b/gi, 'troubleshooting checks')
      .replace(/\bResolution Code:?\s*[`"']?[a-z0-9_-]+[`"']?/gi, '')
      .replace(/\bStep Action:\s*/gi, '')
      .replace(/TREE_[A-Z0-9_]+/gi, '')
      // 3. Strip parenthetical example lists intended for UI buttons (e.g. yes, filter is clean...)
      // This eliminates the 4-6 second TTS synthesis bloat!
      .replace(/\s*\((?:e\.g\.|for example)[^)]*\)/gi, '')
      // 4. Remove UI markdown formatting and icons
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[#\-*•]\s+/gm, '')
      .replace(/[🚨🎉⚠️📋⚡💧💨🔊📟🔄🔍📅✓•👋]/g, '')
      .replace(/\s*\/\s*/g, ' or ')
      .replace(/\n+/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 5. Expand pronunciation via TTSPronunciationService
    cleaned = TTSPronunciationService.expandForSpeech(cleaned, language);

    return cleaned;
  }

  /**
   * Formats a structured message into a speech-ready VoiceResponse object
   */
  public static formatStructuredResponse(
    rawText: string,
    turnId: number,
    options: {
      isSafety?: boolean;
      isInstruction?: boolean;
      isQuestion?: boolean;
      language?: string;
    } = {}
  ): VoiceResponse {
    const lang = options.language || 'en';
    const text = this.formatForSpeech(rawText, lang);

    let responseType: VoiceResponseType = 'EXPLANATION';
    let priority: VoicePriority = 'NORMAL';

    if (options.isSafety || /\b(critical|danger|hazard|shock|fire|smoke|turn off main)\b/i.test(text)) {
      responseType = 'SAFETY_WARNING';
      priority = 'CRITICAL';
    } else if (options.isInstruction) {
      responseType = 'INSTRUCTION';
      priority = 'HIGH';
    } else if (options.isQuestion || text.endsWith('?')) {
      responseType = 'QUESTION';
      priority = 'NORMAL';
    }

    return {
      text,
      language: lang,
      responseType,
      priority,
      turnId,
    };
  }

  /**
   * Splits speech text into complete grammatical sentences for progressive TTS streaming
   */
  public static segmentIntoSentences(text: string, language: string = 'en'): string[] {
    const formatted = this.formatForSpeech(text, language);
    if (!formatted) return [];

    // Split on sentence-ending punctuation followed by whitespace or end of string
    const rawSegments = formatted.split(/(?<=[.?!])\s+/);
    const sentences: string[] = [];

    for (const seg of rawSegments) {
      const trimmed = seg.trim();
      if (trimmed.length > 0) {
        // Ensure sentence ends with punctuation
        if (!/[.?!]$/.test(trimmed)) {
          sentences.push(trimmed + '.');
        } else {
          sentences.push(trimmed);
        }
      }
    }

    // Limit each turn to at most 3 clear sentences to maintain high voice response speed
    return sentences.length > 0 ? sentences.slice(0, 3) : [formatted];
  }
}

export const voiceResponseFormatter = VoiceResponseFormatter;
