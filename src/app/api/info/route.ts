import { NextRequest, NextResponse } from "next/server";
import { isValidYouTubeUrl } from "@/lib/validate";
import { getVideoInfo } from "@/lib/ytdlp";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url || !isValidYouTubeUrl(url)) {
    return NextResponse.json(
      { error: "유효한 YouTube URL을 입력해주세요." },
      { status: 400 }
    );
  }

  try {
    const info = await getVideoInfo(url);
    return NextResponse.json(info);
  } catch (err) {
    console.error("Failed to get video info:", err);
    return NextResponse.json(
      { error: "영상 정보를 가져올 수 없습니다." },
      { status: 500 }
    );
  }
}
