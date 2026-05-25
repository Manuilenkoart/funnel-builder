"use client";

export type WhisperEvent =
  | { type: "ready" }
  | { type: "transcript"; text: string }
  | { type: "error"; message: string }
  | { type: "progress"; percent: number };

type ProgressData = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

type WorkerOutbound =
  | { type: "ready" }
  | { type: "transcript"; text: string }
  | { type: "error"; message: string }
  | { type: "model-progress"; data: ProgressData };

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

  worker.postMessage({ type: "warmup" });
  return worker;
}

export function preloadWhisper(): void {
  getWorker();
}

export function sendToWhisper(message: { type: "transcribe"; audio: Float32Array }): void {
  getWorker()?.postMessage(message);
}

export function subscribeWhisper(fn: (event: WhisperEvent) => void): () => void {
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
