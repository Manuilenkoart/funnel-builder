"use client";

import { useRouter } from "next/navigation";

import { VoiceQuestionConfig } from "@/app/types/funnel";

import { useVoiceTranscription, VoicePhase } from "./useVoiceTranscription";

interface VoiceInputProps {
  screen: VoiceQuestionConfig;
  nextHref: string;
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getMicLabel(phase: VoicePhase, defaultLabel: string): string {
  switch (phase) {
    case "loading-model":
      return "Loading model…";
    case "recording":
      return "Listening… release to stop";
    case "transcribing":
      return "Transcribing…";
    case "error":
      return "Try again";
    default:
      return defaultLabel;
  }
}

function TranscriptPlaceholder({ phase }: { phase: VoicePhase }) {
  if (phase === "transcribing")
    return <span className="text-white/65">Transcribing…</span>;
  if (phase === "recording")
    return <span className="text-white/65">Listening…</span>;
  if (phase === "loading-model")
    return <span className="text-white/65">Loading model…</span>;
  return <span className="text-white/55">Your words will appear here…</span>;
}

export default function VoiceInput({ screen, nextHref }: VoiceInputProps) {
  const router = useRouter();
  const { phase, transcript, errorMsg, recordHandlers, clearTranscript } =
    useVoiceTranscription();

  const isRecording = phase === "recording";
  const isBusy = phase === "loading-model" || phase === "transcribing";
  const micLabel = getMicLabel(phase, screen.componentProps.recordButtonText);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        {...recordHandlers}
        onContextMenu={(e) => e.preventDefault()}
        disabled={isBusy}
        aria-label={micLabel}
        aria-pressed={isRecording}
        className="glass-gloss flex items-center justify-center gap-3 text-white transition active:scale-[0.985] disabled:opacity-60"
        style={{
          padding: "18px 22px",
          background: isRecording
            ? "rgba(255,80,80,0.35)"
            : "var(--lg-glass-bg)",
          border: `${isRecording ? 1.5 : 0.5}px solid ${
            isRecording ? "rgba(255,160,160,0.85)" : "var(--lg-glass-border)"
          }`,
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          boxShadow:
            "inset 0 0.5px 0 rgba(255,255,255,0.55), inset 0 -0.5px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.10)",
          borderRadius: "var(--lg-radius)",
          fontSize: 17,
          fontWeight: 500,
          letterSpacing: -0.2,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <MicIcon />
        <span>{micLabel}</span>
      </button>

      <div
        aria-live="polite"
        className="text-white"
        style={{
          minHeight: 120,
          padding: "16px 18px",
          background: "rgba(255,255,255,0.10)",
          border: "0.5px solid var(--lg-glass-border)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          borderRadius: "var(--lg-radius)",
          fontSize: 16,
          lineHeight: 1.5,
          letterSpacing: -0.1,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
          whiteSpace: "pre-wrap",
        }}
      >
        {transcript ? (
          <span>{transcript}</span>
        ) : (
          <TranscriptPlaceholder phase={phase} />
        )}
      </div>

      {phase === "error" && errorMsg ? (
        <p className="px-1 text-sm text-red-300/90">{errorMsg}</p>
      ) : null}

      {transcript ? (
        <button
          type="button"
          onClick={clearTranscript}
          className="self-start text-sm text-white/70 underline-offset-2 hover:underline"
        >
          Clear
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => router.push(nextHref)}
        className="glass-gloss text-white transition active:scale-[0.985]"
        style={{
          padding: "18px 22px",
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.55)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          borderRadius: "var(--lg-radius)",
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: -0.2,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
        }}
      >
        {screen.componentProps.continueButtonText}
      </button>
    </div>
  );
}
