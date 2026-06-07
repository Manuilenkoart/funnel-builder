"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { RowListQuestionConfig } from "@/app/types/funnel";

interface RowListProps {
  screen: RowListQuestionConfig;
  nextHref: string;
}

export default function RowList({ screen, nextHref }: RowListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (text: string) => {
    if (selected) return;
    setSelected(text);
    setTimeout(() => router.push(nextHref), 240);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {screen.componentProps.list.map((option) => {
        const isSelected = selected === option.text;
        return (
          <button
            key={option.text}
            type="button"
            onClick={() => handleSelect(option.text)}
            className="glass-gloss relative flex items-center justify-between overflow-hidden text-left text-white transition active:scale-[0.985]"
            style={{
              padding: "18px 22px",
              background: isSelected
                ? "rgba(255,255,255,0.30)"
                : "var(--lg-glass-bg)",
              border: `${isSelected ? 1.5 : 0.5}px solid ${
                isSelected ? "rgba(255,255,255,0.75)" : "var(--lg-glass-border)"
              }`,
              backdropFilter: "blur(22px) saturate(180%)",
              WebkitBackdropFilter: "blur(22px) saturate(180%)",
              boxShadow:
                "inset 0 0.5px 0 rgba(255,255,255,0.55), inset 0 -0.5px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.10)",
              borderRadius: "var(--lg-radius)",
              fontSize: 17,
              fontWeight: isSelected ? 600 : 500,
              letterSpacing: -0.2,
              textShadow: "0 1px 2px rgba(0,0,0,0.14)",
              transform: isSelected ? "scale(0.985)" : undefined,
            }}
          >
            <span>{option.text}</span>
            <span
              className="flex size-[22px] items-center justify-center rounded-full transition"
              style={{
                border: `1.5px solid ${
                  isSelected ? "#fff" : "rgba(255,255,255,0.45)"
                }`,
                background: isSelected ? "#fff" : "transparent",
              }}
            >
              {isSelected ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.3l2.4 2.4 4.6-4.8"
                    stroke="var(--lg-accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
