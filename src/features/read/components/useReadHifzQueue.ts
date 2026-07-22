"use client";
/* eslint-disable react-hooks/set-state-in-effect -- preserves queue reset semantics from the pre-wave workspace */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildRecoveredRatedProgressIds,
  findQueuePageIndex,
  getAdjacentQueuePageFromQueue,
  loadQueue,
  recoverQueueState,
  saveQueueState,
  type HifzFlowType,
  type HifzQueuePagePointer,
  type HifzQueueResponse,
  type HifzSessionQueue,
} from "@/features/hifz/read-runtime";

export interface HifzQueueRecoveryError {
  message: string;
  requiresSignIn?: boolean;
}

function resolveQueueIndex(
  queue: Pick<HifzSessionQueue, "pageOrder">,
  pageNumber: number,
  queueIndexFromUrl: number | null,
): number | null {
  if (queueIndexFromUrl !== null && queue.pageOrder[queueIndexFromUrl] === pageNumber) {
    return queueIndexFromUrl;
  }
  const index = findQueuePageIndex(queue, pageNumber);
  return index >= 0 ? index : null;
}

function toQueueState(
  flow: HifzFlowType,
  response: HifzQueueResponse,
  currentPageIndex: number,
): HifzSessionQueue {
  return {
    type: flow,
    items: response.items,
    pageOrder: response.pageOrder,
    currentPageIndex,
    rated: buildRecoveredRatedProgressIds(response.items, response.pageOrder, currentPageIndex),
  };
}

interface UseReadHifzQueueInput {
  flow: HifzFlowType | null;
  pageNumber: number;
  queueIndex: number | null;
}

export function useReadHifzQueue({ flow, pageNumber, queueIndex }: UseReadHifzQueueInput) {
  const t = useTranslations("read.hifzQueue");
  const [nextPage, setNextPage] = useState<HifzQueuePagePointer | null>(null);
  const [previousPage, setPreviousPage] = useState<HifzQueuePagePointer | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [recoveryError, setRecoveryError] = useState<HifzQueueRecoveryError | null>(null);

  const applyQueuePointers = useCallback((queue: Pick<HifzSessionQueue, "pageOrder">) => {
    setPreviousPage(getAdjacentQueuePageFromQueue(queue, pageNumber, -1));
    setNextPage(getAdjacentQueuePageFromQueue(queue, pageNumber, 1));
    setTotalPages(queue.pageOrder.length);
  }, [pageNumber]);

  useEffect(() => {
    if (flow === null) {
      setNextPage(null);
      setPreviousPage(null);
      setIsRecovering(false);
      setRecoveryError(null);
      return;
    }

    const existingQueue = loadQueue(flow);
    const existingIndex = existingQueue
      ? resolveQueueIndex(existingQueue, pageNumber, queueIndex)
      : null;
    if (existingQueue && existingIndex !== null) {
      const recovered = recoverQueueState(flow, pageNumber, existingIndex) ?? existingQueue;
      applyQueuePointers(recovered);
      setIsRecovering(false);
      setRecoveryError(null);
      return;
    }

    const abortController = new AbortController();
    setIsRecovering(true);
    setRecoveryError(null);
    void fetch(`/api/hifz/queue?type=${flow}`, { cache: "no-store", signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) throw { status: response.status };
        return (await response.json()) as HifzQueueResponse;
      })
      .then((response) => {
        const responseIndex = resolveQueueIndex(response, pageNumber, queueIndex);
        if (responseIndex === null) {
          setPreviousPage(null);
          setNextPage(null);
          setRecoveryError({ message: t("queueChangedError") });
          return;
        }
        const recovered = saveQueueState(
          flow,
          response.items,
          responseIndex,
          buildRecoveredRatedProgressIds(response.items, response.pageOrder, responseIndex),
        );
        applyQueuePointers(recovered ?? toQueueState(flow, response, responseIndex));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[ReadPageWorkspace] Failed to recover hifz queue", error);
        setPreviousPage(null);
        setNextPage(null);
        const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
        setRecoveryError(status === 401
          ? { message: t("signInRequiredError"), requiresSignIn: true }
          : { message: t("recoveryFailedError") });
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsRecovering(false);
      });
    return () => abortController.abort();
  }, [applyQueuePointers, flow, pageNumber, queueIndex, t]);

  return { isRecovering, nextPage, previousPage, recoveryError, totalPages };
}
