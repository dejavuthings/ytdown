import { execFile } from "child_process";
import { promisify } from "util";
import { Platform } from "./validate";
import { autoUpdateYtdlp } from "./self-healing";

const execFileAsync = promisify(execFile);

// Public, long-lived test URLs
const TEST_URLS: Partial<Record<Platform, string>> = {
  youtube: "https://www.youtube.com/watch?v=jNQXAC9IVRw", // "Me at the zoo"
};

export interface ChannelStatus {
  healthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  lastError: string;
}

const channelStatus: Record<Platform, ChannelStatus> = {
  youtube: { healthy: true, lastChecked: new Date(), consecutiveFailures: 0, lastError: "" },
  instagram: { healthy: true, lastChecked: new Date(), consecutiveFailures: 0, lastError: "" },
  tiktok: { healthy: true, lastChecked: new Date(), consecutiveFailures: 0, lastError: "" },
};

let ytdlpVersion = "unknown";

async function checkChannel(platform: Platform): Promise<boolean> {
  const testUrl = TEST_URLS[platform];
  if (!testUrl) {
    // No test URL available — assume healthy
    return true;
  }

  try {
    await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--no-playlist",
      testUrl,
    ], { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });

    channelStatus[platform].healthy = true;
    channelStatus[platform].consecutiveFailures = 0;
    channelStatus[platform].lastError = "";
    channelStatus[platform].lastChecked = new Date();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    channelStatus[platform].healthy = false;
    channelStatus[platform].consecutiveFailures++;
    channelStatus[platform].lastError = msg.slice(0, 200);
    channelStatus[platform].lastChecked = new Date();

    console.error(`[health] ${platform} check failed (${channelStatus[platform].consecutiveFailures}x):`, msg.slice(0, 200));

    // Auto-heal: update yt-dlp after 3 consecutive failures
    if (channelStatus[platform].consecutiveFailures >= 3) {
      console.log(`[health] ${platform} failed 3x, triggering yt-dlp update`);
      const updated = await autoUpdateYtdlp();
      if (updated) {
        // Re-check after update
        try {
          await execFileAsync("yt-dlp", [
            "--dump-json", "--no-download", "--no-warnings", "--no-playlist", testUrl,
          ], { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
          channelStatus[platform].healthy = true;
          channelStatus[platform].consecutiveFailures = 0;
          channelStatus[platform].lastError = "";
          console.log(`[health] ${platform} recovered after yt-dlp update`);
          return true;
        } catch {
          console.error(`[health] ${platform} still failing after update`);
        }
      }
    }

    return false;
  }
}

async function fetchYtdlpVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", ["--version"], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

export async function runHealthCheck(): Promise<void> {
  ytdlpVersion = await fetchYtdlpVersion();
  console.log(`[health] yt-dlp version: ${ytdlpVersion}`);

  for (const platform of Object.keys(TEST_URLS) as Platform[]) {
    await checkChannel(platform);
  }
}

export function getChannelStatus(): Record<Platform, ChannelStatus> {
  return { ...channelStatus };
}

export function getYtdlpVersion(): string {
  return ytdlpVersion;
}

export function recordFailure(platform: Platform): void {
  channelStatus[platform].consecutiveFailures++;
  if (channelStatus[platform].consecutiveFailures >= 3) {
    channelStatus[platform].healthy = false;
  }
}

export function recordSuccess(platform: Platform): void {
  channelStatus[platform].consecutiveFailures = 0;
  channelStatus[platform].healthy = true;
}

// Start periodic health check (every 6 hours)
let healthInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthMonitor(): void {
  if (healthInterval) return;
  runHealthCheck();
  healthInterval = setInterval(runHealthCheck, 6 * 60 * 60 * 1000);
}
