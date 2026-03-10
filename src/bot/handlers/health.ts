import type { Context } from "grammy";
import { supabaseAdmin } from "../supabase-admin.js";
import { getRuntimeState } from "../services/runtime-health.js";

function formatUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

async function checkSupabase(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from("surahs").select("id").limit(1);
    const latencyMs = Date.now() - start;
    if (error) {
      return { ok: false, latencyMs, detail: error.message };
    }
    return { ok: true, latencyMs, detail: "ok" };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function handleHealth(ctx: Context): Promise<void> {
  const runtime = getRuntimeState();
  const supabase = await checkSupabase();

  const lines: string[] = [];
  lines.push("🩺 Miftah Bot Health");
  lines.push(`Uptime: ${formatUptime(Date.now() - runtime.bootedAtMs)}`);
  lines.push(`Polling: ${runtime.pollingActive ? "active" : "inactive"}`);
  lines.push(`Retry count: ${runtime.pollingRestartCount}`);
  lines.push(
    `Supabase: ${supabase.ok ? "ok" : "fail"} (${supabase.latencyMs}ms${supabase.ok ? "" : `, ${supabase.detail}`})`,
  );

  if (runtime.lockPath) {
    lines.push(`Lock: ${runtime.lockPath} (pid ${runtime.lockOwnerPid ?? "-"})`);
  }

  if (runtime.lastPollingError && runtime.lastPollingErrorAtIso) {
    lines.push(`Last polling error: ${runtime.lastPollingErrorAtIso}`);
    lines.push(runtime.lastPollingError.slice(0, 250));
  }

  if (runtime.startupChecks.length > 0) {
    lines.push("");
    lines.push("Startup checks:");
    for (const check of runtime.startupChecks.slice(-8)) {
      lines.push(`- ${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
    }
  }

  await ctx.reply(lines.join("\n"));
}
