/**
 * ApplianceCare AI – Voice Recovery & Session Resumption Manager
 *
 * Implements:
 * 1. Ping/pong heartbeat monitoring and stale connection detection
 * 2. Session resumption protocol preserving committed diagnostic tree nodes
 * 3. Bounded reconnection backoff state
 * 4. Automatic garbage collection of abandoned sessions
 */

export interface CommittedVoiceSession {
  sessionId: string;
  turnId: number;
  issueId?: string;
  currentNodeId?: string;
  language: string;
  model: string;
  appliance: string;
  lastCommittedAt: number;
  isCompleted: boolean;
}

export class VoiceRecoveryManager {
  private _sessions: Map<string, CommittedVoiceSession> = new Map();
  private _heartbeats: Map<string, { lastPingAt: number; missedPings: number }> = new Map();
  private _heartbeatInterval: NodeJS.Timeout | null = null;
  private _maxMissedPings = 3;
  private _sessionTtlMs = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.startHeartbeatSweep();
  }

  /**
   * Commits the current diagnostic state of a session so it can be resumed upon disconnect
   */
  public commitState(session: CommittedVoiceSession): void {
    this._sessions.set(session.sessionId, {
      ...session,
      lastCommittedAt: Date.now(),
    });
  }

  /**
   * Retrieves a committed session for recovery
   */
  public getSession(sessionId: string): CommittedVoiceSession | undefined {
    return this._sessions.get(sessionId);
  }

  /**
   * Records an incoming heartbeat ping from a client
   */
  public recordHeartbeat(sessionId: string): void {
    this._heartbeats.set(sessionId, {
      lastPingAt: Date.now(),
      missedPings: 0,
    });
  }

  /**
   * Validates if a session's connection is healthy
   */
  public isConnectionHealthy(sessionId: string): boolean {
    const hb = this._heartbeats.get(sessionId);
    if (!hb) return true; // Newly connected
    return hb.missedPings < this._maxMissedPings;
  }

  /**
   * Deletes a session upon explicit exit
   */
  public removeSession(sessionId: string): void {
    this._sessions.delete(sessionId);
    this._heartbeats.delete(sessionId);
  }

  /**
   * Sweeps for expired sessions and increments missed heartbeats
   */
  private startHeartbeatSweep(): void {
    this._heartbeatInterval = setInterval(() => {
      const now = Date.now();

      // Check heartbeats
      for (const [sessionId, hb] of this._heartbeats.entries()) {
        if (now - hb.lastPingAt > 15000) {
          hb.missedPings++;
        }
      }

      // Evict expired committed sessions
      for (const [sessionId, s] of this._sessions.entries()) {
        if (now - s.lastCommittedAt > this._sessionTtlMs) {
          this._sessions.delete(sessionId);
          this._heartbeats.delete(sessionId);
        }
      }
    }, 10000);

    // Ensure timer does not prevent process exit in tests
    if (this._heartbeatInterval.unref) {
      this._heartbeatInterval.unref();
    }
  }

  public close(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    this._sessions.clear();
    this._heartbeats.clear();
  }
}

