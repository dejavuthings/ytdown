import { execFile } from "child_process";
import { promisify } from "util";
import { Quality, getYtdlpArgs } from "./formats";
import { Platform, detectPlatform } from "./validate";

const execFileAsync = promisify(execFile);

// --- Error Diagnosis ---

export type FailureType =
  | "outdated"
  | "format_unavailable"
  | "geo_restricted"
  | "auth_required"
  | "network"
  | "unknown";

const ERROR_PATTERNS: Partial<Record<FailureType, RegExp[]>> = {
  outdated: [
    /unable to extract/i,
    /HTTP Error 403/i,
    /Sign in to confirm/i,
    /got error code 403/i,
    /This request was detected as a bot/i,
  ],
  format_unavailable: [
    /requested format not available/i,
    /no video formats found/i,
    /Requested format is not available/i,
  ],
  geo_restricted: [
    /geo.?restrict/i,
    /not available in your country/i,
    /blocked it in your country/i,
  ],
  auth_required: [
    /private video/i,
    /age.?restrict/i,
    /login required/i,
    /This video is private/i,
    /Video unavailable/i,
  ],
  network: [
    /connection reset/i,
    /timed? ?out/i,
    /network is unreachable/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
  ],
};

export const USER_MESSAGES: Record<FailureType, string> = {
  outdated: "플랫폼 변경으로 일시적 오류가 발생했습니다. 자동 수정을 시도합니다...",
  format_unavailable: "요청한 화질을 사용할 수 없습니다. 다른 화질로 시도해주세요.",
  geo_restricted: "이 영상은 지역 제한이 있어 다운로드할 수 없습니다.",
  auth_required: "비공개 영상이거나 로그인이 필요한 영상입니다.",
  network: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  unknown: "다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

export function diagnoseError(errorMessage: string): FailureType {
  for (const [type, patterns] of Object.entries(ERROR_PATTERNS) as [FailureType, RegExp[] | undefined][]) {
    if (!patterns) continue;
    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return type;
      }
    }
  }
  return "unknown";
}

// --- Auto Update yt-dlp ---

let isUpdating = false;
let lastUpdateTime = 0;
const UPDATE_COOLDOWN = 5 * 60 * 1000; // 5 minutes

export async function autoUpdateYtdlp(): Promise<boolean> {
  if (isUpdating) return false;
  if (Date.now() - lastUpdateTime < UPDATE_COOLDOWN) return false;

  isUpdating = true;
  try {
    console.log("[self-healing] Updating yt-dlp...");
    await execFileAsync("yt-dlp", ["-U"], { timeout: 60000 });
    lastUpdateTime = Date.now();
    console.log("[self-healing] yt-dlp updated successfully");
    return true;
  } catch (err) {
    console.error("[self-healing] yt-dlp update failed:", err);
    return false;
  } finally {
    isUpdating = false;
  }
}

// --- Retry with Healing ---

interface HealingResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  failureType?: FailureType;
  healed?: boolean;
}

export async function executeWithHealing<T>(
  operation: () => Promise<T>,
  operationWithFallback?: () => Promise<T>,
): Promise<HealingResult<T>> {
  // 1st attempt: as-is
  try {
    const data = await operation();
    return { success: true, data };
  } catch (err) {
    const errMsg = extractErrorMessage(err);
    const failureType = diagnoseError(errMsg);
    console.error(`[self-healing] 1st attempt failed (${failureType}):`, errMsg);

    // Non-recoverable errors
    if (failureType === "geo_restricted" || failureType === "auth_required") {
      return { success: false, error: USER_MESSAGES[failureType], failureType };
    }

    // 2nd attempt: retry for transient errors
    if (failureType === "network") {
      await sleep(2000);
      try {
        const data = await operation();
        return { success: true, data, healed: true };
      } catch {
        return { success: false, error: USER_MESSAGES.network, failureType };
      }
    }

    // 3rd attempt: update yt-dlp for outdated/unknown errors
    if (failureType === "outdated" || failureType === "unknown") {
      const updated = await autoUpdateYtdlp();
      if (updated) {
        try {
          const data = await operation();
          return { success: true, data, healed: true };
        } catch (retryErr) {
          const retryMsg = extractErrorMessage(retryErr);
          console.error("[self-healing] Retry after update failed:", retryMsg);
        }
      }
    }

    // 4th attempt: fallback format
    if (failureType === "format_unavailable" && operationWithFallback) {
      try {
        const data = await operationWithFallback();
        return { success: true, data, healed: true };
      } catch {
        return { success: false, error: USER_MESSAGES.format_unavailable, failureType };
      }
    }

    return { success: false, error: USER_MESSAGES[failureType], failureType };
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const execErr = err as Error & { stderr?: string };
    return execErr.stderr || err.message;
  }
  return String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
