/**
 * ApplianceCare AI – Conversation State Machine
 *
 * Implements an explicit 14-state conversational lifecycle with transition validation,
 * turn ownership tracking, and audit history.
 */

export type VoiceState =
  | 'CONNECTING'
  | 'READY'
  | 'LISTENING'
  | 'PROCESSING'
  | 'REASONING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'WAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR'
  | 'ESCALATION'
  | 'SESSION_ENDED';

export interface StateTransitionEvent {
  previousState: VoiceState;
  currentState: VoiceState;
  turnId: number;
  reason?: string;
  timestamp: number;
}

export class VoiceStateMachine {
  private _state: VoiceState = 'CONNECTING';
  private _turnId = 1;
  private _history: StateTransitionEvent[] = [];
  private _listeners: Array<(event: StateTransitionEvent) => void> = [];

  // Allowed transitions map
  private static readonly ALLOWED_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
    CONNECTING: ['READY', 'ERROR', 'DISCONNECTED', 'SESSION_ENDED'],
    READY: ['LISTENING', 'SPEAKING', 'DISCONNECTED', 'SESSION_ENDED', 'ERROR'],
    LISTENING: ['PROCESSING', 'INTERRUPTED', 'DISCONNECTED', 'SESSION_ENDED', 'ERROR', 'READY'],
    PROCESSING: ['REASONING', 'SPEAKING', 'WAITING_CONFIRMATION', 'INTERRUPTED', 'ERROR', 'DISCONNECTED', 'READY'],
    REASONING: ['SPEAKING', 'WAITING_CONFIRMATION', 'ESCALATION', 'COMPLETED', 'INTERRUPTED', 'ERROR', 'DISCONNECTED'],
    SPEAKING: ['LISTENING', 'INTERRUPTED', 'WAITING_CONFIRMATION', 'COMPLETED', 'ESCALATION', 'DISCONNECTED', 'SESSION_ENDED', 'READY', 'ERROR'],
    INTERRUPTED: ['LISTENING', 'PROCESSING', 'READY', 'DISCONNECTED', 'SESSION_ENDED', 'ERROR'],
    WAITING_CONFIRMATION: ['LISTENING', 'PROCESSING', 'DISCONNECTED', 'SESSION_ENDED', 'ERROR'],
    COMPLETED: ['SPEAKING', 'ESCALATION', 'SESSION_ENDED', 'READY', 'DISCONNECTED'],
    ESCALATION: ['SPEAKING', 'SESSION_ENDED', 'DISCONNECTED', 'READY'],
    DISCONNECTED: ['RECONNECTING', 'SESSION_ENDED', 'CONNECTING'],
    RECONNECTING: ['READY', 'LISTENING', 'DISCONNECTED', 'SESSION_ENDED', 'ERROR'],
    ERROR: ['READY', 'LISTENING', 'DISCONNECTED', 'SESSION_ENDED'],
    SESSION_ENDED: [], // Terminal state
  };

  constructor(initialState: VoiceState = 'CONNECTING', initialTurnId = 1) {
    this._state = initialState;
    this._turnId = initialTurnId;
  }

  public get state(): VoiceState {
    return this._state;
  }

  public get turnId(): number {
    return this._turnId;
  }

  public get history(): ReadonlyArray<StateTransitionEvent> {
    return this._history;
  }

  public canTransitionTo(nextState: VoiceState): boolean {
    if (this._state === nextState) return true;
    const allowed = VoiceStateMachine.ALLOWED_TRANSITIONS[this._state];
    return allowed ? allowed.includes(nextState) : false;
  }

  /**
   * Attempts to transition to nextState. Throws if illegal.
   */
  public transitionTo(nextState: VoiceState, reason?: string): StateTransitionEvent {
    if (!this.canTransitionTo(nextState)) {
      const err = `[VoiceStateMachine] Illegal state transition from ${this._state} to ${nextState} (turn: ${this._turnId})`;
      console.warn(err);
      throw new Error(err);
    }

    const previousState = this._state;
    this._state = nextState;

    const event: StateTransitionEvent = {
      previousState,
      currentState: nextState,
      turnId: this._turnId,
      reason,
      timestamp: Date.now(),
    };

    this._history.push(event);
    if (this._history.length > 100) {
      this._history.shift();
    }

    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err: any) {
        console.error('[VoiceStateMachine] Error in state change listener:', err.message);
      }
    }

    return event;
  }

  /**
   * Force transition (e.g. on unrecoverable disconnect or emergency error)
   */
  public forceTransition(nextState: VoiceState, reason?: string): StateTransitionEvent {
    const previousState = this._state;
    this._state = nextState;

    const event: StateTransitionEvent = {
      previousState,
      currentState: nextState,
      turnId: this._turnId,
      reason: reason || 'Forced transition',
      timestamp: Date.now(),
    };

    this._history.push(event);
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch {}
    }

    return event;
  }

  /**
   * Advances monotonic turn ID when a new user utterance or interruption occurs
   */
  public incrementTurn(): number {
    this._turnId += 1;
    return this._turnId;
  }

  public setTurn(turnId: number): void {
    if (turnId >= this._turnId) {
      this._turnId = turnId;
    }
  }

  public onStateChange(listener: (event: StateTransitionEvent) => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  public isTerminal(): boolean {
    return this._state === 'SESSION_ENDED';
  }

  public isBusy(): boolean {
    return (
      this._state === 'PROCESSING' ||
      this._state === 'REASONING' ||
      this._state === 'SPEAKING'
    );
  }
}

