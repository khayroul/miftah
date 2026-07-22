/**
 * Coded errors thrown by the download engine + cache layer. Engines must not
 * bake display language into thrown messages — callers render `.code` through
 * a `mushaf.download.*` translation key at render time (see
 * MushafDownloadPrompt.tsx). The `message` here is a dev/log-facing fallback
 * only (English, stable, never shown to end users directly).
 */
export type DownloadErrorCode = "incomplete" | "quota_exceeded";

const DOWNLOAD_ERROR_LOG_MESSAGES: Record<DownloadErrorCode, string> = {
  incomplete: "Download did not finish completely.",
  quota_exceeded: "Insufficient storage available for offline download.",
};

export class DownloadError extends Error {
  readonly code: DownloadErrorCode;

  constructor(code: DownloadErrorCode) {
    super(DOWNLOAD_ERROR_LOG_MESSAGES[code]);
    this.name = "DownloadError";
    this.code = code;
  }
}
