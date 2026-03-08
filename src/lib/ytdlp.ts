import { execFile } from "child_process";
import { promisify } from "util";
import { createReadStream } from "fs";
import { unlink, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { Quality, getYtdlpArgs } from "./formats";

const execFileAsync = promisify(execFile);

const TMP_DIR = join(process.cwd(), "tmp");

// Semaphore for limiting concurrent downloads
let activeDownloads = 0;
const MAX_CONCURRENT = 3;
const waitQueue: (() => void)[] = [];

async function acquireSemaphore(): Promise<void> {
  if (activeDownloads < MAX_CONCURRENT) {
    activeDownloads++;
    return;
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeDownloads++;
      resolve();
    });
  });
}

function releaseSemaphore(): void {
  activeDownloads--;
  const next = waitQueue.shift();
  if (next) next();
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  uploader: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--dump-json",
    "--no-download",
    "--no-warnings",
    url,
  ], { timeout: 30000 });

  const data = JSON.parse(stdout);
  return {
    title: data.title || "Unknown",
    thumbnail: data.thumbnail || "",
    duration: data.duration || 0,
    durationFormatted: formatDuration(data.duration || 0),
    uploader: data.uploader || data.channel || "Unknown",
  };
}

export async function downloadToFile(
  url: string,
  quality: Quality
): Promise<{ filepath: string; cleanup: () => Promise<void> }> {
  await acquireSemaphore();

  try {
    await mkdir(TMP_DIR, { recursive: true });

    const ext = quality === "mp3" ? "mp3" : "mp4";
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(TMP_DIR, filename);

    const args = [...getYtdlpArgs(quality), "-o", filepath, url];

    await execFileAsync("yt-dlp", args, {
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const cleanup = async () => {
      releaseSemaphore();
      try {
        await unlink(filepath);
      } catch {
        // file may already be deleted
      }
    };

    return { filepath, cleanup };
  } catch (err) {
    releaseSemaphore();
    throw err;
  }
}
