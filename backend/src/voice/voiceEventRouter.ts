/**
 * ApplianceCare AI – Voice Event Router & Message Dispatcher
 *
 * Dispatches inbound client messages across state machine, barge-in controller,
 * recovery manager, and STT/TTS services.
 */

import WebSocket from 'ws';
import {
  ClientMessage,
  ServerMessage,
  decodeAudioFrame,
  encodeAudioFrame,
  AudioFramingHeader,
} from './voiceProtocol';
import { VoiceStateMachine } from './voiceStateMachine';
import { BargeInController } from './bargeInController';
import { TranscriptManager } from './transcriptManager';
import { EndpointDetector } from './endpointDetector';
import { VoiceRecoveryManager } from './voiceRecoveryManager';
import { voiceMetrics } from './voiceMetrics';

export interface VoiceEventRouterContext {
  ws: WebSocket;
  sessionId: string;
  stateMachine: VoiceStateMachine;
  bargeInController: BargeInController;
  transcriptManager: TranscriptManager;
  endpointDetector: EndpointDetector;
  recoveryManager: VoiceRecoveryManager;
  onAudioPayload: (pcmPayload: Buffer, turnId: number) => void;
  onBargeIn: (turnId: number, reason: string) => void;
  onSessionResume: (sessionId: string, turnId: number) => void;
  onSessionEnd: (reason?: string) => void;
}

export class VoiceEventRouter {
  public static handleIncoming(
    data: WebSocket.RawData,
    isBinary: boolean,
    ctx: VoiceEventRouterContext
  ): void {
    // 1. Binary Audio Frame
    if (isBinary) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any);

      // Check if it's a framed audio buffer
      const decoded = decodeAudioFrame(buffer);
      if (decoded) {
        const { header, payload } = decoded;

        // Verify turn ownership
        if (!ctx.bargeInController.isChunkValid(header.turnId, ctx.stateMachine.turnId)) {
          // Stale turn audio: drop silently
          return;
        }

        // Run VAD & Endpoint evaluation
        const vad = ctx.endpointDetector.processFrame(payload);

        // Check barge-in
        const bargeInDecision = ctx.bargeInController.evaluateAudioFrame(
          vad.isVoiced,
          ctx.stateMachine.turnId
        );
        if (bargeInDecision.isConfirmedInterruption) {
          ctx.onBargeIn(bargeInDecision.newTurnId, bargeInDecision.reason);
        }

        ctx.onAudioPayload(payload, header.turnId);
        return;
      }

      // Raw PCM fallback (if client sent 100ms raw PCM16 directly)
      const vad = ctx.endpointDetector.processFrame(buffer);
      const bargeInDecision = ctx.bargeInController.evaluateAudioFrame(
        vad.isVoiced,
        ctx.stateMachine.turnId
      );
      if (bargeInDecision.isConfirmedInterruption) {
        ctx.onBargeIn(bargeInDecision.newTurnId, bargeInDecision.reason);
      }
      ctx.onAudioPayload(buffer, ctx.stateMachine.turnId);
      return;
    }

    // 2. Text / JSON Message
    const messageText = data.toString();

    try {
      const msg = JSON.parse(messageText) as ClientMessage;

      switch (msg.type) {
        case 'heartbeat':
          ctx.recoveryManager.recordHeartbeat(ctx.sessionId);
          this.sendJson(ctx.ws, {
            type: 'heartbeat_ack',
            timestamp: msg.timestamp,
            serverTimestamp: Date.now(),
          });
          break;

        case 'barge_in':
          const decision = ctx.bargeInController.executeInterruption(
            ctx.stateMachine.turnId,
            msg.reason || 'Client barge_in event'
          );
          ctx.onBargeIn(decision.newTurnId, decision.reason);
          break;

        case 'cancel_turn':
          ctx.bargeInController.executeInterruption(msg.turnId, msg.reason || 'User canceled turn');
          ctx.onBargeIn(ctx.stateMachine.turnId + 1, 'Turn canceled');
          break;

        case 'playback_state':
          ctx.bargeInController.setPlaybackState(msg.isPlaying);
          break;

        case 'session_resume':
          ctx.onSessionResume(msg.sessionId, msg.lastTurnId);
          break;

        case 'session_end':
          ctx.onSessionEnd(msg.reason);
          break;

        default:
          break;
      }
    } catch (err: any) {
      console.warn('[VoiceEventRouter] Invalid JSON client frame:', err.message);
      voiceMetrics.recordError('INVALID_FRAME');
    }
  }

  public static sendJson(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public static sendAudioChunk(
    ws: WebSocket,
    header: AudioFramingHeader,
    payload: Buffer
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      const frame = encodeAudioFrame(header, payload);
      ws.send(frame, { binary: true });
    }
  }
}
