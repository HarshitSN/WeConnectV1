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
    <div className="flex flex-col gap-2">
      {!supported && (
        <p className="text-xs text-amber-400">
          Speech recognition is not available in this browser. Try Chrome on desktop or Android.
        </p>
      )}
      <button
        type="button"
        disabled={disabled || !supported}
        onClick={listen}
        className="rounded-full border border-violet-400/40 bg-violet-500/20 px-5 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
      >
        {listening ? "Listening…" : "Speak"}
      </button>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-violet-500/40 disabled:opacity-50"
          placeholder="Type instead of speaking"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled || !manualText.trim()}
          onClick={() => {
            const trimmed = manualText.trim();
            if (!trimmed) return;
            onTranscript(trimmed);
            setManualText("");
          }}
          className="rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
