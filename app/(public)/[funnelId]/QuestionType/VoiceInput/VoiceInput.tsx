"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { saveVoiceTranscript } from "@/app/actions/transcripts";
import { VoiceQuestionConfig } from "@/app/types/funnel";

import { useVoiceTranscription, VoicePhase } from "./useVoiceTranscription";
import { WHISPER_MODEL_LABEL } from "./whisperClient";

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

function getMicLabel(
  phase: VoicePhase,
  defaultLabel: string,
  loadProgress: number,
): string {
  switch (phase) {
    case "loading-model":
      return loadProgress > 0
        ? `Loading model… ${loadProgress}%`
        : "Loading model…";
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

function TranscriptPlaceholder({
  phase,
  loadProgress,
}: {
  phase: VoicePhase;
  loadProgress: number;
}) {
  if (phase === "transcribing")
    return <span className="text-white/65">Transcribing…</span>;
  if (phase === "recording")
    return <span className="text-white/65">Listening…</span>;
  if (phase === "loading-model")
    return (
      <span className="text-white/65">
        {loadProgress > 0
          ? `Loading model… ${loadProgress}%`
          : "Loading model…"}
      </span>
    );
  return <span className="text-white/55">Your words will appear here…</span>;
}

export default function VoiceInput({ screen, nextHref }: VoiceInputProps) {
  const router = useRouter();
  const params = useParams<{ funnelId: string; screenIndex: string }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const {
    phase,
    loadProgress,
    transcript,
    errorMsg,
    recordHandlers,
    clearTranscript,
  } = useVoiceTranscription();

  const isRecording = phase === "recording";
  const isBusy = phase === "loading-model" || phase === "transcribing";
  const micLabel = getMicLabel(
    phase,
    screen.componentProps.recordButtonText,
    loadProgress,
  );

  const handleContinue = async () => {
    setSaveError("");

    if (!transcript.trim()) {
      router.push(nextHref);
      return;
    }

    setSaving(true);
    const result = await saveVoiceTranscript({
      funnelId: params.funnelId,
      questionId: params.screenIndex,
      text: transcript,
      model: WHISPER_MODEL_LABEL,
    });
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error ?? "Failed to save");
      return;
    }
    router.push(nextHref);
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        {...recordHandlers}
        onContextMenu={(e) => e.preventDefault()}
        disabled={isBusy}
        aria-label={micLabel}
        aria-pressed={isRecording}
        className={`glass-gloss voice-mic${isRecording ? " recording" : ""}`}
      >
        <MicIcon />
        <span>{micLabel}</span>
      </button>

      <div aria-live="polite" className="voice-transcript">
        {transcript ? (
          <span>{transcript}</span>
        ) : (
          <TranscriptPlaceholder phase={phase} loadProgress={loadProgress} />
        )}
      </div>

      {phase === "error" && errorMsg ? (
        <p className="px-1 text-sm text-red-300/90">{errorMsg}</p>
      ) : null}

      {saveError ? (
        <p className="px-1 text-sm text-red-300/90">{saveError}</p>
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
        onClick={handleContinue}
        disabled={saving}
        className="glass-gloss voice-continue"
      >
        {saving ? "Saving…" : screen.componentProps.continueButtonText}
      </button>
    </div>
  );
}
