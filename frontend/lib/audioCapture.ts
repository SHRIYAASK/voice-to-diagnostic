/**
 * ApplianceCare AI – Browser Audio Capture Module
 *
 * Configures optimal browser microphone constraints:
 * - echoCancellation: ideal true
 * - noiseSuppression: ideal true
 * - autoGainControl: ideal false (configurable for AGC ON vs OFF benchmark)
 * - channelCount: ideal 1
 * - sampleRate: ideal 16000
 *
 * Inspects track.getSettings() to report actual applied constraints.
 */

export interface MicrophoneCaptureResult {
  stream: MediaStream;
  track: MediaStreamTrack;
  actualSettings: MediaTrackSettings;
}

export interface AudioCaptureOptions {
  autoGainControl?: boolean;
}

export async function startMicrophone(options: AudioCaptureOptions = {}): Promise<MicrophoneCaptureResult> {
  const useAgc = options.autoGainControl ?? false;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: useAgc },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 16000 },
    },
    video: false,
  });

  const track = stream.getAudioTracks()[0];
  const actualSettings = track.getSettings();
  console.info('[AudioCapture] Actual microphone settings applied by browser:', actualSettings);

  return {
    stream,
    track,
    actualSettings,
  };
}

