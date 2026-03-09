import { NextRequest } from "next/server";

// Whitelist thumbnail CDN domains
const ALLOWED_HOSTS = [
  "ytimg.com",
  "ggpht.com",
  "googleusercontent.com",
  "cdninstagram.com",
  "fbcdn.net",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "musical.ly",
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return ALLOWED_HOSTS.some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url || !isAllowedUrl(url)) {
    return new Response("Invalid or disallowed URL", { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://www.google.com/",
      },
    });

    if (!res.ok) {
      return new Response("Failed to fetch thumbnail", { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";

    // Ensure it's actually an image
    if (!contentType.startsWith("image/")) {
      return new Response("Not an image", { status: 400 });
    }

    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Failed to fetch thumbnail", { status: 502 });
  }
}
