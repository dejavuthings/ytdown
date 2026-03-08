import { NextRequest, NextResponse } from "next/server";
import { isValidUrl, detectPlatform } from "@/lib/validate";
import { getVideoInfo } from "@/lib/ytdlp";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { error: "유효한 YouTube 또는 Instagram URL을 입력해주세요." },
      { status: 400 }
    );
  }

  try {
    const platform = detectPlatform(url);
    const info = await getVideoInfo(url);
    return NextResponse.json({ ...info, platform });
  } catch (err) {
    console.error("Failed to get video info:", err);
    return NextResponse.json(
      { error: "영상 정보를 가져올 수 없습니다." },
      { status: 500 }
    );
  }
}
