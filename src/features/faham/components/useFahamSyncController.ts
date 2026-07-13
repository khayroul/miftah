"use client";

/* eslint-disable react-hooks/exhaustive-deps -- explicit stable setters preserve the original sync lifecycle */

import { useCallback, useEffect } from "react";
import {
  loadPendingFahamRatings,
  replacePendingFahamRatings,
} from "../domain/offlineSync";
import type { FahamStatsController } from "./useFahamStatsController";
import type { FahamWorkspaceState } from "./useFahamWorkspaceState";

export function useFahamSyncController(
  state: FahamWorkspaceState,
  stats: FahamStatsController,
) {
  const syncPendingRatings = useCallback((): Promise<boolean> => {
    if (state.syncPromiseRef.current) return state.syncPromiseRef.current;
    const syncPromise = (async () => {
      const initialPending = loadPendingFahamRatings();
      state.setPendingSyncCount(initialPending.length);
      if (initialPending.length === 0) {
        state.setSyncState(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "idle",
        );
        return false;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        state.setSyncState("offline");
        return false;
      }
      state.isSyncingRef.current = true;
      state.setSyncState("syncing");
      let syncedAny = false;
      try {
        while (true) {
          const liveQueue = loadPendingFahamRatings();
          const entry = liveQueue[0];
          if (!entry) break;
          const body = entry.progressId
            ? { progressId: entry.progressId, rating: entry.rating }
            : { rating: entry.rating, wordId: entry.wordId };
          const response = await fetch("/api/faham/rate", {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          if (!response.ok) {
            const target = entry.progressId ?? entry.wordId ?? "unknown";
            throw new Error(`Failed to sync Faham rating ${target}`);
          }
          syncedAny = true;
          const remaining = replacePendingFahamRatings(
            loadPendingFahamRatings().filter((pending) => pending.id !== entry.id),
          );
          state.setPendingSyncCount(remaining.length);
        }
        state.setSyncState(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "idle",
        );
      } catch (error) {
        console.error(error);
        state.setSyncState(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "error",
        );
      } finally {
        state.isSyncingRef.current = false;
      }
      return syncedAny;
    })();
    state.syncPromiseRef.current = syncPromise;
    void syncPromise.finally(() => {
      if (state.syncPromiseRef.current === syncPromise) {
        state.syncPromiseRef.current = null;
      }
    });
    return syncPromise;
  }, [state.isSyncingRef, state.setPendingSyncCount, state.setSyncState, state.syncPromiseRef]);

  useEffect(() => {
    state.setPendingSyncCount(loadPendingFahamRatings().length);
  }, [state.setPendingSyncCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncRecoveredRatings = async () => {
      if (await syncPendingRatings()) {
        await stats.refreshStats(false);
      }
    };
    const handleOnline = () => {
      state.setSyncState("idle");
      void syncRecoveredRatings();
    };
    const handleOffline = () => state.setSyncState("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void syncRecoveredRatings();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [state.setSyncState, stats.refreshStats, syncPendingRatings]);

  return { syncPendingRatings };
}

export type FahamSyncController = ReturnType<typeof useFahamSyncController>;
