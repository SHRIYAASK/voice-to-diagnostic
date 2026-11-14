"use client";

/**
 * VoiceWave: the bar waveform for the ApplianceCare voice dock.
 *
 * - Bars are driven by real audio (mic while listening, TTS output while speaking),
 *   never by a canned loop, so the motion always means something.
 * - Updates go straight to the DOM in a requestAnimationFrame loop; React does not
 *   re-render 60 times a second.
 * - Low frequencies sit in the middle and the shape is mirrored, so speech reads as
 *   a centred "voice" shape rather than a spectrum analyser.
 *
 * Pair with voice-dock.css (dots, rings and the end-of-turn ring).
 */
import { useEffect, useRef } from "react";

export type VoiceState =
  | "ready"      // session open, nobody talking (bars show room noise at low gain)
  | "listening"  // user is talking
  | "sending"    // silence detected, end-of-turn ring is drawing
  | "thinking"   // turn sent, waiting for the reply
  | "speaking"   // assistant audio is playing
  | "bargein"    // user talked over the assistant
  | "blocked";   // mic permission denied / no input

const COLORS: Record<VoiceState, string> = {
  ready: "#6B7787",
  listening: "#F1F3F6",
  sending: "#F1F3F6",
  thinking: "#8EA3FF",
  speaking: "#8EA3FF",
  bargein: "#F1F3F6",
  blocked: "#4A5563",
};

// How strongly each state reacts to sound.
const GAIN: Partial<Record<VoiceState, number>> = {
  ready: 0.35,
  listening: 2.2,
  bargein: 2.2,
  speaking: 1.8,
  sending: 0.6,
};

const ATTACK_S = 0.05;  // 50 ms rise
const RELEASE_S = 0.2;  // 200 ms fall
const MIN_HZ = 90;      // speech fundamentals start here
const MAX_HZ = 4000;    // most speech energy is below this

/* ---------- audio helpers ---------- */

/** Mic input. Ask for the browser's built-in echo cancellation so TTS isn't heard as the user. */
export async function openMic(ctx: AudioContext) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0; // smoothing happens below, per bar
  ctx.createMediaStreamSource(stream).connect(analyser); // never connect the mic to ctx.destination
  return { stream, analyser };
}

const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/**
 * TTS output played through an <audio> element.
 * createMediaElementSource can only be called once per element, so it is cached.
 * If you stream PCM chunks instead, connect your playback node to an analyser the same way.
 */
export function playbackAnalyser(ctx: AudioContext, el: HTMLMediaElement) {
  let src = elementSources.get(el);
  if (!src) {
    src = ctx.createMediaElementSource(el);
    elementSources.set(el, src);
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser);
  analyser.connect(ctx.destination); // keep the reply audible
  return analyser;
}

/* ---------- component ---------- */

type Props = {
  state: VoiceState;
  /** Mic analyser while listening/ready/bargein, playback analyser while speaking. */
  analyser: AnalyserNode | null;
  bars?: number;     // even number; default 24
  height?: number;   // px; default 40
  barWidth?: number; // px; default 3
  gap?: number;      // px; default 3
  /** Element that receives a --voice-level CSS variable (0..1), e.g. the mic button wrapper. */
  levelTarget?: React.RefObject<HTMLElement | null>;
};

export function VoiceWave({
  state,
  analyser,
  bars = 24,
  height = 40,
  barWidth = 3,
  gap = 3,
  levelTarget,
}: Props) {
  const barRefs = useRef<HTMLSpanElement[]>([]);
  const levels = useRef<Float32Array>(new Float32Array(bars / 2));

  useEffect(() => {
    const half = bars / 2;
    if (levels.current.length !== half) levels.current = new Float32Array(half);

    const paint = (lv: Float32Array) => {
      for (let i = 0; i < half; i++) {
        const s = 0.08 + 0.92 * lv[i];
        // mirror: index 0 is the centre (lowest band)
        const left = barRefs.current[half - 1 - i];
        const right = barRefs.current[half + i];
        if (left) left.style.transform = `scaleY(${s})`;
        if (right) right.style.transform = `scaleY(${s})`;
      }
    };

    if (!analyser || state === "thinking" || state === "blocked") {
      levels.current.fill(0);
      paint(levels.current);
      levelTarget?.current?.style.setProperty("--voice-level", "0");
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const hzPerBin = analyser.context.sampleRate / analyser.fftSize;
    const edges = Array.from({ length: half + 1 }, (_, i) =>
      Math.round((MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / half)) / hzPerBin),
    );
    const gain = GAIN[state] ?? 1;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (reduced && now - lastPaint < 120) return; // ~8 fps, no smoothing flourish
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      lastPaint = now;

      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let b = 0; b < half; b++) {
        const lo = edges[b];
        const hi = Math.max(lo + 1, edges[b + 1]);
        let acc = 0;
        for (let k = lo; k < hi; k++) acc += data[k];
        // dB-ish 0..255 -> 0..1, a gentle curve so quiet speech still moves
        const target = Math.min(1, Math.pow((acc / (hi - lo) / 255) * gain, 1.4));
        const cur = levels.current[b];
        const tau = target > cur ? ATTACK_S : RELEASE_S;
        levels.current[b] = reduced ? target : cur + (target - cur) * (1 - Math.exp(-dt / tau));
        sum += levels.current[b];
      }
      paint(levels.current);
      levelTarget?.current?.style.setProperty("--voice-level", (sum / half).toFixed(3));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, state, bars, levelTarget]);

  if (state === "thinking") {
    return (
      <div className="vd-dots" aria-hidden="true" style={{ height, width: bars * (barWidth + gap) - gap }}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", alignItems: "center", gap, height, flex: "0 0 auto" }}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            if (el) barRefs.current[i] = el;
          }}
          style={{
            display: "block",
            width: barWidth,
            height,
            borderRadius: barWidth,
            background: COLORS[state],
            transform: "scaleY(0.08)",
            transformOrigin: "center",
            transition: "background-color 150ms linear", // blue <-> white cross-fade on barge-in
            willChange: "transform",
          }}
        />
      ))}
    </div>
  );
}
