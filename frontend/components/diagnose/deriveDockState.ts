import type { VoiceState } from './VoiceWave';

export type EngineVoiceStatus = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

export interface DockInput {
  isVoiceActive: boolean;
  voiceStatus: EngineVoiceStatus;
  isAssistantSpeaking: boolean;
  interimTranscript: string;
  voiceError: string | null;
}

/**
 * Pure mapping from the engine's existing voice signals to the dock's visual state.
 * Returns null when hands-free is off (the typed composer is shown instead).
 * "bargein" is a transient state and is layered on top by VoiceDock.
 */
export function deriveDockState(i: DockInput): VoiceState | null {
  if (!i.isVoiceActive) return null;
  if (i.voiceStatus === 'error') return 'blocked';
  if (i.voiceStatus === 'processing') return 'thinking';
  if (i.isAssistantSpeaking || i.voiceStatus === 'speaking') return 'speaking';
  if (i.interimTranscript) return 'listening';
  return 'ready';
}

/** Plain-language copy for the dock, no vendor or internal terms. */
export function dockCopy(state: VoiceState, o: { interim: string; error: string | null; connecting: boolean; slow: boolean }) {
  switch (state) {
    case 'ready':
      return o.connecting
        ? { title: 'Connecting', sub: 'Getting the microphone ready' }
        : { title: 'Ready when you are', sub: 'Start talking, or tap the mic' };
    case 'listening':
      return { title: 'Listening', sub: o.interim };
    case 'thinking':
      return { title: 'Thinking', sub: o.slow ? 'Still on it' : 'Updating your job card' };
    case 'speaking':
      return { title: 'Speaking', sub: 'Talk any time to cut in' };
    case 'bargein':
      return { title: 'Go ahead, I’m listening', sub: 'Paused my answer' };
    case 'blocked': {
      const mic = !!o.error && /microphone|permission/i.test(o.error);
      return mic
        ? { title: 'Microphone is blocked', sub: 'Allow it from the lock icon in the address bar, or type your answer' }
        : { title: 'Voice isn’t connecting', sub: 'You can type your answer, or try again in a moment' };
    }
    default:
      return { title: '', sub: '' };
  }
}
