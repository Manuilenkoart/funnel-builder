"use client";

import { useCallback, useRef, useState } from "react";

import { WHISPER_SAMPLE_RATE } from "@/app/lib/whisper/model";

const MIN_RECORDING_MS = 250;

export interface RecordHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
}

export interface HoldToRecord {
  isRecording: boolean;
  errorMsg: string;
  recordHandlers: RecordHandlers;
}

interface Options {
  /** When true, pointer presses are ignored (e.g. model not ready). */
  disabled: boolean;
  /** Called with the captured audio once recording stops. */
  onRecorded: (blob: Blob) => void;
}

/** Press-and-hold microphone capture. Emits a Blob; knows nothing of Whisper. */
export function useHoldToRecord({
  disabled,
  onRecorded,
}: Options): HoldToRecord {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const startRecording = useCallback(async () => {
    if (disabled || isRecording) return;
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: WHISPER_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size > 0) onRecorded(blob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Microphone error");
      setIsRecording(false);
    }
  }, [disabled, isRecording, onRecorded]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed < MIN_RECORDING_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_RECORDING_MS - elapsed),
      );
    }
    recorder.stop();
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      void startRecording();
    },
    [startRecording],
  );

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      void stopRecording();
    },
    [stopRecording],
  );

  return {
    isRecording,
    errorMsg,
    recordHandlers: {
      onPointerDown,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
    },
  };
}
