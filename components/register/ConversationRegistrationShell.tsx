"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import VoiceInput from "@/components/ui/VoiceInput";
import ConversationTranscript from "@/components/register/ConversationTranscript";
import VoiceAgentControls from "@/components/register/VoiceAgentControls";
import ProgressStepper from "@/components/register/ProgressStepper";
import AIOrb from "@/components/ui/AIOrb";
import type { OrbState } from "@/components/ui/AIOrb";
import CompletionCelebration from "@/components/ui/CompletionCelebration";
import { getNextQuestion, initialPointer, getSectionIndex } from "@/lib/voice-agent/engine";
import type { ConversationMessage, ConversationPointer, RegistrationState } from "@/types";
import { cn } from "@/lib/utils";
import { panelLift, SPRING_SOFT, statusGlow } from "@/lib/motion";

interface HistoryEntry {
  pointer: ConversationPointer;
  answers: RegistrationState;
  assessorId: string;
}

function mkMessage(type: ConversationMessage["type"], text: string, pointer?: ConversationPointer): ConversationMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    text,
    timestamp: new Date().toISOString(),
    pointer,
  };
}

function nextBySkip(pointer: ConversationPointer, state: RegistrationState): ConversationPointer {
  const total = state.ownership_structure.reduce((sum, e) => sum + Number(e.percent || 0), 0);
  switch (pointer.stepId) {
    case "business_name":
      return { stepId: "women_owned" };
    case "women_owned":
      return { stepId: "country" };
    case "country":
      return { stepId: "naics_codes" };
    case "us_citizen":
      return { stepId: "naics_codes" };
    case "visa_type":
      return { stepId: "webank_certified" };
    case "webank_certified":
      return { stepId: "naics_codes" };
    case "naics_codes":
      return { stepId: "unspsc_codes" };
    case "unspsc_codes":
      return { stepId: "designations" };
    case "designations":
      return { stepId: "owner_details", ownerIndex: 0 };
    case "owner_details":
      return { stepId: "owner_add_more", ownerIndex: pointer.ownerIndex ?? 0 };
    case "owner_add_more":
      return total >= 100 ? { stepId: "num_employees" } : { stepId: "owner_details", ownerIndex: (pointer.ownerIndex ?? 0) + 1 };
    case "num_employees":
      return { stepId: "revenue_range" };
    case "revenue_range":
      return { stepId: "additional_certs" };
    case "additional_certs":
      return { stepId: "business_description" };
    case "business_description":
      return { stepId: "cert_type" };
    case "cert_type":
      return { stepId: "assessor" };
    case "assessor":
      return { stepId: "done" };
    default:
      return { stepId: "done" };
  }
}

async function playPrompt(text: string, abortSignal?: AbortSignal) {
  const safeText = text.trim();
  if (!safeText) return;

  try {
    if (abortSignal?.aborted) return;
    const response = await fetch("/api/sarvam-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: safeText, languageCode: "en-IN" }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      console.warn("[TTS] Request failed:", response.status, data?.error?.code, data?.error?.details || data?.error?.message);
      return;
    }
    if (!data.audioBase64) return;
    if (abortSignal?.aborted) return;

    const audio = new Audio(`data:${data.mimeType ?? "audio/wav"};base64,${data.audioBase64}`);
    await new Promise<void>((resolve) => {
      let handled = false;
      const finish = () => {
        if (!handled) {
          handled = true;
          resolve();
        }
      };
      audio.onended = finish;
      audio.onerror = finish;
      
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          audio.pause();
          finish();
        });
      }
      
      void audio.play().catch(finish);
    });
  } catch {
    // TTS is best-effort; silent fallback keeps flow resilient.
  }
}

export default function ConversationRegistrationShell({
  answers,
  setAnswers,
  assessorId,
  setAssessorId,
  onPointerChange,
}: {
  answers: RegistrationState;
  setAnswers: Dispatch<SetStateAction<RegistrationState>>;
  assessorId: string;
  setAssessorId: (id: string) => void;
  onPointerChange?: (pointer: ConversationPointer) => void;
}) {
  const [pointer, setPointer] = useState<ConversationPointer>(initialPointer());
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [micError, setMicError] = useState<string | null>(null);
  const [isVoiceIntroOpen, setIsVoiceIntroOpen] = useState(false);
  const [hasVoiceIntroAccepted, setHasVoiceIntroAccepted] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  const [celebrationText, setCelebrationText] = useState<string | null>(null);
  const [voiceDebug, setVoiceDebug] = useState<{ lastUtterance: string; ts: string; dropped: number }>({
    lastUtterance: "",
    ts: "",
    dropped: 0,
  });
  const prefersReducedMotion = useReducedMotion();
  const busyRef = useRef(busy);
  const runningRef = useRef(running);
  const speakingRef = useRef(isAssistantSpeaking);
  const audioAbortControllerRef = useRef<AbortController | null>(null);

  const currentPrompt = useMemo(() => getNextQuestion(pointer, answers), [pointer, answers]);

  const interactionState: OrbState = pointer.stepId === "done"
    ? "success"
    : busy
      ? "processing"
      : !running
        ? "idle"
        : isAssistantSpeaking
          ? "speaking"
          : isListening
            ? "listening"
            : "idle";

  const orbIntensity = interactionState === "speaking" ? 1.25 : interactionState === "listening" ? 1.15 : interactionState === "processing" ? 1.35 : 1;

  // Detect section transitions for celebration
  const prevSectionRef = useRef(getSectionIndex(pointer.stepId));
  useEffect(() => {
    const newSection = getSectionIndex(pointer.stepId);
    if (newSection > prevSectionRef.current && running) {
      const sectionNames = ["Business Info", "Location", "Industry", "Ownership", "Profile", "Certification"];
      const completedName = sectionNames[prevSectionRef.current] ?? "Section";
      setCelebrationText(`${completedName} complete!`);
      setTimeout(() => setCelebrationText(null), 2500);
    }
    prevSectionRef.current = newSection;
  }, [pointer.stepId, running]);

  const addMessage = useCallback((type: ConversationMessage["type"], text: string, msgPointer?: ConversationPointer) => {
    setMessages((prev) => [...prev, mkMessage(type, text, msgPointer)]);
  }, []);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    speakingRef.current = isAssistantSpeaking;
  }, [isAssistantSpeaking]);

  const speakPrompt = useCallback(async (text: string) => {
    const safeText = text.trim();
    if (!safeText) return;

    if (audioAbortControllerRef.current) {
      audioAbortControllerRef.current.abort();
    }
    const ac = new AbortController();
    audioAbortControllerRef.current = ac;

    setIsAssistantSpeaking(true);
    setVoiceResetSignal((v) => v + 1);
    try {
      await playPrompt(safeText, ac.signal);
    } finally {
      if (audioAbortControllerRef.current === ac) {
        setIsAssistantSpeaking(false);
      }
    }
  }, []);

  const askCurrent = useCallback(async () => {
    addMessage("bot_question", currentPrompt, pointer);
    await speakPrompt(currentPrompt);
  }, [addMessage, currentPrompt, speakPrompt, pointer]);

  useEffect(() => {
    onPointerChange?.(pointer);
  }, [onPointerChange, pointer]);

  useEffect(() => {
    if (!running || messages.length > 0) return;
    void askCurrent();
  }, [askCurrent, messages.length, running]);

  const processAnswer = useCallback(
    async (rawAnswer: string) => {
      const answer = rawAnswer.trim();
      if (!answer || busy || !running) return;

      addMessage("user_answer", answer);
      setHistory((prev) => [...prev, { pointer, answers: structuredClone(answers), assessorId }]);
      setBusy(true);

      try {
        const recentMessages = messages.slice(-4).map(msg => ({
          role: msg.type === "user_answer" ? "user" : "assistant",
          text: msg.text
        }));

        const response = await fetch("/api/register-voice-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pointer, answer, state: answers, history: recentMessages }),
        });

        const data = await response.json();
        if (!response.ok || !data.ok || !data.result) {
          addMessage("system_hint", data?.error?.message || "Could not process your answer. Please retry.");
          return;
        }

        const result = data.result;
        if (result.updates || result.ownershipUpdate) {
          setAnswers((prev) => ({
            ...prev,
            ...(result.updates ?? {}),
            ownership_structure: result.ownershipUpdate ?? prev.ownership_structure,
          }));
        }

        if (typeof result.assessorId === "string") {
          setAssessorId(result.assessorId);
        }

        addMessage("bot_confirm", result.confirmation);

        if (!result.ok && result.clarification) {
          addMessage("system_hint", result.clarification);
          setBusy(false);
          await speakPrompt(result.clarification);
          return;
        }

        setPointer(result.next);

        if (result.done) {
          const doneMsg = "Voice steps complete. Review the form, finish payment, then submit registration.";
          addMessage("system_hint", doneMsg);
          setBusy(false);
          await speakPrompt(doneMsg);
          return;
        }

        const rawPrompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
        const nextPrompt = rawPrompt || getNextQuestion(result.next, answers);
        addMessage("bot_question", nextPrompt, result.next);
        setBusy(false);
        await speakPrompt(nextPrompt);
      } catch {
        addMessage("system_hint", "Network issue while processing answer. Please retry.");
        setBusy(false);
      }
    },
    [addMessage, answers, assessorId, busy, pointer, running, setAnswers, setAssessorId, speakPrompt],
  );

  const onSubmitTyped = async () => {
    if (!typedAnswer.trim()) return;
    const input = typedAnswer;
    setTypedAnswer("");
    await processAnswer(input);
  };

  const onStartPause = () => {
    if (running) {
      setRunning(false);
      return;
    }

    if (!hasVoiceIntroAccepted) {
      setIsVoiceIntroOpen(true);
      return;
    }

    setRunning(true);
  };

  const onRepeat = async () => {
    if (!running) return;
    addMessage("bot_question", currentPrompt, pointer);
    await speakPrompt(currentPrompt);
  };

  const onSkip = async () => {
    if (!running || busy) return;
    const next = nextBySkip(pointer, answers);
    setPointer(next);
    const prompt = getNextQuestion(next, answers);
    addMessage("system_hint", "No problem — you can fill this in later from your dashboard.");
    addMessage("bot_question", prompt, next);
    await speakPrompt(prompt);
  };

  const onGoBack = async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setHistory((prev) => prev.slice(0, -1));
    setAnswers(last.answers);
    setAssessorId(last.assessorId);
    setPointer(last.pointer);
    const prompt = getNextQuestion(last.pointer, last.answers);
    addMessage("system_hint", "Moved back to previous question.");
    addMessage("bot_question", prompt, last.pointer);
    await speakPrompt(prompt);
  };

  const onEditLast = async () => {
    await onGoBack();
  };

  const onConfirmVoiceIntro = () => {
    setHasVoiceIntroAccepted(true);
    setIsVoiceIntroOpen(false);
    setRunning(true);
  };

  const handleSpeechStart = useCallback(() => {
    if (audioAbortControllerRef.current) {
      audioAbortControllerRef.current.abort();
      audioAbortControllerRef.current = null;
      setIsAssistantSpeaking(false);
    }
  }, []);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      if (!runningRef.current || busyRef.current || speakingRef.current) {
        setVoiceDebug((prev) => ({ ...prev, dropped: prev.dropped + 1 }));
        return;
      }
      setVoiceDebug({
        lastUtterance: text,
        ts: new Date().toISOString(),
        dropped: 0,
      });
      void processAnswer(text);
    },
    [processAnswer],
  );

  const modeLabel =
    interactionState === "success"
      ? "Completed"
      : interactionState === "processing"
        ? "Processing Answer"
        : interactionState === "speaking"
          ? "Assistant Speaking"
          : interactionState === "listening"
            ? "Listening"
            : "Paused";

  return (
    <motion.div
      className="space-y-4"
      variants={panelLift}
      initial="hidden"
      animate="visible"
    >
      <motion.div layout={!prefersReducedMotion} className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-lg">Voice Assistant</h2>
          <p className="text-xs text-gray-500">Interactive voice + text guidance. Use Pause to stop voice session; typing remains available anytime.</p>
        </div>
        <span className="badge bg-blue-100 text-blue-700">Current: {pointer.stepId.replaceAll("_", " ")}</span>
      </motion.div>

      <motion.div layout={!prefersReducedMotion}>
        <ProgressStepper currentStepId={pointer.stepId} />
      </motion.div>

      <AnimatePresence>
        {celebrationText && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <CompletionCelebration text={celebrationText} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout={!prefersReducedMotion} transition={SPRING_SOFT}>
        <VoiceAgentControls
          running={running}
          onStartPause={onStartPause}
          onRepeat={onRepeat}
          onSkip={onSkip}
          onGoBack={onGoBack}
          onEditLast={onEditLast}
        />
      </motion.div>

      <motion.div
        layout={!prefersReducedMotion}
        className={cn(
          "interaction-state interactive-surface bg-gradient-to-br p-3 ring-1",
          statusGlow[interactionState].ring,
          statusGlow[interactionState].surface,
        )}
        transition={SPRING_SOFT}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.12em]", statusGlow[interactionState].text)}>{modeLabel}</p>
            <p className="text-xs text-gray-600">Live command bar adapts to every turn so the flow feels guided, not static.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="voice-pill voice-pill-idle text-[11px] font-semibold">Step {pointer.stepId.replaceAll("_", " ")}</span>
            {busy && <span className="voice-pill voice-pill-live text-[11px] font-semibold animate-soft-shimmer bg-[length:180%_100%]">Syncing...</span>}
          </div>
        </div>
      </motion.div>

      <motion.div layout={!prefersReducedMotion} transition={SPRING_SOFT}>
        <AIOrb
          state={interactionState}
          intensity={orbIntensity}
          mutedMotion={Boolean(prefersReducedMotion)}
        />
      </motion.div>

      <motion.div layout={!prefersReducedMotion} transition={SPRING_SOFT}>
        <ConversationTranscript
          messages={messages}
          answers={answers}
          setAnswers={setAnswers}
          assessorId={assessorId}
          setAssessorId={setAssessorId}
        />
      </motion.div>

      <motion.div className="space-y-2" layout={!prefersReducedMotion} transition={SPRING_SOFT}>
        <label className="label">Answer by text</label>
        <div className="flex gap-2 items-center">
          <input
            value={typedAnswer}
            onChange={(e) => setTypedAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSubmitTyped();
              }
            }}
            className="input-field"
            placeholder="Type your answer and press Enter"
            disabled={!running || busy}
          />
          <button className="btn-blue w-auto px-4" onClick={() => void onSubmitTyped()} disabled={!running || busy || !typedAnswer.trim()}>
            Send
          </button>
        </div>
      </motion.div>

      <motion.div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3" layout={!prefersReducedMotion}>
        <div>
          <p className="text-xs font-semibold text-gray-700">Answer by voice</p>
          <p className="text-xs text-gray-500">
            Listening continuously while voice session is active. Use Pause above to stop.
          </p>
        </div>
        <VoiceInput
          placeholder="Voice session paused"
          sessionActive={running}
          suspended={busy}
          resetSignal={voiceResetSignal}
          onSessionError={(error) => {
            setMicError(error);
            addMessage("system_hint", error);
          }}
          onSpeechStart={handleSpeechStart}
          onListeningStateChange={setIsListening}
          onFinalTranscript={handleVoiceTranscript}
        />
      </motion.div>

      <motion.div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2" layout={!prefersReducedMotion}>
        <p className="text-xs text-gray-600">
          Voice status:{" "}
          <span className="font-semibold text-gray-800">
            {!running ? "Paused" : busy || isAssistantSpeaking ? "Assistant speaking..." : isListening ? "Recording..." : "Connecting mic..."}
          </span>
        </p>
      </motion.div>

      {process.env.NODE_ENV !== "production" && (
        <p className="sr-only" aria-hidden="true">
          Debug voice: {voiceDebug.lastUtterance} {voiceDebug.ts} dropped:{voiceDebug.dropped}
        </p>
      )}

      <AnimatePresence>
        {micError && (
          <motion.p className="text-xs text-red-600" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {micError}
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {busy && (
          <motion.p className="text-xs text-gray-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Processing answer...
          </motion.p>
        )}
      </AnimatePresence>

      {isVoiceIntroOpen && (
        <div className="modal-backdrop">
          <div className="modal-card max-w-md">
            <h3 className="text-base font-semibold text-gray-900">Start Voice Conversation</h3>
            <p className="mt-2 text-sm text-gray-600">
              Here is what will happen: the assistant asks one question at a time, you answer naturally, and the mic keeps listening
              automatically for a smooth interactive conversation.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              You can pause or end only from the top controls. If voice fails, you can always continue by typing.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn-outline !px-4 !py-2" onClick={() => setIsVoiceIntroOpen(false)}>
                Cancel
              </button>
              <button className="btn-blue !w-auto !px-4 !py-2" onClick={onConfirmVoiceIntro}>
                Start Voice Conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
