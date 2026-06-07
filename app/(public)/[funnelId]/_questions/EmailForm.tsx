"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { saveEmail } from "@/app/actions/tracking";
import { EMAIL_REGEX } from "@/app/lib/validation";
import { EmailQuestionConfig } from "@/app/types/funnel";

interface EmailFormProps {
  screen: EmailQuestionConfig;
  nextHref: string;
}

export default function EmailForm({ screen, nextHref }: EmailFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const placeholder = screen.componentProps.placeholder ?? "you@somewhere.com";
  const buttonText = screen.componentProps.buttonText ?? "Continue";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    setIsSubmitting(true);
    const result = await saveEmail(email);
    if (!result.ok) {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
      return;
    }
    router.push(nextHref);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <label
        onClick={() => inputRef.current?.focus()}
        className="block transition"
        style={{
          position: "relative",
          background: focused
            ? "rgba(255,255,255,0.22)"
            : "rgba(255,255,255,0.14)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          border: `0.5px solid ${focused ? "rgba(255,255,255,0.55)" : "var(--lg-glass-border)"}`,
          borderRadius: "var(--lg-radius)",
          padding: "14px 18px",
          boxShadow:
            "inset 0 0.5px 0 rgba(255,255,255,0.55), inset 0 -0.5px 0 rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.10)",
        }}
      >
        <div
          className="mb-0.5 text-[11px] font-medium uppercase"
          style={{ color: "var(--lg-muted)", letterSpacing: 0.5 }}
        >
          Email
        </div>
        <input
          ref={inputRef}
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full border-0 bg-transparent p-0 text-[17px] text-white outline-none placeholder:text-white/40"
          style={{ letterSpacing: -0.2 }}
        />
      </label>

      {error ? (
        <p className="mt-2 text-sm font-medium" style={{ color: "#ff8a8a" }}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="glass-button-primary glass-gloss mt-4 cursor-pointer rounded-full"
        style={{
          padding: "18px",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: -0.1,
        }}
      >
        {isSubmitting ? "Saving…" : buttonText}
      </button>

      <p
        className="mt-4 text-center text-xs"
        style={{
          color: "var(--lg-muted)",
          lineHeight: 1.4,
          textWrap: "pretty",
        }}
      >
        We&apos;ll never share your email. Privacy&nbsp;&amp;&nbsp;Terms.
      </p>
    </form>
  );
}
