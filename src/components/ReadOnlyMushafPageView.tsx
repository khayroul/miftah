"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type { MushafLayoutPage } from "@/types/mushafLayout";
import { MushafLivePage, type MushafLiveWordRef } from "@/components/MushafLivePage";

interface ReadOnlyMushafPageViewProps {
  pageNumber: number;
  layout: MushafLayoutPage;
  onNavigatePrevPage?: () => void;
  onNavigateNextPage?: () => void;
  onCanvasTap?: () => void;
  onAyahAudioTap?: (ayahKey: string) => void;
  audioDiscovered?: boolean;
  onAudioDiscovered?: () => void;
  onReadyChange?: (ready: boolean) => void;
  activePlaybackAyahKey?: string | null;
}

export function ReadOnlyMushafPageView({
  pageNumber,
  layout,
  onNavigatePrevPage,
  onNavigateNextPage,
  onCanvasTap,
  onAyahAudioTap,
  audioDiscovered = true,
  onAudioDiscovered,
  onReadyChange,
  activePlaybackAyahKey = null,
}: ReadOnlyMushafPageViewProps) {
  const [isReady, setIsReady] = useState(false);
  const [showDiscoveryHint, setShowDiscoveryHint] = useState(!audioDiscovered);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    setShowDiscoveryHint(!audioDiscovered);
  }, [audioDiscovered]);

  useEffect(() => {
    if (!showDiscoveryHint || !isReady) return;
    const timer = window.setTimeout(() => setShowDiscoveryHint(false), 2600);
    return () => window.clearTimeout(timer);
  }, [isReady, showDiscoveryHint]);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  const handleWordClick = useCallback(
    (wordRef: MushafLiveWordRef) => {
      onAudioDiscovered?.();
      setShowDiscoveryHint(false);
      if (wordRef.ayahKey) {
        onAyahAudioTap?.(wordRef.ayahKey);
      }
    },
    [onAudioDiscovered, onAyahAudioTap],
  );

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsedMs = Date.now() - start.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (elapsedMs > 900 || absDx < 60 || absDy > 120 || absDx < absDy * 1.3) return;
    if (dx > 0) {
      onNavigatePrevPage?.();
    } else {
      onNavigateNextPage?.();
    }
  };

  return (
    <section className="space-y-3">
      {showDiscoveryHint && isReady ? (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm animate-in fade-in duration-300 sm:px-4 sm:py-2 sm:text-base dark:bg-emerald-900/30 dark:text-emerald-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Tip: Ketik halaman atau buka Audio untuk dengar bacaan
          </div>
        </div>
      ) : null}

      <div
        className="relative w-full cursor-pointer overflow-hidden rounded-2xl dark:rounded-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          onAudioDiscovered?.();
          setShowDiscoveryHint(false);
          onCanvasTap?.();
        }}
      >
        <MushafLivePage
          pageNumber={pageNumber}
          layout={layout}
          onWordClick={handleWordClick}
          activePlaybackAyahKey={activePlaybackAyahKey}
          onReady={useCallback(() => setIsReady(true), [])}
        />
      </div>

      <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
        Mod Baca: Leret untuk tukar halaman. <strong>Ketik ayat untuk mula bacaan dari situ, atau gunakan butang Audio.</strong>
      </p>
    </section>
  );
}
