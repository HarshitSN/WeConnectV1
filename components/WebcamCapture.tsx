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
    <div className="space-y-4">
      <div className={`relative overflow-hidden rounded-[32px] border-2 transition-all ${active ? "border-cyan-400 shadow-lg shadow-cyan-100" : "border-slate-100 bg-slate-50"} aspect-video flex items-center justify-center`}>
        {!active && !error && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <svg className="h-12 w-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-xs font-bold uppercase tracking-widest">Camera Inactive</p>
          </div>
        )}
        <video ref={videoRef} className={`h-full w-full object-cover ${active ? "opacity-100" : "opacity-0"}`} playsInline muted />
        {scanning && active && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 h-1 animate-scan bg-cyan-400 shadow-[0_0_25px_rgba(34,211,238,1)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent" />
          </div>
        )}
        {recording && (
          <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg animate-pulse">
            <span className="h-2 w-2 rounded-full bg-white"></span>
            REC
          </div>
        )}
      </div>
      
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600">
          <span>✖</span> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!active ? (
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0"
          >
            Open Camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={capture}
              disabled={recording}
              className={`flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black uppercase tracking-widest transition-all shadow-md ${
                recording 
                  ? "bg-slate-100 text-slate-400" 
                  : "bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-cyan-100 hover:-translate-y-0.5 hover:shadow-cyan-200"
              }`}
            >
              {recording ? "Recording…" : label}
            </button>
            <button
              type="button"
              onClick={stop}
              className="rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
