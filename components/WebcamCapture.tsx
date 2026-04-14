"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onCapture: (dataUrl: string) => void;
  scanning?: boolean;
  label?: string;
};

export function WebcamCapture({
  onCapture,
  scanning = false,
  label = "Record ID clip (2s)",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [recording, setRecording] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setError("Camera permission denied or unavailable (HTTPS required).");
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const capture = async () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") {
      setError("Video capture is unavailable in this browser. Use a Chromium browser over HTTPS.");
      return;
    }
    const preferredTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const chunks: BlobPart[] = [];
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      setRecording(true);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      recorder.stop();
      await stopped;
      const blobType = recorder.mimeType || "video/webm";
      const blob = new Blob(chunks, { type: blobType });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("file_read_failed"));
        reader.readAsDataURL(blob);
      });
      onCapture(dataUrl);
    } catch {
      setError("Could not record video clip. Retry after reopening camera.");
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 aspect-video">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {scanning && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 h-0.5 animate-scan bg-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent" />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {!active ? (
          <button
            type="button"
            onClick={start}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Open camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={capture}
              disabled={recording}
              className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-400"
            >
              {recording ? "Recording…" : label}
            </button>
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
