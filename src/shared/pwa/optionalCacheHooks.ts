export interface OptionalOfflineCacheMarker {
  readonly appBuildId: string;
  readonly dataVersion: string;
}

export interface OptionalOfflineCachePrefetchParams {
  readonly appBuildId: string;
  readonly controller: AbortController;
  readonly dataVersion: string;
}

/**
 * Feature-owned cache lifecycle hooks injected into the shared PWA engine.
 * Shared infrastructure deliberately knows nothing about the feature payload.
 */
export interface OptionalOfflineCacheHooks {
  readonly clear: () => Promise<void>;
  readonly getMarker: () => OptionalOfflineCacheMarker | null;
  readonly prefetch: (
    params: OptionalOfflineCachePrefetchParams,
  ) => Promise<unknown>;
}
