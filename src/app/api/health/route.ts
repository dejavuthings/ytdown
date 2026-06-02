import { NextResponse } from "next/server";
import { getChannelStatus, getYtdlpVersion, startHealthMonitor } from "@/lib/health-monitor";
import { getSemaphoreStatus } from "@/lib/ytdlp";

// Start health monitor on first import
startHealthMonitor();

const POT_BASE_URL = process.env.YTDLP_POT_BASE_URL || "http://127.0.0.1:4416";

// Ping the bgutil POT provider so we can confirm remotely that it's up.
async function getPotProviderStatus(): Promise<{ up: boolean; detail: string }> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2000);
    const res = await fetch(`${POT_BASE_URL}/ping`, { signal: ac.signal });
    clearTimeout(t);
    return { up: res.ok, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { up: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const channels = getChannelStatus();
  const downloads = getSemaphoreStatus();
  const ytdlpVersion = getYtdlpVersion();
  const potProvider = await getPotProviderStatus();

  const allHealthy = Object.values(channels).every((ch) => ch.healthy);

  return NextResponse.json({
    status: allHealthy ? "ok" : "degraded",
    ytdlpVersion,
    potProvider,
    channels,
    downloads,
  });
}
