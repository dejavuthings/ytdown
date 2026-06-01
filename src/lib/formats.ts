import { Platform } from "./validate";

export type Quality = "highest" | "medium" | "low" | "mp3";

export interface FormatOption {
  label: string;
  value: Quality;
  description: string;
  isAudio: boolean;
  platforms: Platform[];
}

export const FORMAT_OPTIONS: FormatOption[] = [
  {
    label: "최고 화질",
    value: "highest",
    description: "원본 최고 해상도 (MP4)",
    isAudio: false,
    platforms: ["youtube", "instagram", "tiktok"],
  },
  {
    label: "중간 화질",
    value: "medium",
    description: "720p (MP4)",
    isAudio: false,
    platforms: ["youtube"],
  },
  {
    label: "낮은 화질",
    value: "low",
    description: "360p (MP4)",
    isAudio: false,
    platforms: ["youtube"],
  },
  {
    label: "MP3 최고음질",
    value: "mp3",
    description: "오디오만 (MP3, 320kbps)",
    isAudio: true,
    platforms: ["youtube", "instagram", "tiktok"],
  },
];

export function getFormatOptionsForPlatform(platform: Platform): FormatOption[] {
  return FORMAT_OPTIONS.filter((opt) => opt.platforms.includes(platform));
}

export function getYtdlpArgs(quality: Quality, platform: Platform = "youtube"): string[] {
  if (platform === "tiktok") {
    switch (quality) {
      case "highest":
        return [
          "-f",
          "bestvideo+bestaudio/best",
          "-S", "vcodec:h264",
          "--merge-output-format", "mp4",
          "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -preset fast -crf 23",
        ];
      case "mp3":
        return ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
      default:
        return [
          "-f",
          "bestvideo+bestaudio/best",
          "-S", "vcodec:h264",
          "--merge-output-format", "mp4",
          "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -preset fast -crf 23",
        ];
    }
  }

  if (platform === "instagram") {
    switch (quality) {
      case "highest":
        return [
          "-f",
          "bestvideo+bestaudio/best",
          "-S", "vcodec:h264",
          "--merge-output-format", "mp4",
          "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -preset fast -crf 23",
        ];
      case "mp3":
        return ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
      default:
        return [
          "-f",
          "bestvideo+bestaudio/best",
          "-S", "vcodec:h264",
          "--merge-output-format", "mp4",
          "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -preset fast -crf 23",
        ];
    }
  }

  // Format chains prefer mp4/m4a (no re-mux needed), then fall back to ANY
  // bestvideo+bestaudio (remuxed to mp4) so we keep high resolution. The bare
  // `best` combined stream is the LAST resort — without the extra fallbacks,
  // YouTube's SABR experiment silently drops "highest" to 360p (format 18).
  switch (quality) {
    case "highest":
      return [
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
        "--merge-output-format",
        "mp4",
      ];
    case "medium":
      return [
        "-f",
        "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720][ext=mp4]/best[height<=720]/best",
        "--merge-output-format",
        "mp4",
      ];
    case "low":
      return [
        "-f",
        "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360][ext=mp4]/best[height<=360]/best",
        "--merge-output-format",
        "mp4",
      ];
    case "mp3":
      return ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
  }
}
