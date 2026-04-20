"use client";

import { useCallback, useState } from "react";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

function getRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function VoiceConcierge({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [manualText, setManualText] = useState("");

  const listen = useCallback(() => {
    const rec = getRecognition();
    if (!rec) {
      setSupported(false);
      return;
    }
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    setListening(true);
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      if (text) onTranscript(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }, [onTranscript]);

  return (
    <div className="flex flex-col">
      {!supported && (
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600">
          Speech recognition is not available in this browser.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || !supported}
        onClick={listen}
        className={`flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black uppercase tracking-widest transition-all shadow-md ${
          listening 
            ? "bg-rose-500 text-white animate-pulse" 
            : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-100 hover:-translate-y-0.5 hover:shadow-violet-200"
        } disabled:opacity-40 disabled:shadow-none disabled:translate-y-0`}
      >
        <div className="relative flex h-5 w-5 items-center justify-center">
          {listening ? (
            <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-white"></span>
          )}
          <span className="relative h-2 w-2 rounded-full bg-white"></span>
        </div>
        {listening ? "LISTENING..." : "ACTIVATE VOICE"}
      </button>
    </div>
  );
}
