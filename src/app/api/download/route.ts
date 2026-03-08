import { NextRequest } from "next/server";
import { createReadStream, statSync } from "fs";
import { isValidYouTubeUrl, sanitizeFilename } from "@/lib/validate";
import { getVideoInfo, downloadToFile } from "@/lib/ytdlp";
import { Quality } from "@/lib/formats";

const VALID_QUALITIES: Quality[] = ["highest", "medium", "low", "mp3"];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const quality = request.nextUrl.searchParams.get("quality") as Quality;

  if (!url || !isValidYouTubeUrl(url)) {
    return new Response("유효한 YouTube URL을 입력해주세요.", { status: 400 });
  }

  if (!quality || !VALID_QUALITIES.includes(quality)) {
    return new Response("유효한 화질 옵션을 선택해주세요.", { status: 400 });
  }

  let cleanup: (() => Promise<void>) | null = null;

  try {
    const info = await getVideoInfo(url);
    const safeName = sanitizeFilename(info.title);
    const ext = quality === "mp3" ? "mp3" : "mp4";
    const contentType = quality === "mp3" ? "audio/mpeg" : "video/mp4";

    const result = await downloadToFile(url, quality);
    cleanup = result.cleanup;

    const stat = statSync(result.filepath);
    const readable = createReadStream(result.filepath);

    const webStream = new ReadableStream({
      start(controller) {
        readable.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        readable.on("end", () => {
          controller.close();
          cleanup?.();
        });
        readable.on("error", (err) => {
          controller.error(err);
          cleanup?.();
        });
      },
      cancel() {
        readable.destroy();
        cleanup?.();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.${ext}`)}`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Download failed:", err);
    if (cleanup) await cleanup();
    return new Response("다운로드에 실패했습니다.", { status: 500 });
  }
}
