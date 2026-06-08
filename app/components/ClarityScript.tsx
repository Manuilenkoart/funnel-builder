"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    clarity?: (
      action: string,
      ...args: (string | Record<string, string>)[]
    ) => void;
  }
}

export interface ClarityUserData {
  userId?: string;
  sessionId?: string;
  customData?: Record<string, string>;
}

export function ClarityScript({
  userData,
}: { userData?: ClarityUserData } = {}) {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

    if (!projectId) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "Microsoft Clarity project ID is not set. Set NEXT_PUBLIC_CLARITY_PROJECT_ID environment variable.",
        );
      }
      return;
    }

    // Initialize Clarity
    (function (c: Window, l: Document, a: string, r: string, i: string) {
      (c as Record<string, unknown>)[a] =
        ((c as Record<string, unknown>)[a] as unknown) ||
        function (...args: unknown[]) {
          const fn = (c as Record<string, unknown>)[a] as Record<
            string,
            unknown
          >;
          const q = (fn.q as unknown[]) || [];
          q.push(...args);
          fn.q = q;
        };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = "https://www.clarity.ms/tag/" + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
    })(window, document, "clarity", "script", projectId);

    // Set user identification if provided
    if (userData?.userId && typeof window.clarity === "function") {
      window.clarity("identify", userData.userId);
    }

    // Set custom properties if provided
    if (userData?.customData && typeof window.clarity === "function") {
      window.clarity("set", userData.customData);
    }
  }, [userData]);

  return null;
}
