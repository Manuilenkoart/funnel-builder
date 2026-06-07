// Message contracts shared between the Whisper worker and its client.
//
// The three variants below are emitted verbatim by the worker and surfaced
// verbatim to React, so they're defined once and reused by both the wire
// protocol (`WorkerOutbound`) and the app-level event stream (`WhisperEvent`).
// The variants that genuinely differ stay separate: the worker reports raw
// per-file download progress, while the client surfaces an aggregated percent.

type ReadyMessage = { type: "ready" };
type TranscriptMessage = { type: "transcript"; text: string };
type ErrorMessage = { type: "error"; message: string };

export type ProgressData = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

// Messages the worker receives.
export type WorkerInbound =
  | { type: "warmup" }
  | { type: "transcribe"; audio: Float32Array };

// Messages the worker posts (raw wire protocol).
export type WorkerOutbound =
  | ReadyMessage
  | TranscriptMessage
  | ErrorMessage
  | { type: "model-progress"; data: ProgressData };

// Events the client surfaces to React (progress is aggregated to a percent).
export type WhisperEvent =
  | ReadyMessage
  | TranscriptMessage
  | ErrorMessage
  | { type: "progress"; percent: number };
