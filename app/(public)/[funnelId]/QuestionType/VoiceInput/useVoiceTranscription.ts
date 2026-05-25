"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getCurrentProgress,
  isWhisperReady,
  preloadWhisper,
  sendToWhisper,
  subscribeWhisper,
} from "./whisperClient";

export type VoicePhase =
  | "loading-model"
  | "ready"
  | "recording"
  | "transcribing"
  | "error";

const MIN_RECORDING_MS = 250;
const TARGET_SAMPLE_RATE = 16000;

export interface VoiceTranscription {
  phase: VoicePhase;
  loadProgress: number;
  transcript: string;
  errorMsg: string;
  recordHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
  };
  clearTranscript: () => void;
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    return decoded.getChannelData(0);
  } finally {
    await ctx.close();
  }
}

export function useVoiceTranscription(): VoiceTranscription {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const [phase, setPhase] = useState<VoicePhase>(() =>
    isWhisperReady() ? "ready" : "loading-model",
  );
  const [loadProgress, setLoadProgress] = useState<number>(() =>
    getCurrentProgress(),
  );
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeWhisper((event) => {
      switch (event.type) {
        case "ready":
          setPhase((prev) => (prev === "loading-model" ? "ready" : prev));
          setLoadProgress(100);
          break;
        case "progress":
          setLoadProgress(event.percent);
          break;
        case "transcript":
          setTranscript((prev) =>
            (prev ? `${prev} ${event.text}` : event.text).trim(),
          );
          setPhase("ready");
          break;
        case "error":
          setErrorMsg(event.message);
          setPhase("error");
          break;
      }
    });

    preloadWhisper();

    return unsubscribe;
  }, []);

  const startRecording = useCallback(async () => {
    if (phase !== "ready") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: TARGET_SAMPLE_RATE,
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

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("transcribing");

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          setPhase("ready");
          return;
        }
        const audio = await decodeToMono16k(blob);
        sendToWhisper({ type: "transcribe", audio });
      };

      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Microphone error");
      setPhase("error");
    }
  }, [phase]);

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

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return {
    phase,
    loadProgress,
    transcript,
    errorMsg,
    recordHandlers: {
      onPointerDown,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerLeave: onPointerEnd,
    },
    clearTranscript,
  };
}
