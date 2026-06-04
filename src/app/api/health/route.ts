import { NextResponse } from "next/server";
import { getChannelStatus, getYtdlpVersion, startHealthMonitor, getUpdateStatus } from "@/lib/health-monitor";
import { getSemaphoreStatus } from "@/lib/ytdlp";
import { getPotStatus, pingPot } from "@/lib/pot-provider";

// Start health monitor on first import
startHealthMonitor();

export async function GET() {
  const channels = getChannelStatus();
  const downloads = getSemaphoreStatus();
  const ytdlpVersion = getYtdlpVersion();
  const updates = getUpdateStatus();

  // Liveness comes from the supervised child process (reliable); the http ping
  // is a secondary confirmation over the raw http module.
  const potStatus = getPotStatus();
  const ping = potStatus.running ? await pingPot() : { ok: false, detail: "not running" };
  const potProvider = { ...potStatus, ping };

  const allHealthy = Object.values(channels).every((ch) => ch.healthy);

  return NextResponse.json({
    status: allHealthy ? "ok" : "degraded",
    ytdlpVersion,
    updates,
    potProvider,
    channels,
    downloads,
  });
}
