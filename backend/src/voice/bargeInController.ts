/**
 * ApplianceCare AI – Barge-In & Interruption Controller
 *
 * Implements:
 * 1. Multi-factor interruption verification (VAD + consecutive frames)
 * 2. Acoustic echo suppression (prevents assistant speech from interrupting itself)
 * 3. Sub-200ms server-side turn invalidation & TTS abort
 * 4. Stale audio chunk filtering
 */

export interface BargeInDecision {
  isConfirmedInterruption: boolean;
  action?: 'none' | 'duck' | 'cancel' | 'restore';
  duckVolume?: number;
  reason: string;
  previousTurnId: number;
  newTurnId: number;
}

export class BargeInController {
  private _activeAbortController: AbortController | null = null;
  private _consecutiveSpeechFrames = 0;
  private _minFramesForInterruption = 2;
  private _isAssistantPlaying = false;
  private _lastPlaybackEndTime = 0;
  private _echoGracePeriodMs = 300;
  private _recentAssistantSpeech: string[] = [];

  // Two-Stage VAD Barge-In timing states (Duck @ 96ms, Cancel @ 160ms, Restore @ 400ms silence)
  private _voicedDurationMs = 0;
  private _silenceDurationMs = 0;
  private _isDucked = false;
  private _duckStartTime = 0;
  private _maxDuckDurationMs = 2000; // Force restore after 2000ms (2s) to avoid infinite duck in loud ambient noise

  /**
   * Sets the active AbortController for in-flight TTS or LLM generation
   */
  public setActiveAbortController(controller: AbortController | null): void {
    this._activeAbortController = controller;
  }

  public setPlaybackState(isPlaying: boolean): void {
    this._isAssistantPlaying = isPlaying;
    if (!isPlaying) {
      this._lastPlaybackEndTime = Date.now();
    }
  }

  public get isAssistantPlaying(): boolean {
    return this._isAssistantPlaying;
  }

  /** Lowercase, strip punctuation/symbols (keeps letters and digits in any script), collapse spaces. */
  private normalizeSpeech(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public registerAssistantSpeech(text: string): void {
    const clean = this.normalizeSpeech(text);
    if (!clean) return;
    this._recentAssistantSpeech.push(clean);
    if (this._recentAssistantSpeech.length > 5) {
      this._recentAssistantSpeech.shift();
    }
  }

  /**
   * Evaluates incoming audio energy to detect valid user interruption while assistant is speaking
   */
  public evaluateAudioFrame(isVoiced: boolean, currentTurnId: number): BargeInDecision {
    if (!this._isAssistantPlaying) {
      this._consecutiveSpeechFrames = 0;
      return {
        isConfirmedInterruption: false,
        reason: 'Assistant is not speaking',
        previousTurnId: currentTurnId,
        newTurnId: currentTurnId,
      };
    }

    if (isVoiced) {
      this._consecutiveSpeechFrames++;
      if (this._consecutiveSpeechFrames >= this._minFramesForInterruption) {
        // Confirmed user barge-in!
        return this.executeInterruption(currentTurnId, 'VAD energy threshold reached');
      }
    } else {
      this._consecutiveSpeechFrames = 0;
    }

    return {
      isConfirmedInterruption: false,
      action: 'none',
      reason: 'Awaiting confirmation frames',
      previousTurnId: currentTurnId,
      newTurnId: currentTurnId,
    };
  }

  /**
   * Evaluates streaming VAD predictions with Two-Stage Barge-In logic:
   * - Duck @ 96ms (volume 0.2)
   * - Cancel @ 160ms (abort playback and increment turn)
   * - Restore @ 400ms silence or on 1500ms max duck timeout
   */
  public evaluateVadStream(
    probability: number,
    frameDurationMs: number,
    currentTurnId: number
  ): BargeInDecision {
    if (!this._isAssistantPlaying) {
      this._voicedDurationMs = 0;
      this._silenceDurationMs = 0;
      this._isDucked = false;
      return {
        isConfirmedInterruption: false,
        action: 'none',
        reason: 'Assistant is not speaking',
        previousTurnId: currentTurnId,
        newTurnId: currentTurnId,
      };
    }

    // Check max duck duration guard to prevent indefinite ducking in noisy rooms
    if (this._isDucked && Date.now() - this._duckStartTime >= this._maxDuckDurationMs) {
      this._isDucked = false;
      this._voicedDurationMs = 0;
      this._silenceDurationMs = 0;
      return {
        isConfirmedInterruption: false,
        action: 'restore',
        duckVolume: 1.0,
        reason: 'Max duck duration timeout reached (2000ms), restoring playback',
        previousTurnId: currentTurnId,
        newTurnId: currentTurnId,
      };
    }

    if (probability >= 0.5) {
      this._voicedDurationMs += frameDurationMs;
      this._silenceDurationMs = 0;

      // Confirmed interruption threshold: >= 160ms confirmed speech
      if (this._voicedDurationMs >= 160) {
        this._isDucked = false;
        const decision = this.executeInterruption(
          currentTurnId,
          `Confirmed speech VAD interruption (prob=${probability.toFixed(2)}, duration=${this._voicedDurationMs}ms)`
        );
        decision.action = 'cancel';
        return decision;
      }

      // Fast duck threshold: >= 96ms probable speech
      if (this._voicedDurationMs >= 96 && !this._isDucked) {
        this._isDucked = true;
        this._duckStartTime = Date.now();
        return {
          isConfirmedInterruption: false,
          action: 'duck',
          duckVolume: 0.2,
          reason: `Fast ducking initiated on probable speech onset (${this._voicedDurationMs}ms)`,
          previousTurnId: currentTurnId,
          newTurnId: currentTurnId,
        };
      }
    } else if (probability < 0.35) {
      if (this._isDucked) {
        this._silenceDurationMs += frameDurationMs;
        if (this._silenceDurationMs >= 400) {
          this._isDucked = false;
          this._voicedDurationMs = 0;
          this._silenceDurationMs = 0;
          return {
            isConfirmedInterruption: false,
            action: 'restore',
            duckVolume: 1.0,
            reason: 'Speech stopped for >= 400ms, restoring TTS volume',
            previousTurnId: currentTurnId,
            newTurnId: currentTurnId,
          };
        }
      } else {
        this._voicedDurationMs = Math.max(0, this._voicedDurationMs - frameDurationMs);
      }
    }

    return {
      isConfirmedInterruption: false,
      action: this._isDucked ? 'duck' : 'none',
      duckVolume: this._isDucked ? 0.2 : 1.0,
      reason: 'Awaiting VAD threshold confirmation',
      previousTurnId: currentTurnId,
      newTurnId: currentTurnId,
    };
  }

  /**
   * Evaluates an explicit client barge_in event or interim transcript
   */
  public evaluateTranscriptInterruption(
    userText: string,
    currentTurnId: number,
    lenientEcho = false
  ): BargeInDecision {
    const clean = this.normalizeSpeech(userText);

    // 1. Check if userText is an acoustic echo of what assistant just spoke
    if (this.isAcousticEcho(clean, lenientEcho)) {
      return {
        isConfirmedInterruption: false,
        reason: 'Suppressed acoustic echo of assistant speech',
        previousTurnId: currentTurnId,
        newTurnId: currentTurnId,
      };
    }

    // 2. If assistant is currently speaking or just finished within echo grace window
    const now = Date.now();
    const isPlayingOrRecent =
      this._isAssistantPlaying || (now - this._lastPlaybackEndTime < this._echoGracePeriodMs);

    if (isPlayingOrRecent && clean.length > 0) {
      return this.executeInterruption(currentTurnId, `Spoken interruption: "${clean.slice(0, 30)}"`);
    }

    return {
      isConfirmedInterruption: false,
      reason: 'No active speech to interrupt',
      previousTurnId: currentTurnId,
      newTurnId: currentTurnId,
    };
  }

  /**
   * Executes the interruption cancellation sequence:
   * 1. Abort in-flight TTS SSE stream
   * 2. Increment turn ID
   * 3. Reset speech frame counter
   */
  public executeInterruption(currentTurnId: number, reason: string): BargeInDecision {
    if (this._activeAbortController) {
      try {
        this._activeAbortController.abort();
      } catch (err: any) {
        console.warn('[BargeInController] Abort error:', err.message);
      }
      this._activeAbortController = null;
    }

    this._isAssistantPlaying = false;
    this._consecutiveSpeechFrames = 0;
    this._voicedDurationMs = 0;
    this._silenceDurationMs = 0;
    this._isDucked = false;
    const newTurnId = currentTurnId + 1;

    return {
      isConfirmedInterruption: true,
      action: 'cancel',
      reason,
      previousTurnId: currentTurnId,
      newTurnId,
    };
  }

  /**
   * Validates if a chunk should be played or dropped based on turn ownership
   */
  public isChunkValid(chunkTurnId: number, activeTurnId: number): boolean {
    return chunkTurnId === activeTurnId;
  }

  /**
   * Detects whether the transcript matches recent assistant speech
   */
  private isAcousticEcho(transcript: string, lenient = false): boolean {
    if (!transcript) return false;
    const words = transcript.split(' ').filter(Boolean);
    if (words.length === 0) return false;
    // Short fragments ("hello", "hi") are matched as whole words; the overlap bar is lower for the
    // welcome greeting, where the echo canceller has not converged yet.
    const threshold = lenient ? 0.5 : 0.7;

    for (const recent of this._recentAssistantSpeech) {
      if (` ${recent} `.includes(` ${transcript} `) || ` ${transcript} `.includes(` ${recent} `)) {
        return true;
      }
      const recentWords = new Set(recent.split(' '));
      const matchCount = words.filter((w) => recentWords.has(w) || (w.length > 3 && recent.includes(w))).length;
      if (matchCount / words.length >= threshold) {
        return true;
      }
    }
    return false;
  }

  public reset(): void {
    if (this._activeAbortController) {
      this._activeAbortController.abort();
      this._activeAbortController = null;
    }
    this._consecutiveSpeechFrames = 0;
    this._voicedDurationMs = 0;
    this._silenceDurationMs = 0;
    this._isDucked = false;
    this._isAssistantPlaying = false;
    this._recentAssistantSpeech = [];
  }
}

