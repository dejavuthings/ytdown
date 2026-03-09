import { execFile } from "child_process";
import { promisify } from "util";
import { unlink, mkdir, readdir, stat, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { Quality, getYtdlpArgs } from "./formats";
import { Platform, detectPlatform } from "./validate";

const execFileAsync = promisify(execFile);

export const TMP_DIR = join(process.cwd(), "tmp");

// --- Improved Semaphore with TTL and queue limit ---

interface SemaphoreSlot {
  acquiredAt: number;
  timer: ReturnType<typeof setTimeout>;
}

let activeDownloads = 0;
const MAX_CONCURRENT = 3;
const MAX_QUEUE_SIZE = 10;
const SLOT_TTL = 10 * 60 * 1000; // 10 minutes
const waitQueue: { resolve: () => void; reject: (err: Error) => void }[] = [];
const activeSlots: SemaphoreSlot[] = [];

async function acquireSemaphore(): Promise<void> {
  if (activeDownloads < MAX_CONCURRENT) {
    activeDownloads++;
    const slot: SemaphoreSlot = {
      acquiredAt: Date.now(),
      timer: setTimeout(() => {
        console.warn("[semaphore] Slot TTL expired, force releasing");
        forceReleaseSlot(slot);
      }, SLOT_TTL),
    };
    activeSlots.push(slot);
    return;
  }

  if (waitQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error("서버가 바쁩니다. 잠시 후 다시 시도해주세요.");
  }

  return new Promise((resolve, reject) => {
    waitQueue.push({ resolve, reject });
  });
}

function releaseSemaphore(): void {
  // Clean up oldest active slot
  const slot = activeSlots.shift();
  if (slot) {
    clearTimeout(slot.timer);
  }

  activeDownloads = Math.max(0, activeDownloads - 1);

  const next = waitQueue.shift();
  if (next) {
    activeDownloads++;
    const newSlot: SemaphoreSlot = {
      acquiredAt: Date.now(),
      timer: setTimeout(() => {
        console.warn("[semaphore] Slot TTL expired, force releasing");
        forceReleaseSlot(newSlot);
      }, SLOT_TTL),
    };
    activeSlots.push(newSlot);
    next.resolve();
  }
}

function forceReleaseSlot(slot: SemaphoreSlot): void {
  const idx = activeSlots.indexOf(slot);
  if (idx !== -1) {
    activeSlots.splice(idx, 1);
    clearTimeout(slot.timer);
    activeDownloads = Math.max(0, activeDownloads - 1);

    const next = waitQueue.shift();
    if (next) {
      activeDownloads++;
      const newSlot: SemaphoreSlot = {
        acquiredAt: Date.now(),
        timer: setTimeout(() => forceReleaseSlot(newSlot), SLOT_TTL),
      };
      activeSlots.push(newSlot);
      next.resolve();
    }
  }
}

export function getSemaphoreStatus() {
  return { active: activeDownloads, queued: waitQueue.length, max: MAX_CONCURRENT };
}

// --- Temp File Cleanup ---

export async function cleanupTmpDir(): Promise<void> {
  try {
    await mkdir(TMP_DIR, { recursive: true });
    const files = await readdir(TMP_DIR);
    const now = Date.now();
    const MAX_AGE = 30 * 60 * 1000; // 30 minutes

    for (const file of files) {
      try {
        const filepath = join(TMP_DIR, file);
        const fileStat = await stat(filepath);
        if (now - fileStat.mtimeMs > MAX_AGE) {
          await rm(filepath, { force: true });
          console.log(`[cleanup] Removed stale file: ${file}`);
        }
      } catch {
        // ignore individual file errors
      }
    }
  } catch (err) {
    console.error("[cleanup] Failed to clean tmp dir:", err);
  }
}

// Run cleanup on startup and every 10 minutes
cleanupTmpDir();
setInterval(cleanupTmpDir, 10 * 60 * 1000);

// --- Video Info ---

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  uploader: string;
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SAFE_FLAGS = ["--no-exec", "--no-config", "--no-playlist"];

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--dump-json",
    "--no-download",
    "--no-warnings",
    ...SAFE_FLAGS,
    url,
  ], { timeout: 45000, maxBuffer: 5 * 1024 * 1024 });

  const data = JSON.parse(stdout);
  return {
    title: data.title || "Unknown",
    thumbnail: data.thumbnail || "",
    duration: data.duration || 0,
    durationFormatted: formatDuration(data.duration || 0),
    uploader: data.uploader || data.channel || "Unknown",
  };
}

// --- Download ---

export async function downloadToFile(
  url: string,
  quality: Quality
): Promise<{ filepath: string; cleanup: () => Promise<void> }> {
  await acquireSemaphore();

  let cleaned = false;
  const doCleanup = async (filepath: string) => {
    if (cleaned) return;
    cleaned = true;
    releaseSemaphore();
    try {
      await unlink(filepath);
    } catch {
      // file may already be deleted
    }
    // Also clean up .part files
    try {
      await unlink(filepath + ".part");
    } catch {
      // ignore
    }
  };

  try {
    await mkdir(TMP_DIR, { recursive: true });

    const ext = quality === "mp3" ? "mp3" : "mp4";
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(TMP_DIR, filename);

    const platform: Platform = detectPlatform(url) || "youtube";
    const args = [
      ...getYtdlpArgs(quality, platform),
      ...SAFE_FLAGS,
      "-o", filepath,
      url,
    ];

    await execFileAsync("yt-dlp", args, {
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      filepath,
      cleanup: () => doCleanup(filepath),
    };
  } catch (err) {
    // Try to clean up any partial file
    const ext = quality === "mp3" ? "mp3" : "mp4";
    // Release semaphore on failure
    if (!cleaned) {
      cleaned = true;
      releaseSemaphore();
    }
    throw err;
  }
}
