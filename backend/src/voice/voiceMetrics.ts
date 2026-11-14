/**
 * ApplianceCare AI – Voice Observability & Telemetry Service
 *
 * Implements:
 * 1. Distributed turn tracing (VoiceTrace)
 * 2. Stage-by-stage latency tracking (STT finalization, routing, TTS first-byte, playback)
 * 3. Error and interruption counters
 * 4. Privacy compliance: zero raw audio / sensitive transcript logging
 */

import { v4 as uuid } from 'uuid';

export interface VoiceTrace {
  traceId: string;
  sessionId: string;
  turnId: number;
  audioStartedAt: number;
  speechEndedAt?: number;
  sttStartedAt?: number;
  sttFinalizedAt?: number;
  routingCompletedAt?: number;
  responseGeneratedAt?: number;
  ttsFirstByteAt?: number;
  playbackStartedAt?: number;
  playbackEndedAt?: number;
  interruptedAt?: number;
  totalTurnLatencyMs?: number;
  speechEndToFirstByteLatencyMs?: number;
}

export interface VoiceMetricsSummary {
  totalTurns: number;
  completedTurns: number;
  interruptedTurns: number;
  avgSpeechEndToFirstByteMs: number;
  p95SpeechEndToFirstByteMs: number;
  avgRoutingLatencyMs: number;
  avgTtsFirstByteMs: number;
  totalErrors: number;
}

export class VoiceObservabilityService {
  private _activeTraces: Map<string, VoiceTrace> = new Map();
  private _completedTraces: VoiceTrace[] = [];
  private _maxTraceHistory = 200;
  private _errorCounts: Record<string, number> = {};

  public startTrace(sessionId: string, turnId: number): VoiceTrace {
    const traceId = uuid();
    const trace: VoiceTrace = {
      traceId,
      sessionId,
      turnId,
      audioStartedAt: Date.now(),
    };
    this._activeTraces.set(`${sessionId}:${turnId}`, trace);
    return trace;
  }

  public getTrace(sessionId: string, turnId: number): VoiceTrace | undefined {
    return this._activeTraces.get(`${sessionId}:${turnId}`);
  }

  public markSpeechEnded(sessionId: string, turnId: number): void {
    const trace = this.getTrace(sessionId, turnId);
    if (trace) trace.speechEndedAt = Date.now();
  }

  public markSttFinalized(sessionId: string, turnId: number): void {
    const trace = this.getTrace(sessionId, turnId);
    if (trace) trace.sttFinalizedAt = Date.now();
  }

  public markRoutingCompleted(sessionId: string, turnId: number): void {
    const trace = this.getTrace(sessionId, turnId);
    if (trace) trace.routingCompletedAt = Date.now();
  }

  public markTtsFirstByte(sessionId: string, turnId: number): void {
    const trace = this.getTrace(sessionId, turnId);
    if (trace) {
      const now = Date.now();
      trace.ttsFirstByteAt = now;
      if (trace.speechEndedAt) {
        trace.speechEndToFirstByteLatencyMs = now - trace.speechEndedAt;
      }
    }
  }

  public markPlaybackStarted(sessionId: string, turnId: number): void {
    const trace = this.getTrace(sessionId, turnId);
    if (trace) trace.playbackStartedAt = Date.now();
  }

  public markInterrupted(sessionId: string, turnId: number): void {
    const trace = this.getTrace(sessionId, turnId);
    if (trace) {
      trace.interruptedAt = Date.now();
    }
  }

  public completeTrace(sessionId: string, turnId: number): void {
    const key = `${sessionId}:${turnId}`;
    const trace = this._activeTraces.get(key);
    if (!trace) return;

    trace.playbackEndedAt = Date.now();
    trace.totalTurnLatencyMs = trace.playbackEndedAt - trace.audioStartedAt;

    this._completedTraces.push(trace);
    if (this._completedTraces.length > this._maxTraceHistory) {
      this._completedTraces.shift();
    }
    this._activeTraces.delete(key);
  }

  public recordError(code: string): void {
    this._errorCounts[code] = (this._errorCounts[code] || 0) + 1;
  }

  public getSummary(): VoiceMetricsSummary {
    const totalTurns = this._completedTraces.length;
    let completedTurns = 0;
    let interruptedTurns = 0;

    const latencies: number[] = [];
    let sumRouting = 0;
    let countRouting = 0;
    let sumTts = 0;
    let countTts = 0;

    for (const t of this._completedTraces) {
      if (t.interruptedAt) {
        interruptedTurns++;
      } else {
        completedTurns++;
      }

      if (typeof t.speechEndToFirstByteLatencyMs === 'number') {
        latencies.push(t.speechEndToFirstByteLatencyMs);
      }

      if (t.sttFinalizedAt && t.routingCompletedAt) {
        sumRouting += t.routingCompletedAt - t.sttFinalizedAt;
        countRouting++;
      }

      if (t.routingCompletedAt && t.ttsFirstByteAt) {
        sumTts += t.ttsFirstByteAt - t.routingCompletedAt;
        countTts++;
      }
    }

    latencies.sort((a, b) => a - b);
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies.length > 0 ? latencies[p95Idx] : 0;

    const totalErrors = Object.values(this._errorCounts).reduce((a, b) => a + b, 0);

    return {
      totalTurns,
      completedTurns,
      interruptedTurns,
      avgSpeechEndToFirstByteMs: Math.round(avgLatency),
      p95SpeechEndToFirstByteMs: Math.round(p95Latency),
      avgRoutingLatencyMs: countRouting > 0 ? Math.round(sumRouting / countRouting) : 0,
      avgTtsFirstByteMs: countTts > 0 ? Math.round(sumTts / countTts) : 0,
      totalErrors,
    };
  }
}

export const voiceMetrics = new VoiceObservabilityService();

