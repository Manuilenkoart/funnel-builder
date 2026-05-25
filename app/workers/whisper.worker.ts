/// <reference lib="webworker" />

import {
  AutomaticSpeechRecognitionPipeline,
  pipeline,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny.en";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null =
  null;

function getTranscriber() {
  transcriberPromise ??= pipeline("automatic-speech-recognition", MODEL_ID, {
    dtype: "fp32",
    progress_callback: (data: unknown) => {
      self.postMessage({ type: "model-progress", data });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  return transcriberPromise;
}

type InboundMessage =
  | { type: "warmup" }
  | { type: "transcribe"; audio: Float32Array };

self.addEventListener("message", async (event: MessageEvent<InboundMessage>) => {
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
