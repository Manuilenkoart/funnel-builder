"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmailQuestionConfig } from "@/app/types/funnel";

interface EmailFormProps {
  screen: EmailQuestionConfig;
  nextHref: string;
}

export default function EmailForm({ screen, nextHref }: EmailFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const subtitle = screen.componentProps?.subtitle ?? "";
  const placeholder = screen.componentProps?.placeholder ?? "name@example.com";
  const buttonText = screen.componentProps?.buttonText ?? "Continue";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    router.push(nextHref);
  };

  return (
    <>
      {subtitle && <p className="mt-2 text-sm text-slate-300">{subtitle}</p>}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="sr-only">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            placeholder={placeholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 focus:border-indigo-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200 text-base font-medium placeholder-slate-400"
          />
          {error && (
            <p className="mt-2 text-sm text-rose-400 font-medium">{error}</p>
          )}
        </div>
        <button
          type="submit"
          className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-base font-semibold tracking-wide transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/20 active:translate-y-0.5"
        >
          {buttonText}
        </button>
      </form>
    </>
  );
}
