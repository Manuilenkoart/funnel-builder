"use client";

import { useCallback, useEffect, useState } from "react";

import { WHISPER_SAMPLE_RATE } from "@/app/lib/whisper/model";

import {
  getCurrentProgress,
  isWhisperReady,
  preloadWhisper,
  retryWhisper,
  sendToWhisper,
  subscribeWhisper,
} from "./whisperClient";

export type WhisperStatus =
  | "loading-model"
  | "ready"
  | "transcribing"
  | "error";

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();

  // Decode at the browser's native rate. Safari ignores a requested
  // AudioContext sampleRate, so we never rely on it — we resample below.
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close();
  }

  if (
    decoded.sampleRate === WHISPER_SAMPLE_RATE &&
    decoded.numberOfChannels === 1
  ) {
    return decoded.getChannelData(0);
  }

  // Down-mix to mono and resample to 16 kHz — the rate Whisper expects.
  const frames = Math.max(
    1,
    Math.round(decoded.duration * WHISPER_SAMPLE_RATE),
  );
  const offline = new OfflineAudioContext(1, frames, WHISPER_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export interface Whisper {
  status: WhisperStatus;
  loadProgress: number;
  transcript: string;
  errorMsg: string;
  transcribe: (blob: Blob) => Promise<void>;
  clearTranscript: () => void;
  retry: () => void;
}

/** Bridges the shared Whisper worker singleton to React state. */
export function useWhisper(): Whisper {
  const [status, setStatus] = useState<WhisperStatus>(() =>
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
          setStatus((prev) => (prev === "loading-model" ? "ready" : prev));
          setLoadProgress(100);
          break;
        case "progress":
          setLoadProgress(event.percent);
          break;
        case "transcript":
          setTranscript((prev) =>
            (prev ? `${prev} ${event.text}` : event.text).trim(),
          );
          setStatus("ready");
          break;
        case "error":
          setErrorMsg(event.message);
          setStatus("error");
          break;
      }
    });

    preloadWhisper();

    return unsubscribe;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setStatus("transcribing");
    try {
      const audio = await decodeToMono16k(blob);
      sendToWhisper({ type: "transcribe", audio });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Audio decode failed");
      setStatus("error");
    }
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  const retry = useCallback(() => {
    setErrorMsg("");
    // A failed transcription leaves the model loaded — recover instantly.
    if (isWhisperReady()) {
      setStatus("ready");
      return;
    }
    // A failed model load needs a fresh warmup.
    setStatus("loading-model");
    setLoadProgress(getCurrentProgress());
    retryWhisper();
  }, []);

  return {
    status,
    loadProgress,
    transcript,
    errorMsg,
    transcribe,
    clearTranscript,
    retry,
  };
}
