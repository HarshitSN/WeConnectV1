"use client";

import type { ReactNode } from "react";
import { Pause, Play, Repeat2, SkipForward, Undo2, Pencil } from "lucide-react";

interface Props {
  running: boolean;
  onStartPause: () => void;
  onRepeat: () => void;
  onSkip: () => void;
  onGoBack: () => void;
  onEditLast: () => void;
}

function ControlButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon}
      {label}
    </button>
  );
}

export default function VoiceAgentControls({
  running,
  onStartPause,
  onRepeat,
  onSkip,
  onGoBack,
  onEditLast,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <ControlButton
        label={running ? "Pause" : "Start Voice"}
        onClick={onStartPause}
        icon={running ? <Pause size={14} /> : <Play size={14} />}
      />
      <ControlButton label="Repeat" onClick={onRepeat} icon={<Repeat2 size={14} />} />
      <ControlButton label="Skip" onClick={onSkip} icon={<SkipForward size={14} />} />
      <ControlButton label="Go Back" onClick={onGoBack} icon={<Undo2 size={14} />} />
      <ControlButton label="Edit Last" onClick={onEditLast} icon={<Pencil size={14} />} />
    </div>
  );
}
