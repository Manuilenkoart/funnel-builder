"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoicePhase =
  | "loading-model"
  | "ready"
  | "recording"
  | "transcribing"
  | "error";

const MIN_RECORDING_MS = 250;
const TARGET_SAMPLE_RATE = 16000;

type WorkerOutbound =
  | { type: "ready" }
  | { type: "transcript"; text: string }
  | { type: "error"; message: string }
  | { type: "model-progress"; data: unknown };

export interface VoiceTranscription {
  phase: VoicePhase;
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
  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const [phase, setPhase] = useState<VoicePhase>("loading-model");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const worker = new Worker(
      new URL("../../../../workers/whisper.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const onMessage = (event: MessageEvent<WorkerOutbound>) => {
      const data = event.data;
      if (data.type === "ready") setPhase("ready");
      if (data.type === "transcript") {
        setTranscript((prev) =>
          (prev ? `${prev} ${data.text}` : data.text).trim(),
        );
        setPhase("ready");
      }
      if (data.type === "error") {
        setErrorMsg(data.message);
        setPhase("error");
      }
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "warmup" });

    return () => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (phase !== "ready") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        workerRef.current?.postMessage({ type: "transcribe", audio });
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
