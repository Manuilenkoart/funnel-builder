"use client";

import { useEffect } from "react";

export function ClarityFunnelContext({ funnelId }: { funnelId: string }) {
  useEffect(() => {
    if (typeof window.clarity === "function") {
      window.clarity("set", { funnelId });
    }
  }, [funnelId]);

  return null;
}
