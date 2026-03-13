"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
import { trackReadAudioTelemetry } from "@/lib/readAudioTelemetry";

const ReadAudioDock = dynamic(
  () =>
    import("@/components/ReadAudioDock").then(
      (module) => module.ReadAudioDock,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

interface ReadAudioContextValue {
  activePlaybackAyahKey: string | null;
  feedbackHidden: boolean;
  feedbackOffsetPx: number;
  isAudioPanelOpen: boolean;
  isAudioVisible: boolean;
  pauseAudioPlayback: () => void;
  requestAudioAutoplay: () => void;
  restartAudioPlayback: () => void;
  setPlayableAyahKeys: (ayahKeys: string[] | null) => void;
  setAudioVisible: (next: boolean) => void;
  syncAudioTracks: (pageNumber: number, tracks: ReadAudioTrack[]) => void;
  toggleAudioVisibility: () => void;
}

const ReadAudioContext = createContext<ReadAudioContextValue | null>(null);

export function ReadAudioProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<ReadAudioTrack[]>([]);
  const [isAudioVisible, setIsAudioVisible] = useState(false);
  const [isAudioPanelOpen, setIsAudioPanelOpen] = useState(false);
  const [activePlaybackAyahKey, setActivePlaybackAyahKey] = useState<string | null>(
    null,
  );
  const [autoplayRequestKey, setAutoplayRequestKey] = useState(0);
  const [pauseRequestKey, setPauseRequestKey] = useState(0);
  const [restartRequestKey, setRestartRequestKey] = useState(0);
  const [playableAyahKeys, setPlayableAyahKeysState] = useState<string[] | null>(
    null,
  );

  const setPlayableAyahKeys = useCallback((ayahKeys: string[] | null) => {
    if (!ayahKeys || ayahKeys.length === 0) {
      setPlayableAyahKeysState(null);
      return;
    }
    setPlayableAyahKeysState(Array.from(new Set(ayahKeys)));
  }, []);

  const syncAudioTracks = useCallback(
    (_pageNumber: number, nextTracks: ReadAudioTrack[]) => {
      setTracks(nextTracks);
    },
    [],
  );

  const setAudioVisible = useCallback((next: boolean) => {
    if (!next) {
      trackReadAudioTelemetry("read_audio_drop_off", {
        source: "provider_set_visible",
        panelOpen: isAudioPanelOpen,
      });
    }
    setIsAudioVisible(next);
    if (!next) {
      setIsAudioPanelOpen(false);
    }
  }, [isAudioPanelOpen]);

  const toggleAudioVisibility = useCallback(() => {
    setIsAudioVisible((previous) => {
      const next = !previous;
      if (!next) {
        trackReadAudioTelemetry("read_audio_drop_off", {
          source: "provider_toggle",
          panelOpen: isAudioPanelOpen,
        });
        setIsAudioPanelOpen(false);
      }
      return next;
    });
  }, [isAudioPanelOpen]);

  const requestAudioAutoplay = useCallback(() => {
    setAutoplayRequestKey((current) => current + 1);
  }, []);

  const pauseAudioPlayback = useCallback(() => {
    setPauseRequestKey((current) => current + 1);
  }, []);

  const restartAudioPlayback = useCallback(() => {
    setRestartRequestKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!isAudioVisible || tracks.length === 0) {
      return;
    }
    trackReadAudioTelemetry("read_audio_open", {
      trackCount: tracks.length,
    });
  }, [isAudioVisible, tracks.length]);

  const feedbackHidden = isAudioVisible && isAudioPanelOpen;
  const feedbackOffsetPx = isAudioVisible ? 104 : 24;
  const shouldRenderAudioDock = isAudioVisible && tracks.length > 0;

  const contextValue = useMemo<ReadAudioContextValue>(
    () => ({
      activePlaybackAyahKey,
      feedbackHidden,
      feedbackOffsetPx,
      isAudioPanelOpen,
      isAudioVisible,
      pauseAudioPlayback,
      requestAudioAutoplay,
      restartAudioPlayback,
      setPlayableAyahKeys,
      setAudioVisible,
      syncAudioTracks,
      toggleAudioVisibility,
    }),
    [
      activePlaybackAyahKey,
      feedbackHidden,
      feedbackOffsetPx,
      isAudioPanelOpen,
      isAudioVisible,
      pauseAudioPlayback,
      requestAudioAutoplay,
      restartAudioPlayback,
      setPlayableAyahKeys,
      setAudioVisible,
      syncAudioTracks,
      toggleAudioVisibility,
    ],
  );

  return (
    <ReadAudioContext.Provider value={contextValue}>
      {children}
      {shouldRenderAudioDock ? (
        <ReadAudioDock
          autoplayRequestKey={autoplayRequestKey}
          pauseRequestKey={pauseRequestKey}
          restartRequestKey={restartRequestKey}
          tracks={tracks}
          playableAyahKeys={playableAyahKeys}
          visible
          onPlaybackAyahChange={setActivePlaybackAyahKey}
          onPanelOpenChange={setIsAudioPanelOpen}
        />
      ) : null}
    </ReadAudioContext.Provider>
  );
}

export function useReadAudio() {
  const context = useContext(ReadAudioContext);
  if (!context) {
    throw new Error("useReadAudio must be used within ReadAudioProvider");
  }
  return context;
}
