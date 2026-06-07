"use client";

import { useCallback } from "react";

import { RecordHandlers, useHoldToRecord } from "./useHoldToRecord";
import { useWhisper } from "./useWhisper";

export type VoicePhase =
  | "loading-model"
  | "ready"
  | "recording"
  | "transcribing"
  | "error";

export interface VoiceTranscription {
  phase: VoicePhase;
  loadProgress: number;
  transcript: string;
  errorMsg: string;
  recordHandlers: RecordHandlers;
  clearTranscript: () => void;
  retry: () => void;
}

/**
 * Composes model transcription (`useWhisper`) with microphone capture
 * (`useHoldToRecord`) into the single state machine the UI consumes.
 */
export function useVoiceTranscription(): VoiceTranscription {
  const whisper = useWhisper();
  const { transcribe } = whisper;

  const onRecorded = useCallback(
    (blob: Blob) => {
      void transcribe(blob);
    },
    [transcribe],
  );

  const recorder = useHoldToRecord({
    disabled: whisper.status !== "ready",
    onRecorded,
  });

  // Recording wins the phase; otherwise the model's status drives it.
  // A mic error is transient (clears on the next press), so it surfaces as a
  // message without latching the phase into "error".
  const phase: VoicePhase = recorder.isRecording ? "recording" : whisper.status;
  const errorMsg = whisper.errorMsg || recorder.errorMsg;

  return {
    phase,
    loadProgress: whisper.loadProgress,
    transcript: whisper.transcript,
    errorMsg,
    recordHandlers: recorder.recordHandlers,
    clearTranscript: whisper.clearTranscript,
    retry: whisper.retry,
  };
}
