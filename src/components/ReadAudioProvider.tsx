"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ReadAudioDock } from "@/components/ReadAudioDock";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";

interface ReadAudioContextValue {
  activePlaybackAyahKey: string | null;
  feedbackHidden: boolean;
  feedbackOffsetPx: number;
  isAudioPanelOpen: boolean;
  isAudioVisible: boolean;
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

  const syncAudioTracks = useCallback(
    (_pageNumber: number, nextTracks: ReadAudioTrack[]) => {
      setTracks(nextTracks);
    },
    [],
  );

  const setAudioVisible = useCallback((next: boolean) => {
    setIsAudioVisible(next);
    if (!next) {
      setIsAudioPanelOpen(false);
    }
  }, []);

  const toggleAudioVisibility = useCallback(() => {
    setIsAudioVisible((previous) => {
      const next = !previous;
      if (!next) {
        setIsAudioPanelOpen(false);
      }
      return next;
    });
  }, []);

  const feedbackHidden = isAudioVisible && isAudioPanelOpen;
  const feedbackOffsetPx = isAudioVisible ? 104 : 24;

  const contextValue = useMemo<ReadAudioContextValue>(
    () => ({
      activePlaybackAyahKey,
      feedbackHidden,
      feedbackOffsetPx,
      isAudioPanelOpen,
      isAudioVisible,
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
      setAudioVisible,
      syncAudioTracks,
      toggleAudioVisibility,
    ],
  );

  return (
    <ReadAudioContext.Provider value={contextValue}>
      {children}
      <ReadAudioDock
        tracks={tracks}
        visible={isAudioVisible && tracks.length > 0}
        onRequestClose={() => setAudioVisible(false)}
        onPlaybackAyahChange={setActivePlaybackAyahKey}
        onPanelOpenChange={setIsAudioPanelOpen}
      />
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
