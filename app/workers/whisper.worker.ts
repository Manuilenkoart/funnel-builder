/// <reference lib="webworker" />

import {
  AutomaticSpeechRecognitionPipeline,
  pipeline,
} from "@huggingface/transformers";

import type { WorkerInbound } from "../lib/whisper/messages";
import { WHISPER_DTYPE, WHISPER_MODEL_ID } from "../lib/whisper/model";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null =
  null;

async function loadTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  try {
    return (await pipeline("automatic-speech-recognition", WHISPER_MODEL_ID, {
      dtype: WHISPER_DTYPE,
      progress_callback: (data: unknown) => {
        self.postMessage({ type: "model-progress", data });
      },
    })) as AutomaticSpeechRecognitionPipeline;
  } catch (err) {
    // Reset so a later warmup can retry the load instead of forever
    // replaying this rejection from a memoized promise.
    transcriberPromise = null;
    throw err;
  }
}

function getTranscriber() {
  transcriberPromise ??= loadTranscriber();
  return transcriberPromise;
}

self.addEventListener("message", async (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;

  try {
    if (msg.type === "warmup") {
      await getTranscriber();
      self.postMessage({ type: "ready" });
      return;
    }

    if (msg.type === "transcribe") {
      const transcriber = await getTranscriber();
      const output = await transcriber(msg.audio);
      const text = Array.isArray(output)
        ? output.map((o) => o.text).join(" ")
        : output.text;
      self.postMessage({ type: "transcript", text });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
