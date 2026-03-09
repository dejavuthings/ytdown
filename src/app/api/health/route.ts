import { NextResponse } from "next/server";
import { getChannelStatus, getYtdlpVersion, startHealthMonitor } from "@/lib/health-monitor";
import { getSemaphoreStatus } from "@/lib/ytdlp";

// Start health monitor on first import
startHealthMonitor();

export async function GET() {
  const channels = getChannelStatus();
  const downloads = getSemaphoreStatus();
  const ytdlpVersion = getYtdlpVersion();

  const allHealthy = Object.values(channels).every((ch) => ch.healthy);

  return NextResponse.json({
    status: allHealthy ? "ok" : "degraded",
    ytdlpVersion,
    channels,
    downloads,
  });
}
