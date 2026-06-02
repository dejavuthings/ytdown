import { NextResponse } from "next/server";
import { getChannelStatus, getYtdlpVersion, startHealthMonitor } from "@/lib/health-monitor";
import { getSemaphoreStatus } from "@/lib/ytdlp";

// Start health monitor on first import
startHealthMonitor();

// The provider binds to "::" (IPv6); try IPv6 loopback first, then IPv4.
const POT_BASE_URLS = process.env.YTDLP_POT_BASE_URL
  ? [process.env.YTDLP_POT_BASE_URL]
  : ["http://[::1]:4416", "http://127.0.0.1:4416"];

// Ping the bgutil POT provider so we can confirm remotely that it's up.
async function getPotProviderStatus(): Promise<{ up: boolean; detail: string }> {
  let lastDetail = "no attempt";
  for (const base of POT_BASE_URLS) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 2000);
      const res = await fetch(`${base}/ping`, { signal: ac.signal });
      clearTimeout(t);
      if (res.ok) return { up: true, detail: `${base} HTTP ${res.status}` };
      lastDetail = `${base} HTTP ${res.status}`;
    } catch (err) {
      lastDetail = `${base} ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { up: false, detail: lastDetail };
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
