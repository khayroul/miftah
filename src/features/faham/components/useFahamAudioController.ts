"use client";

/* eslint-disable react-hooks/immutability -- mutable media refs are intentionally owned by this controller */

import { useCallback, useEffect } from "react";
import type { FahamWorkspaceState } from "./useFahamWorkspaceState";

export function useFahamAudioController(state: FahamWorkspaceState) {
  const stopActiveAudio = useCallback(() => {
    const activeAudio = state.activeAudioRef.current;
    if (!activeAudio) return;
    activeAudio.pause();
    activeAudio.currentTime = 0;
    state.activeAudioRef.current = null;
  }, [state.activeAudioRef]);

  const playFeedbackSound = useCallback(
    (kind: "correct" | "incorrect" | "mastered" | "session_complete") => {
      if (!state.audioEnabled) return;
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const scheduleTone = (
        frequency: number,
        startAt: number,
        duration: number,
        type: OscillatorType,
        volume: number,
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(volume, startAt);
        gain.gain.exponentialRampToValueAtTime(0.01, startAt + duration);
        osc.start(startAt);
        osc.stop(startAt + duration);
      };
      if (kind === "session_complete") {
        scheduleTone(523.25, now, 0.24, "triangle", 0.18);
        scheduleTone(659.25, now + 0.12, 0.24, "triangle", 0.18);
        scheduleTone(783.99, now + 0.24, 0.28, "triangle", 0.18);
        scheduleTone(1046.5, now + 0.38, 0.42, "sine", 0.22);
        scheduleTone(1318.51, now + 0.52, 0.42, "sine", 0.18);
        return;
      }
      if (kind === "mastered") {
        scheduleTone(523.25, now, 0.18, "square", 0.1);
        scheduleTone(659.25, now + 0.1, 0.18, "square", 0.1);
        scheduleTone(783.99, now + 0.2, 0.18, "square", 0.1);
        scheduleTone(1046.5, now + 0.3, 0.32, "square", 0.1);
        return;
      }
      if (kind === "correct") {
        scheduleTone(523.25, now, 0.1, "sine", 0.2);
        scheduleTone(1046.5, now + 0.08, 0.28, "sine", 0.16);
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    },
    [state.audioEnabled],
  );

  const playWordAudio = useCallback(
    (params: {
      text: string;
      lang: "ar" | "ms";
      explicitUrl?: string | null;
      autoplayKey?: string;
    }) => {
      const { autoplayKey, explicitUrl, lang, text } = params;
      if (!state.audioEnabled || !text) return;
      if (
        autoplayKey &&
        state.lastAutoplayKeyRef.current === autoplayKey
      )
        return;
      const explicit = typeof explicitUrl === "string" ? explicitUrl.trim() : "";
      const url =
        explicit.length > 0
          ? explicit
          : lang === "ms"
            ? `/api/audio/tts?text=${encodeURIComponent(text)}&lang=ms&voice=male&v=2`
            : null;
      if (!url) return;
      stopActiveAudio();
      const audio = new Audio(url);
      state.activeAudioRef.current = audio;
      if (autoplayKey) state.lastAutoplayKeyRef.current = autoplayKey;
      const clear = () => {
        if (state.activeAudioRef.current === audio)
          state.activeAudioRef.current = null;
      };
      audio.addEventListener("ended", clear, { once: true });
      audio.addEventListener("error", clear, { once: true });
      audio.play().catch(clear);
    },
    [state.activeAudioRef, state.audioEnabled, state.lastAutoplayKeyRef, stopActiveAudio],
  );

  const handleToggleAudio = () => {
    state.setAudioEnabled((previous) => {
      const next = !previous;
      window.localStorage.setItem("miftah:faham:audio-enabled", next ? "1" : "0");
      return next;
    });
  };
  const handleManualAudio = (
    lang: "ar" | "ms",
    text: string,
    explicitUrl?: string | null,
  ) => playWordAudio({ explicitUrl, lang, text });

  useEffect(() => () => stopActiveAudio(), [stopActiveAudio]);
  useEffect(() => {
    if (!state.audioEnabled) stopActiveAudio();
  }, [state.audioEnabled, stopActiveAudio]);

  return {
    handleManualAudio,
    handleToggleAudio,
    playFeedbackSound,
    playWordAudio,
    stopActiveAudio,
  };
}

export type FahamAudioController = ReturnType<typeof useFahamAudioController>;
