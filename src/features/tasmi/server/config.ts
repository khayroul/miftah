import "server-only";

export function getTasmiServerUrl(): string {
  return (
    process.env.TASMI_SERVER_URL?.trim() ||
    process.env.NEXT_PUBLIC_TASMI_SERVER_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

export function getTasmiApiKey(): string {
  const privateKey = process.env.TASMI_API_KEY?.trim() ?? "";
  if (privateKey || process.env.NODE_ENV === "production") return privateKey;

  // Local compatibility only. Production must use the server-only variable so
  // the long-lived VPS credential can never be bundled into browser code.
  return process.env.NEXT_PUBLIC_TASMI_API_KEY?.trim() ?? "";
}

export function getTasmiWebSocketUrl(): string {
  const configured = process.env.TASMI_STREAM_URL?.trim();
  if (configured) return configured;

  const serverUrl = getTasmiServerUrl();
  if (!serverUrl) return "";
  try {
    const url = new URL(serverUrl);
    if (url.protocol === "https:") url.protocol = "wss:";
    else if (url.protocol === "http:") url.protocol = "ws:";
    else return "";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/transcribe`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}
