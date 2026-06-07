"use client";

import { useEffect } from "react";

import { preloadWhisper } from "./whisperClient";

export default function VoicePreloader() {
  useEffect(() => {
    preloadWhisper();
  }, []);
  return null;
}
