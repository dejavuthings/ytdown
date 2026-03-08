"use client";

import { Quality } from "@/lib/formats";

interface DownloadButtonProps {
  url: string;
  quality: Quality;
  downloading: boolean;
  onDownload: () => void;
}

export default function DownloadButton({ quality, downloading, onDownload }: DownloadButtonProps) {
  const label = quality === "mp3" ? "MP3 다운로드" : "영상 다운로드";

  return (
    <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <button
        onClick={onDownload}
        disabled={downloading}
        className="apple-btn-lg flex items-center justify-center gap-3"
      >
        {downloading ? (
          <>
            <span className="spinner" />
            <span>다운로드 준비 중...</span>
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{label}</span>
          </>
        )}
      </button>
    </div>
  );
}
