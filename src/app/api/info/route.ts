import { NextRequest, NextResponse } from "next/server";
import { isValidUrl, detectPlatform, normalizeUrl } from "@/lib/validate";
import { getVideoInfo } from "@/lib/ytdlp";
import { checkRateLimit } from "@/lib/rate-limit";
import { executeWithHealing } from "@/lib/self-healing";
import { recordFailure, recordSuccess } from "@/lib/health-monitor";
import { getBotBypassArgs } from "@/lib/ytdlp-config";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed } = checkRateLimit(ip, "info");
  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const rawUrl = request.nextUrl.searchParams.get("url");

  if (!rawUrl || !isValidUrl(rawUrl)) {
    return NextResponse.json(
      { error: "유효한 YouTube, Instagram 또는 TikTok URL을 입력해주세요." },
      { status: 400 }
    );
  }

  const url = normalizeUrl(rawUrl);
  const platform = detectPlatform(url);

  const result = await executeWithHealing(
    () => getVideoInfo(url),
    () => getVideoInfo(url, getBotBypassArgs(platform)),
  );

  if (result.success && result.data) {
    if (platform) recordSuccess(platform);
    return NextResponse.json({ ...result.data, platform });
  }

  if (platform) recordFailure(platform);
  console.error("Failed to get video info:", result.error, result.failureType);
  return NextResponse.json(
    { error: result.error || "영상 정보를 가져올 수 없습니다." },
    { status: 500 }
  );
}
