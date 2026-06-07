"use client";

import type {
  ProgressData,
  WhisperEvent,
  WorkerInbound,
  WorkerOutbound,
} from "@/app/lib/whisper/messages";

let worker: Worker | null = null;
let ready = false;
let lastPercent = 0;
const fileProgress = new Map<string, { loaded: number; total: number }>();
const listeners = new Set<(event: WhisperEvent) => void>();

function emit(event: WhisperEvent) {
  listeners.forEach((fn) => fn(event));
}

function handleProgress(data: ProgressData) {
  if (!data?.file) return;

  if (data.status === "initiate") {
    fileProgress.set(data.file, { loaded: 0, total: 0 });
  } else if (data.status === "progress") {
    fileProgress.set(data.file, {
      loaded: data.loaded ?? 0,
      total: data.total ?? 0,
    });
  } else if (data.status === "done") {
    const prev = fileProgress.get(data.file);
    if (prev && prev.total > 0) {
      fileProgress.set(data.file, { loaded: prev.total, total: prev.total });
    }
  }

  let loaded = 0;
  let total = 0;
  for (const entry of fileProgress.values()) {
    loaded += entry.loaded;
    total += entry.total;
  }
  const percent =
    total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  if (percent !== lastPercent) {
    lastPercent = percent;
    emit({ type: "progress", percent });
  }
}

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (worker) return worker;

  worker = new Worker(
    new URL("../../../../workers/whisper.worker.ts", import.meta.url),
    { type: "module" },
  );

  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const data = event.data;
    switch (data.type) {
      case "ready":
        ready = true;
        emit({ type: "ready" });
        break;
      case "transcript":
        emit({ type: "transcript", text: data.text });
        break;
      case "error":
        emit({ type: "error", message: data.message });
        break;
      case "model-progress":
        handleProgress(data.data);
        break;
    }
  });

  warmup();
  return worker;
}

function warmup() {
  const message: WorkerInbound = { type: "warmup" };
  worker?.postMessage(message);
}

export function preloadWhisper(): void {
  getWorker();
}

export function sendToWhisper(
  message: Extract<WorkerInbound, { type: "transcribe" }>,
): void {
  getWorker()?.postMessage(message);
}

export function subscribeWhisper(
  fn: (event: WhisperEvent) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isWhisperReady(): boolean {
  return ready;
}

export function getCurrentProgress(): number {
  return lastPercent;
}

// Re-warm after a failure. If the model already loaded, the worker resolves
// immediately; if its load was reset by an earlier failure, it retries.
export function retryWhisper(): void {
  ready = false;
  lastPercent = 0;
  fileProgress.clear();
  getWorker();
  warmup();
}

// Tear the worker down and clear all module state. Primarily for tests and
// teardown — production keeps the singleton alive across funnel navigation.
export function resetWhisper(): void {
  worker?.terminate();
  worker = null;
  ready = false;
  lastPercent = 0;
  fileProgress.clear();
  listeners.clear();
}
