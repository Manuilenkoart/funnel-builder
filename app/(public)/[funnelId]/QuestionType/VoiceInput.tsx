"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { VoiceQuestionConfig } from "@/app/types/funnel";

interface VoiceInputProps {
  screen: VoiceQuestionConfig;
  nextHref: string;
}

type Phase =
  | "loading-model"
  | "ready"
  | "recording"
  | "transcribing"
  | "error";

const MIN_RECORDING_MS = 250;

export default function VoiceInput({ screen, nextHref }: VoiceInputProps) {
  const router = useRouter();

  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("loading-model");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const worker = new Worker(
      new URL("../../../workers/whisper.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.addEventListener("message", (event) => {
      const data = event.data;
      if (data.type === "ready") setPhase("ready");
      if (data.type === "transcript") {
        setTranscript((prev) => (prev ? `${prev} ${data.text}` : data.text).trim());
        setPhase("ready");
      }
      if (data.type === "error") {
        setErrorMsg(data.message);
        setPhase("error");
      }
    });

    worker.postMessage({ type: "warmup" });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

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
        const arrayBuffer = await blob.arrayBuffer();
        const ctx = new AudioContext({ sampleRate: 16000 });
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        await ctx.close();

        workerRef.current?.postMessage({
          type: "transcribe",
          audio: decoded.getChannelData(0),
        });
      };

      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Microphone error");
      setPhase("error");
    }
  }, [phase]);

  const handleContinue = () => {
    router.push(nextHref);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    void startRecording();
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    void stopRecording();
  };

  const isRecording = phase === "recording";
  const isBusy = phase === "loading-model" || phase === "transcribing";

  const buttonLabel = (() => {
    if (phase === "loading-model") return "Loading model…";
    if (phase === "recording") return "Listening… release to stop";
    if (phase === "transcribing") return "Transcribing…";
    if (phase === "error") return "Try again";
    return screen.componentProps.recordButtonText;
  })();

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
        disabled={isBusy}
        aria-label={buttonLabel}
        aria-pressed={isRecording}
        className="glass-gloss flex items-center justify-center gap-3 text-white transition active:scale-[0.985] disabled:opacity-60"
        style={{
          padding: "18px 22px",
          background: isRecording
            ? "rgba(255,80,80,0.35)"
            : "var(--lg-glass-bg)",
          border: `${isRecording ? 1.5 : 0.5}px solid ${
            isRecording ? "rgba(255,160,160,0.85)" : "var(--lg-glass-border)"
          }`,
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          boxShadow:
            "inset 0 0.5px 0 rgba(255,255,255,0.55), inset 0 -0.5px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.10)",
          borderRadius: "var(--lg-radius)",
          fontSize: 17,
          fontWeight: 500,
          letterSpacing: -0.2,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 11a7 7 0 0 0 14 0M12 18v3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{buttonLabel}</span>
      </button>

      <div
        aria-live="polite"
        className="text-white"
        style={{
          minHeight: 120,
          padding: "16px 18px",
          background: "rgba(255,255,255,0.10)",
          border: "0.5px solid var(--lg-glass-border)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          borderRadius: "var(--lg-radius)",
          fontSize: 16,
          lineHeight: 1.5,
          letterSpacing: -0.1,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
          whiteSpace: "pre-wrap",
        }}
      >
        {transcript ? (
          <span>{transcript}</span>
        ) : phase === "transcribing" ? (
          <span className="text-white/65">Transcribing…</span>
        ) : phase === "recording" ? (
          <span className="text-white/65">Listening…</span>
        ) : phase === "loading-model" ? (
          <span className="text-white/65">Loading model…</span>
        ) : (
          <span className="text-white/55">Your words will appear here…</span>
        )}
      </div>

      {phase === "error" && errorMsg ? (
        <p className="px-1 text-sm text-red-300/90">{errorMsg}</p>
      ) : null}

      {transcript ? (
        <button
          type="button"
          onClick={() => setTranscript("")}
          className="self-start text-sm text-white/70 underline-offset-2 hover:underline"
        >
          Clear
        </button>
      ) : null}

      <button
        type="button"
        onClick={handleContinue}
        className="glass-gloss text-white transition active:scale-[0.985]"
        style={{
          padding: "18px 22px",
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.55)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          borderRadius: "var(--lg-radius)",
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: -0.2,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
        }}
      >
        {screen.componentProps.continueButtonText}
      </button>
    </div>
  );
}
