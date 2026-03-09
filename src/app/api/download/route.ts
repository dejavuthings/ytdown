import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { isValidUrl, sanitizeFilename, detectPlatform } from "@/lib/validate";
import { getVideoInfo, downloadToFile } from "@/lib/ytdlp";
import { Quality } from "@/lib/formats";
import { checkRateLimit } from "@/lib/rate-limit";
import { executeWithHealing } from "@/lib/self-healing";
import { recordFailure, recordSuccess } from "@/lib/health-monitor";

const VALID_QUALITIES: Quality[] = ["highest", "medium", "low", "mp3"];

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(ip, "download");
  if (!allowed) {
    return new Response("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", { status: 429 });
  }

  const url = request.nextUrl.searchParams.get("url");
  const quality = request.nextUrl.searchParams.get("quality") as Quality;
  const title = request.nextUrl.searchParams.get("title");

  if (!url || !isValidUrl(url)) {
    return new Response("유효한 URL을 입력해주세요.", { status: 400 });
  }

  if (!quality || !VALID_QUALITIES.includes(quality)) {
    return new Response("유효한 화질 옵션을 선택해주세요.", { status: 400 });
  }

  const platform = detectPlatform(url);
  let cleanup: (() => Promise<void>) | null = null;

  try {
    // Use title from query param to avoid double yt-dlp call
    let safeName: string;
    if (title) {
      safeName = sanitizeFilename(title);
    } else {
      const info = await getVideoInfo(url);
      safeName = sanitizeFilename(info.title);
    }

    const ext = quality === "mp3" ? "mp3" : "mp4";
    const contentType = quality === "mp3" ? "audio/mpeg" : "video/mp4";

    // Download with self-healing
    const result = await executeWithHealing(
      () => downloadToFile(url, quality),
    );

    if (!result.success || !result.data) {
      if (platform) recordFailure(platform);
      return new Response(result.error || "다운로드에 실패했습니다.", { status: 500 });
    }

    if (platform) recordSuccess(platform);
    cleanup = result.data.cleanup;

    const fileStat = await stat(result.data.filepath);
    const readable = createReadStream(result.data.filepath);

    // Prevent double cleanup with a flag
    let cleanedUp = false;
    const safeCleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      await cleanup?.();
    };

    const webStream = new ReadableStream({
      start(controller) {
        readable.on("data", (chunk: string | Buffer) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        readable.on("end", () => {
          controller.close();
          safeCleanup();
        });
        readable.on("error", (err) => {
          controller.error(err);
          safeCleanup();
        });
      },
      cancel() {
        readable.destroy();
        safeCleanup();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.${ext}`)}`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Download failed:", err);
    if (cleanup) await cleanup();
    if (platform) recordFailure(platform);
    return new Response("다운로드에 실패했습니다.", { status: 500 });
  }
}
