import { execFile } from "child_process";
import { promisify } from "util";
import { Platform } from "./validate";
import { autoUpdateYtdlp } from "./self-healing";
import { getCommonArgs } from "./ytdlp-config";

const execFileAsync = promisify(execFile);

// Public, long-lived test URLs. We try several per platform and consider the
// channel healthy if ANY succeeds — individual videos can get bot-challenged
// independently, so a single probe video gives false negatives.
const TEST_URLS: Partial<Record<Platform, string[]>> = {
  youtube: [
    "https://www.youtube.com/watch?v=jNQXAC9IVRw", // "Me at the zoo"
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Astley
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ", // Big Buck Bunny
  ],
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

async function probe(platform: Platform, url: string): Promise<void> {
  await execFileAsync("yt-dlp", [
    "--dump-json",
    "--no-download",
    "--no-warnings",
    ...getCommonArgs(platform),
    "--no-playlist",
    url,
  ], { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
}

// Try each candidate URL; healthy if ANY succeeds. Returns the last error
// message when all fail.
async function probeAny(platform: Platform, urls: string[]): Promise<string | null> {
  let lastErr = "";
  for (const url of urls) {
    try {
      await probe(platform, url);
      return null;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return lastErr;
}

async function checkChannel(platform: Platform): Promise<boolean> {
  const testUrls = TEST_URLS[platform];
  if (!testUrls || testUrls.length === 0) {
    // No test URL available — assume healthy
    return true;
  }

  const err = await probeAny(platform, testUrls);
  if (err === null) {
    channelStatus[platform].healthy = true;
    channelStatus[platform].consecutiveFailures = 0;
    channelStatus[platform].lastError = "";
    channelStatus[platform].lastChecked = new Date();
    return true;
  }

  channelStatus[platform].healthy = false;
  channelStatus[platform].consecutiveFailures++;
  channelStatus[platform].lastError = err.slice(0, 200);
  channelStatus[platform].lastChecked = new Date();

  console.error(`[health] ${platform} check failed (${channelStatus[platform].consecutiveFailures}x):`, err.slice(0, 200));

  // Auto-heal: update yt-dlp after 3 consecutive failures. Only worthwhile for
  // extractor breakages — bot blocks aren't fixed by updating, so skip then.
  const isBotBlock = /Sign in to confirm|not a bot|Use --cookies/i.test(err);
  if (channelStatus[platform].consecutiveFailures >= 3 && !isBotBlock) {
    console.log(`[health] ${platform} failed 3x, triggering yt-dlp update`);
    const updated = await autoUpdateYtdlp();
    if (updated) {
      const retryErr = await probeAny(platform, testUrls);
      if (retryErr === null) {
        channelStatus[platform].healthy = true;
        channelStatus[platform].consecutiveFailures = 0;
        channelStatus[platform].lastError = "";
        console.log(`[health] ${platform} recovered after yt-dlp update`);
        return true;
      }
      console.error(`[health] ${platform} still failing after update`);
    }
  }

  return false;
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

  await checkForUpdates();
}

// --- Update notifications (informational, not auto-applied) ---

interface ComponentUpdate {
  current: string;
  latest: string;
  outdated: boolean;
}
interface UpdateStatus {
  ytdlp: ComponentUpdate;
  bgutil: ComponentUpdate;
  lastChecked: string | null;
}

const updateStatus: UpdateStatus = {
  ytdlp: { current: "unknown", latest: "unknown", outdated: false },
  bgutil: { current: process.env.BGUTIL_VERSION || "unknown", latest: "unknown", outdated: false },
  lastChecked: null,
};

async function fetchLatestTag(repo: string): Promise<string> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { "User-Agent": "ytdown-health", Accept: "application/vnd.github+json" },
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!res.ok) return "unknown";
    const data = (await res.json()) as { tag_name?: string };
    return (data.tag_name || "unknown").replace(/^v/, "");
  } catch {
    return "unknown";
  }
}

async function checkForUpdates(): Promise<void> {
  const [ytdlpLatest, bgutilLatest] = await Promise.all([
    fetchLatestTag("yt-dlp/yt-dlp"),
    fetchLatestTag("Brainicism/bgutil-ytdlp-pot-provider"),
  ]);

  updateStatus.ytdlp = {
    current: ytdlpVersion,
    latest: ytdlpLatest,
    outdated: ytdlpLatest !== "unknown" && ytdlpVersion !== "unknown" && ytdlpVersion !== ytdlpLatest,
  };
  const bgutilCurrent = process.env.BGUTIL_VERSION || "unknown";
  updateStatus.bgutil = {
    current: bgutilCurrent,
    latest: bgutilLatest,
    outdated: bgutilLatest !== "unknown" && bgutilCurrent !== "unknown" && bgutilCurrent !== bgutilLatest,
  };
  updateStatus.lastChecked = new Date().toISOString();

  if (updateStatus.ytdlp.outdated) {
    console.warn(`[health] yt-dlp update available: ${ytdlpVersion} -> ${ytdlpLatest}`);
  }
  if (updateStatus.bgutil.outdated) {
    console.warn(`[health] bgutil update available: ${bgutilCurrent} -> ${bgutilLatest} (bump BGUTIL_VERSION in Dockerfile)`);
  }
}

export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus };
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
