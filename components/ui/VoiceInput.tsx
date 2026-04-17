"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { createVADState, stepVAD, type VADConfig } from "@/lib/voice-agent/vad";
import { isNoiseLikeTranscript, shouldDropSegment, type SegmentDropReason } from "@/lib/voice-agent/voice-input-policy";

/* ─── constants ─── */
const FAST_VOICE_MODE = /^(1|true|yes)$/i.test(process.env.NEXT_PUBLIC_FAST_VOICE_MODE ?? "");
const ANALYSIS_INTERVAL_MS = 100;  // VAD poll interval
const VAD_MIN_RMS_BASE = 0.012;
const VAD_NOISE_MULTIPLIER = 2.4;
const VAD_ONSET_FRAMES_REQUIRED = FAST_VOICE_MODE ? 2 : 3;
const VAD_RELEASE_FRAMES_REQUIRED = 2;
const VAD_BARGEIN_COOLDOWN_MS = 1500;
const SILENCE_DURATION_MS = FAST_VOICE_MODE ? 700 : 1800;  // low-latency commit in fast mode
const VAD_NOISE_FLOOR_ALPHA = 0.92;
const VAD_NOISE_FLOOR_MARGIN = 0.85;
const VAD_MIN_SPEECH_BAND_RATIO = 0.30;
const VAD_MIN_ZCR = 0.015;
const VAD_MAX_ZCR = 0.22;
const VAD_MAX_ACTIVE_SPEECH_MS = 8000;
const VAD_MAX_IDLE_RECORDING_MS = FAST_VOICE_MODE ? 4500 : 7000;
const MIN_IDLE_ROTATE_QUALIFIED_FRAMES = 3;
const MIN_STT_QUALIFIED_VOICED_FRAMES = FAST_VOICE_MODE ? 2 : 3;
const MIN_STT_QUALIFIED_SPEECH_MS = FAST_VOICE_MODE ? 180 : 300;
const PRE_SPEECH_THRESHOLD_MULTIPLIER = 0.82;
const PRE_SPEECH_BAND_RATIO_MULTIPLIER = 0.78;
const PRE_SPEECH_MIN_ZCR = 0.01;
const PRE_SPEECH_MAX_ZCR = 0.28;
const PRE_SPEECH_FRAMES_REQUIRED = 2;
const PRE_BARGEIN_COOLDOWN_MS = 900;
const DEDUP_WINDOW_MS = 2500;

const VAD_CONFIG: VADConfig = {
  analysisIntervalMs: ANALYSIS_INTERVAL_MS,
  minRmsBase: VAD_MIN_RMS_BASE,
  noiseMultiplier: VAD_NOISE_MULTIPLIER,
  onsetFramesRequired: VAD_ONSET_FRAMES_REQUIRED,
  releaseFramesRequired: VAD_RELEASE_FRAMES_REQUIRED,
  bargeInCooldownMs: VAD_BARGEIN_COOLDOWN_MS,
  silenceDurationMs: SILENCE_DURATION_MS,
  noiseFloorAlpha: VAD_NOISE_FLOOR_ALPHA,
  noiseFloorMargin: VAD_NOISE_FLOOR_MARGIN,
  minSpeechBandRatio: VAD_MIN_SPEECH_BAND_RATIO,
  minZcr: VAD_MIN_ZCR,
  maxZcr: VAD_MAX_ZCR,
  maxActiveSpeechMs: VAD_MAX_ACTIVE_SPEECH_MS,
  maxIdleRecordingMs: VAD_MAX_IDLE_RECORDING_MS,
  minIdleRotateQualifiedFrames: MIN_IDLE_ROTATE_QUALIFIED_FRAMES,
  preSpeechThresholdMultiplier: PRE_SPEECH_THRESHOLD_MULTIPLIER,
  preSpeechBandRatioMultiplier: PRE_SPEECH_BAND_RATIO_MULTIPLIER,
  preSpeechMinZcr: PRE_SPEECH_MIN_ZCR,
  preSpeechMaxZcr: PRE_SPEECH_MAX_ZCR,
  preSpeechFramesRequired: PRE_SPEECH_FRAMES_REQUIRED,
  preBargeInCooldownMs: PRE_BARGEIN_COOLDOWN_MS,
};

function computeZcr(samples: Float32Array): number {
  if (samples.length < 2) return 0;
  let crossings = 0;
  let prev = samples[0] ?? 0;
  for (let i = 1; i < samples.length; i += 1) {
    const curr = samples[i] ?? 0;
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) crossings += 1;
    prev = curr;
  }
  return crossings / (samples.length - 1);
}

function computeSpeechBandRatio(freqDb: Float32Array, sampleRate: number, fftSize: number): number {
  if (!freqDb.length || sampleRate <= 0 || fftSize <= 0) return 0;

  const hzPerBin = sampleRate / fftSize;
  const lowBin = Math.max(1, Math.floor(250 / hzPerBin));
  const highBin = Math.min(freqDb.length - 1, Math.ceil(3800 / hzPerBin));

  let total = 0;
  let speech = 0;

  for (let i = 1; i < freqDb.length; i += 1) {
    const db = Number.isFinite(freqDb[i]) ? freqDb[i] : -120;
    const power = Math.pow(10, db / 10);
    total += power;
    if (i >= lowBin && i <= highBin) {
      speech += power;
    }
  }

  if (total <= 0) return 0;
  return speech / total;
}

export default function VoiceInput({
  sessionActive,
  suspended = false,
  resetSignal = 0,
  languageCode = "en-IN",
  placeholder = "Listening continuously",
  onFinalTranscript,
  onSessionError,
  onListeningStateChange,
  onSpeechStart,
}: {
  sessionActive: boolean;
  suspended?: boolean;
  resetSignal?: number;
  languageCode?: string;
  placeholder?: string;
  onFinalTranscript: (text: string) => void;
  onSessionError?: (error: string) => void;
  onListeningStateChange?: (listening: boolean) => void;
  onSpeechStart?: () => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // core refs
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleBufRef = useRef<Float32Array | null>(null);
  const freqBufRef = useRef<Float32Array | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // state tracking refs
  const hasSpeechRef = useRef(false);
  const vadStateRef = useRef(createVADState(0.003, Date.now()));
  const lastSubmittedRef = useRef({ text: "", ts: 0 });
  const segmentDropReasonRef = useRef<SegmentDropReason>("none");
  const recordingStartedAtRef = useRef(0);
  const frameCountRef = useRef(0);
  const rmsSumRef = useRef(0);
  const speechBandSumRef = useRef(0);
  const zcrSumRef = useRef(0);
  const preSpeechTriggeredRef = useRef(false);
  const preSpeechTsRef = useRef<number | null>(null);
  const speechConfirmTsRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const setRecState = useCallback(
    (v: boolean) => {
      setIsRecording(v);
      onListeningStateChange?.(v);
    },
    [onListeningStateChange],
  );

  const ensureStream = useCallback(async () => {
    if (streamRef.current?.active) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      return stream;
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access."
          : "Failed to access microphone. You can continue by typing.";
      setError(msg);
      onSessionError?.(msg);
      return null;
    }
  }, [onSessionError]);

  const ensureAnalyser = useCallback((stream: MediaStream) => {
    if (analyserRef.current && audioCtxRef.current?.state !== "closed") return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sampleBufRef.current = new Float32Array(analyser.fftSize);
    freqBufRef.current = new Float32Array(analyser.frequencyBinCount);
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<string | null> => {
      if (blob.size < 1000) return null;
      setIsSending(true);
      try {
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("languageCode", languageCode);
        const res = await fetch("/api/sarvam-stt", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          console.warn("[VoiceInput] STT error:", data?.error?.message, data?.attempts, data?.timedOut);
          return null;
        }

        const transcript = (data.transcript || "").trim();
        if (isNoiseLikeTranscript(transcript)) {
          console.log("[VoiceInput] Dropping noise-like transcript:", transcript);
          return null;
        }

        return transcript;
      } catch (err) {
        console.warn("[VoiceInput] STT fetch error:", err);
        return null;
      } finally {
        setIsSending(false);
      }
    },
    [languageCode],
  );

  const stopVAD = useCallback(() => {
    if (vadTimerRef.current !== null) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    stopVAD();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      try { rec.stop(); } catch { /* noop */ }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    hasSpeechRef.current = false;
    vadStateRef.current = createVADState(0.003, Date.now());
    segmentDropReasonRef.current = "none";
    recordingStartedAtRef.current = 0;
    frameCountRef.current = 0;
    rmsSumRef.current = 0;
    speechBandSumRef.current = 0;
    zcrSumRef.current = 0;
    preSpeechTriggeredRef.current = false;
    preSpeechTsRef.current = null;
    speechConfirmTsRef.current = null;
    setRecState(false);
  }, [setRecState, stopVAD]);

  const runRecordLoop = useCallback(
    async (stream: MediaStream) => {
      if (!mountedRef.current) return;

      ensureAnalyser(stream);

      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      hasSpeechRef.current = false;
      segmentDropReasonRef.current = "none";
      const startMs = Date.now();
      recordingStartedAtRef.current = startMs;
      frameCountRef.current = 0;
      rmsSumRef.current = 0;
      speechBandSumRef.current = 0;
      zcrSumRef.current = 0;
      preSpeechTriggeredRef.current = false;
      preSpeechTsRef.current = null;
      speechConfirmTsRef.current = null;
      vadStateRef.current = createVADState(0.003, startMs);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(300);
      setRecState(true);
      setError(null);

      stopVAD();
      vadTimerRef.current = setInterval(() => {
        const analyser = analyserRef.current;
        const buf = sampleBufRef.current;
        const freqBuf = freqBufRef.current;
        const audioCtx = audioCtxRef.current;
        if (!analyser || !buf || !freqBuf || !audioCtx) return;

        analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        analyser.getFloatFrequencyData(freqBuf as Float32Array<ArrayBuffer>);

        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const speechBandRatio = computeSpeechBandRatio(freqBuf, audioCtx.sampleRate, analyser.fftSize);
        const zcr = computeZcr(buf);
        frameCountRef.current += 1;
        rmsSumRef.current += rms;
        speechBandSumRef.current += speechBandRatio;
        zcrSumRef.current += zcr;

        const event = stepVAD(
          vadStateRef.current,
          { rms, speechBandRatio, zcr },
          Date.now(),
          VAD_CONFIG,
        );
        hasSpeechRef.current = vadStateRef.current.hasSpeech;

        if (event === "pre_speech_start") {
          if (!preSpeechTriggeredRef.current) {
            const now = Date.now();
            preSpeechTriggeredRef.current = true;
            preSpeechTsRef.current = now;
            console.log("[VoiceInput] Early pre-speech barge-in", {
              event,
              rms: rms.toFixed(4),
              speechBandRatio: speechBandRatio.toFixed(3),
              zcr: zcr.toFixed(3),
            });
          }
          return;
        }

        if (event === "speech_start") {
          const now = Date.now();
          speechConfirmTsRef.current = now;
          onSpeechStart?.();
          const preSpeechToConfirmMs = preSpeechTsRef.current !== null ? now - preSpeechTsRef.current : null;
          console.log("[VoiceInput] Confirmed speech onset", {
            event,
            rms: rms.toFixed(4),
            speechBandRatio: speechBandRatio.toFixed(3),
            zcr: zcr.toFixed(3),
            preSpeechTriggered: preSpeechTsRef.current !== null,
            preSpeechToConfirmMs,
            bargeInEarlyMs: preSpeechToConfirmMs,
          });
          return;
        }

        if (event === "force_commit_noise") {
          segmentDropReasonRef.current = "forced_noise";
          stopVAD();
          if (recorder.state === "recording") {
            try { recorder.stop(); } catch { /* noop */ }
          }
          return;
        }

        if (event === "rotate_idle") {
          segmentDropReasonRef.current = "idle_rotate";
          stopVAD();
          if (recorder.state === "recording") {
            try { recorder.stop(); } catch { /* noop */ }
          }
          return;
        }

        if (event === "commit_silence") {
          stopVAD();
          if (recorder.state === "recording") {
            try { recorder.stop(); } catch { /* noop */ }
          }
        }
      }, ANALYSIS_INTERVAL_MS);

      return new Promise<void>((resolve) => {
        recorder.onstop = async () => {
          setRecState(false);
          stopVAD();

          const chunks = chunksRef.current;
          chunksRef.current = [];
          const vadSnapshot = vadStateRef.current;
          const hadSpeech = hasSpeechRef.current;
          hasSpeechRef.current = false;
          vadStateRef.current = createVADState(0.003, Date.now());

          const dropReason = segmentDropReasonRef.current;
          segmentDropReasonRef.current = "none";

          const qualifiedSpeechMs = vadSnapshot.qualifiedVoicedFrames * ANALYSIS_INTERVAL_MS;
          const recordingDurationMs = Math.max(0, Date.now() - recordingStartedAtRef.current);
          recordingStartedAtRef.current = 0;
          const frameCount = frameCountRef.current;
          const rmsAvg = frameCount > 0 ? rmsSumRef.current / frameCount : 0;
          const speechBandAvg = frameCount > 0 ? speechBandSumRef.current / frameCount : 0;
          const zcrAvg = frameCount > 0 ? zcrSumRef.current / frameCount : 0;
          const preSpeechTs = preSpeechTsRef.current;
          const speechConfirmTs = speechConfirmTsRef.current;
          frameCountRef.current = 0;
          rmsSumRef.current = 0;
          speechBandSumRef.current = 0;
          zcrSumRef.current = 0;
          preSpeechTriggeredRef.current = false;
          preSpeechTsRef.current = null;
          speechConfirmTsRef.current = null;

          const dropDecision = shouldDropSegment({
            dropReason,
            hadSpeech,
            qualifiedVoicedFrames: vadSnapshot.qualifiedVoicedFrames,
            qualifiedSpeechMs,
            minSttQualifiedVoicedFrames: MIN_STT_QUALIFIED_VOICED_FRAMES,
            minSttQualifiedSpeechMs: MIN_STT_QUALIFIED_SPEECH_MS,
            minIdleRotateQualifiedFrames: MIN_IDLE_ROTATE_QUALIFIED_FRAMES,
          });

          if (dropDecision.shouldDrop || chunks.length === 0) {
            console.log("[VoiceInput] Dropping noisy segment", {
              dropReason,
              qualifiedFrames: vadSnapshot.qualifiedVoicedFrames,
              recordingDurationMs,
              qualifiedSpeechMs,
              skippedByQualityGate: dropDecision.skippedByQualityGate,
              preSpeechTriggered: preSpeechTs !== null,
              preSpeechToConfirmMs: preSpeechTs !== null && speechConfirmTs !== null ? speechConfirmTs - preSpeechTs : null,
              bargeInEarlyMs: preSpeechTs !== null && speechConfirmTs !== null ? speechConfirmTs - preSpeechTs : null,
              rmsAvg: rmsAvg.toFixed(4),
              speechBandAvg: speechBandAvg.toFixed(3),
              zcrAvg: zcrAvg.toFixed(3),
            });
            resolve();
            return;
          }

          const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
          const transcript = await transcribeBlob(blob);

          if (transcript && mountedRef.current) {
            const now = Date.now();
            const last = lastSubmittedRef.current;
            if (!(transcript.toLowerCase() === last.text.toLowerCase() && now - last.ts < DEDUP_WINDOW_MS)) {
              lastSubmittedRef.current = { text: transcript, ts: now };
              console.log("[VoiceInput] Transcript:", transcript);
              onFinalTranscript(transcript);
            }
          }
          resolve();
        };
      });
    },
    [ensureAnalyser, onFinalTranscript, onSpeechStart, setRecState, stopVAD, transcribeBlob],
  );

  const loopActiveRef = useRef(false);

  useEffect(() => {
    if (!sessionActive || suspended) {
      discardRecording();
      loopActiveRef.current = false;
      return;
    }

    if (loopActiveRef.current) return;
    loopActiveRef.current = true;

    let cancelled = false;

    (async () => {
      const stream = await ensureStream();
      if (!stream || cancelled) {
        loopActiveRef.current = false;
        return;
      }

      while (!cancelled && mountedRef.current) {
        try {
          await runRecordLoop(stream);
        } catch (err) {
          console.warn("[VoiceInput] loop error:", err);
          await new Promise((r) => setTimeout(r, 500));
        }

        if (cancelled) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      loopActiveRef.current = false;
    })();

    return () => {
      cancelled = true;
      discardRecording();
      loopActiveRef.current = false;
    };
  }, [sessionActive, suspended, ensureStream, runRecordLoop, discardRecording]);

  useEffect(() => {
    if (!resetSignal) return;
    chunksRef.current = [];
    hasSpeechRef.current = false;
    vadStateRef.current = createVADState(0.003, Date.now());
    segmentDropReasonRef.current = "none";
    recordingStartedAtRef.current = 0;
    frameCountRef.current = 0;
    rmsSumRef.current = 0;
    speechBandSumRef.current = 0;
    zcrSumRef.current = 0;
    preSpeechTriggeredRef.current = false;
    preSpeechTsRef.current = null;
    speechConfirmTsRef.current = null;
  }, [resetSignal]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRecording();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close();
      }
    };
  }, [discardRecording]);

  const statusText = (() => {
    if (!sessionActive) return placeholder;
    if (isSending) return "Processing speech...";
    if (isRecording) return "Recording...";
    return "Starting mic...";
  })();

  return (
    <div className="relative inline-flex items-center gap-2">
      <div className={`voice-pill ${sessionActive && isRecording ? "voice-pill-live" : "voice-pill-idle"}`}>
        <Mic
          className={`h-4 w-4 ${sessionActive && isRecording ? "text-emerald-700" : "text-gray-500"}`}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-gray-700">{statusText}</span>
      </div>

      {error && (
        <div className="absolute -bottom-7 left-0 rounded-full bg-red-600 px-2 py-1 text-xs whitespace-nowrap text-white z-10">
          {error}
        </div>
      )}
    </div>
  );
}
