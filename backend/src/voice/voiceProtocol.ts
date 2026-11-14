/**
 * ApplianceCare AI – Production Voice WebSocket Protocol
 *
 * Formalized frame specification, message schemas, and binary framing helpers.
 */

export const PROTOCOL_VERSION = '2.0.0';

export type ClientEventType =
  | 'session_start'
  | 'audio_config'
  | 'audio_frame'
  | 'barge_in'
  | 'cancel_turn'
  | 'heartbeat'
  | 'session_resume'
  | 'session_end'
  | 'playback_state';

export type ServerEventType =
  | 'session_ready'
  | 'audio_config_ack'
  | 'transcript_partial'
  | 'transcript_final'
  | 'speech_started'
  | 'speech_ended'
  | 'bot_turn_start'
  | 'tts_audio_chunk'
  | 'bot_turn_end'
  | 'stop_playback'
  | 'heartbeat_ack'
  | 'session_resumed'
  | 'state_change'
  | 'error';

// ── Binary Audio Frame Header (16 Bytes Little-Endian) ──────────────────────
// Byte 0-3:   uint32 turnId
// Byte 4-7:   uint32 sequenceNumber
// Byte 8-9:   uint16 flags (bit 0: isFinal, bit 1: isInterrupted, bit 2: isControl)
// Byte 10-11: uint16 sampleRate (e.g. 16000, 24000)
// Byte 12-15: uint32 payloadLength (bytes)
export const FRAME_HEADER_SIZE = 16;

export interface AudioFramingHeader {
  turnId: number;
  sequenceNumber: number;
  isFinal: boolean;
  isInterrupted: boolean;
  sampleRate: number;
  payloadLength: number;
}

export function encodeAudioFrame(
  header: AudioFramingHeader,
  payload: Buffer | Uint8Array | ArrayBuffer
): Buffer {
  const bufPayload = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(payload as ArrayBuffer);
  const out = Buffer.allocUnsafe(FRAME_HEADER_SIZE + bufPayload.length);

  out.writeUInt32LE(header.turnId >>> 0, 0);
  out.writeUInt32LE(header.sequenceNumber >>> 0, 4);

  let flags = 0;
  if (header.isFinal) flags |= 1 << 0;
  if (header.isInterrupted) flags |= 1 << 1;
  out.writeUInt16LE(flags, 8);

  out.writeUInt16LE(header.sampleRate || 16000, 10);
  out.writeUInt32LE(bufPayload.length >>> 0, 12);

  bufPayload.copy(out, FRAME_HEADER_SIZE);
  return out;
}

export function decodeAudioFrame(
  buffer: Buffer
): { header: AudioFramingHeader; payload: Buffer } | null {
  if (buffer.length < FRAME_HEADER_SIZE) return null;

  const turnId = buffer.readUInt32LE(0);
  const sequenceNumber = buffer.readUInt32LE(4);
  const flags = buffer.readUInt16LE(8);
  const sampleRate = buffer.readUInt16LE(10);
  const payloadLength = buffer.readUInt32LE(12);

  if (buffer.length < FRAME_HEADER_SIZE + payloadLength) {
    return null;
  }

  const payload = buffer.subarray(
    FRAME_HEADER_SIZE,
    FRAME_HEADER_SIZE + payloadLength
  );

  return {
    header: {
      turnId,
      sequenceNumber,
      isFinal: (flags & (1 << 0)) !== 0,
      isInterrupted: (flags & (1 << 1)) !== 0,
      sampleRate,
      payloadLength,
    },
    payload,
  };
}

// ── JSON Protocol Messages ──────────────────────────────────────────────────

export interface SessionStartMessage {
  type: 'session_start';
  sessionId?: string;
  model?: string;
  appliance?: string;
  language?: string; // 'en-IN' | 'ta-IN' | 'hi-IN'
}

export interface AudioConfigMessage {
  type: 'audio_config';
  sampleRate: number; // 16000
  channels: number;   // 1
  codec: 'pcm16' | 'opus';
  frameDurationMs: number; // 20, 40, or 100
}

export interface BargeInMessage {
  type: 'barge_in';
  turnId?: number;
  reason?: string;
  timestamp?: number;
}

export interface CancelTurnMessage {
  type: 'cancel_turn';
  turnId: number;
  reason?: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
  clientSequence?: number;
}

export interface SessionResumeMessage {
  type: 'session_resume';
  sessionId: string;
  lastTurnId: number;
}

export interface SessionEndMessage {
  type: 'session_end';
  reason?: string;
}

export interface PlaybackStateMessage {
  type: 'playback_state';
  isPlaying: boolean;
  turnId?: number;
}

export type ClientMessage =
  | SessionStartMessage
  | AudioConfigMessage
  | BargeInMessage
  | CancelTurnMessage
  | HeartbeatMessage
  | SessionResumeMessage
  | SessionEndMessage
  | PlaybackStateMessage;

export interface SessionReadyMessage {
  type: 'session_ready';
  protocolVersion: string;
  sessionId: string;
  turnId: number;
  language: string;
  appliance: string;
  model: string;
  config: {
    sampleRate: number;
    channels: number;
    frameDurationMs: number;
  };
}

export interface TranscriptPartialMessage {
  type: 'transcript_partial';
  turnId: number;
  text: string;
  isStable: boolean;
  language?: string;
  confidence?: number;
}

export interface TranscriptFinalMessage {
  type: 'transcript_final';
  turnId: number;
  text: string;
  normalizedText: string;
  language: string;
  confidence: number;
  needsConfirmation?: boolean;
}

export interface SpeechStartedMessage {
  type: 'speech_started';
  turnId: number;
  timestamp: number;
}

export interface SpeechEndedMessage {
  type: 'speech_ended';
  turnId: number;
  durationMs: number;
}

export interface BotTurnStartMessage {
  type: 'bot_turn_start';
  turnId: number;
  text: string;
  detectedLanguage?: string;
  chips?: Array<{ label: string; value: string; optionIndex?: number; issueId?: string }>;
}

export interface TtsAudioChunkMessage {
  type: 'tts_audio_chunk';
  turnId: number;
  sequenceNumber: number;
  isFinal: boolean;
  audioBase64: string;
  sampleRate: number;
  durationMs?: number;
}

export interface BotTurnEndMessage {
  type: 'bot_turn_end';
  turnId: number;
  totalChunks: number;
  totalDurationMs?: number;
}

export interface StopPlaybackMessage {
  type: 'stop_playback';
  turnId: number;
  reason: 'barge_in' | 'cancel' | 'disconnect' | 'error';
}

export interface HeartbeatAckMessage {
  type: 'heartbeat_ack';
  timestamp: number;
  serverTimestamp: number;
}

export interface SessionResumedMessage {
  type: 'session_resumed';
  sessionId: string;
  turnId: number;
  recoveredNodeId?: string;
  recoveredIssueId?: string;
}

export interface StateChangeMessage {
  type: 'state_change';
  previousState: string;
  currentState: string;
  turnId: number;
}

export interface ProtocolErrorMessage {
  type: 'error';
  code:
    | 'MIC_PERMISSION_DENIED'
    | 'MIC_DISCONNECTED'
    | 'STT_UNAVAILABLE'
    | 'TTS_UNAVAILABLE'
    | 'INVALID_FRAME'
    | 'STALE_TURN'
    | 'SESSION_EXPIRED'
    | 'INTERNAL_ERROR';
  message: string;
  recoverable: boolean;
  turnId?: number;
}

export type ServerMessage =
  | SessionReadyMessage
  | TranscriptPartialMessage
  | TranscriptFinalMessage
  | SpeechStartedMessage
  | SpeechEndedMessage
  | BotTurnStartMessage
  | TtsAudioChunkMessage
  | BotTurnEndMessage
  | StopPlaybackMessage
  | HeartbeatAckMessage
  | SessionResumedMessage
  | StateChangeMessage
  | ProtocolErrorMessage;

