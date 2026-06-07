// Single source of truth for the on-device Whisper model.
// Imported by both the worker (which loads the model) and the client
// (which labels saved transcripts), so the two can never drift apart.

export const WHISPER_MODEL_ID = "onnx-community/whisper-tiny.en";
export const WHISPER_DTYPE = "bnb4" as const;

// Human-readable label persisted alongside saved transcripts.
export const WHISPER_MODEL_LABEL = "whisper-tiny.en-bnb4";

// Sample rate Whisper expects; used both for the mic constraint and resampling.
export const WHISPER_SAMPLE_RATE = 16000;
