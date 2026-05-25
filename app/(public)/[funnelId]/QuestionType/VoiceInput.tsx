"use client";

import { useRouter } from "next/navigation";

import { VoiceQuestionConfig } from "@/app/types/funnel";

interface VoiceInputProps {
  screen: VoiceQuestionConfig;
  nextHref: string;
}

export default function VoiceInput({ screen, nextHref }: VoiceInputProps) {
  const router = useRouter();

  const handleRecord = () => {
    // TODO: integrate Whisper + Transformers.js speech-to-text
  };

  const handleContinue = () => {
    router.push(nextHref);
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={handleRecord}
        aria-label={screen.componentProps.recordButtonText}
        className="glass-gloss flex items-center justify-center gap-3 text-white transition active:scale-[0.985]"
        style={{
          padding: "18px 22px",
          background: "var(--lg-glass-bg)",
          border: "0.5px solid var(--lg-glass-border)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          boxShadow:
            "inset 0 0.5px 0 rgba(255,255,255,0.55), inset 0 -0.5px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.10)",
          borderRadius: "var(--lg-radius)",
          fontSize: 17,
          fontWeight: 500,
          letterSpacing: -0.2,
          textShadow: "0 1px 2px rgba(0,0,0,0.14)",
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
        <span>{screen.componentProps.recordButtonText}</span>
      </button>

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
