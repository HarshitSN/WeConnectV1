"use client";

import { useEffect, useState } from "react";

/* ── Thinking dots: shown before the bot starts "typing" ── */
export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-thinking-bounce"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

/* ── Typewriter: streams text char by char ── */
export default function TypewriterText({
  text,
  speed = 25,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return (
    <span>
      {displayed}
      {!done && (
        <span className="inline-block w-[2px] h-[1em] bg-gray-500 ml-0.5 align-text-bottom animate-typewriter-cursor" />
      )}
    </span>
  );
}
