import { NextResponse } from "next/server";
import { getChannelStatus, getYtdlpVersion, startHealthMonitor, getUpdateStatus } from "@/lib/health-monitor";
import { getSemaphoreStatus } from "@/lib/ytdlp";
import { getPotStatus } from "@/lib/pot-provider";

// Start health monitor on first import
startHealthMonitor();

export async function GET() {
  const channels = getChannelStatus();
  const downloads = getSemaphoreStatus();
  const ytdlpVersion = getYtdlpVersion();
  const updates = getUpdateStatus();

  // Liveness via raw-http ping to the CMD-supervised provider (bundle-independent).
  const potProvider = await getPotStatus();

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
