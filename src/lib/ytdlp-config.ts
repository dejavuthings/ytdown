import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Platform } from "./validate";

/**
 * Shared yt-dlp argument helpers.
 *
 * Problems this addresses on datacenter IPs (e.g. Railway):
 *  1. YouTube bot detection ("Sign in to confirm you're not a bot").
 *     The only reliable fix is cookies — inject them via env (YTDLP_COOKIES
 *     or YTDLP_COOKIES_FILE). See README/deployment notes.
 *  2. Optional player_client override (YTDLP_YT_CLIENTS) for ops tuning when
 *     YouTube shifts behavior. NOT set by default: yt-dlp's built-in client
 *     selection already negotiates the best available formats, and forcing a
 *     restrictive list can drop quality (e.g. only the 360p combined stream
 *     remains) or remove the very client that was working. Only override when
 *     you know the current default is being challenged.
 *  3. Keeps info / download / health checks all using the SAME args so
 *     behavior is consistent (health reflects what real downloads do).
 */

// --- Cookie resolution (lazy, cached) ---
// Supports either:
//   YTDLP_COOKIES_FILE = absolute path to a Netscape cookies.txt
//   YTDLP_COOKIES      = raw cookies.txt contents (written to tmp/cookies.txt)
let cookieFilePath: string | null = null;
let cookieResolved = false;

function resolveCookieFile(): string | null {
  if (cookieResolved) return cookieFilePath;
  cookieResolved = true;

  const explicitPath = process.env.YTDLP_COOKIES_FILE?.trim();
  if (explicitPath) {
    if (existsSync(explicitPath)) {
      cookieFilePath = explicitPath;
      console.log(`[ytdlp-config] Using cookies file: ${explicitPath}`);
    } else {
      console.warn(`[ytdlp-config] YTDLP_COOKIES_FILE not found: ${explicitPath}`);
    }
    return cookieFilePath;
  }

  const raw = process.env.YTDLP_COOKIES?.trim();
  if (raw) {
    try {
      const target = join(process.cwd(), "tmp", "cookies.txt");
      mkdirSync(dirname(target), { recursive: true });
      // Allow literal "\n" in the env var to mean real newlines.
      writeFileSync(target, raw.replace(/\\n/g, "\n") + "\n", { mode: 0o600 });
      cookieFilePath = target;
      console.log("[ytdlp-config] Wrote cookies from YTDLP_COOKIES env");
    } catch (err) {
      console.error("[ytdlp-config] Failed to write cookies file:", err);
    }
  }

  return cookieFilePath;
}

export function hasCookies(): boolean {
  return resolveCookieFile() !== null;
}

/**
 * Args common to every yt-dlp invocation for a given platform.
 * Includes YouTube anti-bot extractor args and cookies (if configured).
 */
export function getCommonArgs(platform: Platform | null): string[] {
  const args: string[] = [];

  const cookies = resolveCookieFile();
  if (cookies) {
    args.push("--cookies", cookies);
  }

  // Player-client override is opt-in (YouTube only). Default = yt-dlp's own
  // selection, which negotiates the best formats; forcing a list can degrade
  // quality, so only apply when an operator explicitly sets it.
  if (platform === "youtube" || platform === null) {
    const clients = process.env.YTDLP_YT_CLIENTS?.trim();
    if (clients) {
      args.push("--extractor-args", `youtube:player_client=${clients}`);
    }
  }

  return args;
}
