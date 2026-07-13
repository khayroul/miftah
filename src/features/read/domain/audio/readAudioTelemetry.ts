export type ReadAudioTelemetryEvent =
  | "read_audio_open"
  | "read_audio_expand"
  | "read_audio_repeat_change"
  | "read_audio_drop_off"
  | "read_audio_range_preset"
  | "read_audio_next";

export function trackReadAudioTelemetry(
  eventName: ReadAudioTelemetryEvent,
  payload: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("miftah:read-audio", {
      detail: {
        eventName,
        ...payload,
      },
    }),
  );

  const maybeGtag = Reflect.get(window, "gtag");
  if (typeof maybeGtag === "function") {
    maybeGtag("event", eventName, payload);
  }
}
