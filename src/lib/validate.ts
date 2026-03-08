const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const INSTAGRAM_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv|stories)\/([a-zA-Z0-9_-]+)/;

const TIKTOK_REGEX =
  /^(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/video\/(\d+)|(\w+))/;

export type Platform = "youtube" | "instagram" | "tiktok";

export function isValidUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url) || INSTAGRAM_REGEX.test(url) || TIKTOK_REGEX.test(url);
}

export function detectPlatform(url: string): Platform | null {
  if (YOUTUBE_REGEX.test(url)) return "youtube";
  if (INSTAGRAM_REGEX.test(url)) return "instagram";
  if (TIKTOK_REGEX.test(url)) return "tiktok";
  return null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url);
}

export function isValidInstagramUrl(url: string): boolean {
  return INSTAGRAM_REGEX.test(url);
}

export function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
