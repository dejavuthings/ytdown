"use client";

import { useState } from "react";
import UrlInput from "./components/url-input";
import VideoInfo from "./components/video-info";
import QualitySelector from "./components/quality-selector";
import DownloadButton from "./components/download-button";
import { Quality } from "@/lib/formats";

interface VideoInfoData {
  title: string;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  uploader: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfoData | null>(null);
  const [quality, setQuality] = useState<Quality>("highest");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const handleFetchInfo = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setInfo(null);

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "영상 정보를 가져올 수 없습니다.");
        return;
      }

      setInfo(data);
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    setDownloading(true);
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&quality=${quality}`;

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => setDownloading(false), 3000);
  };

  return (
    <div
      className="min-h-screen min-h-[100dvh] flex items-start justify-center px-4 sm:px-5 pt-12 sm:pt-24 pb-8 sm:pb-12"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-[680px]">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-10">
          <h1
            className="text-[28px] sm:text-[40px] font-bold tracking-tight"
            style={{ color: "var(--foreground)", letterSpacing: "-0.03em" }}
          >
            YouTube Downloader
          </h1>
          <p
            className="text-[15px] sm:text-[17px] mt-1.5 sm:mt-2"
            style={{ color: "var(--muted)" }}
          >
            영상 또는 MP3를 간편하게 다운로드하세요.
          </p>
        </div>

        {/* Search */}
        <div className="mb-6 sm:mb-8">
          <UrlInput
            url={url}
            onChange={setUrl}
            onSubmit={handleFetchInfo}
            loading={loading}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-5 sm:mb-6 p-3.5 sm:p-4 rounded-2xl text-[14px] sm:text-[15px] font-medium animate-fade-in"
            style={{
              background: "rgba(255, 59, 48, 0.08)",
              color: "var(--danger)",
              border: "1px solid rgba(255, 59, 48, 0.15)",
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {info && (
          <div className="space-y-4 sm:space-y-5">
            <VideoInfo info={info} />
            <QualitySelector selected={quality} onChange={setQuality} />
            <DownloadButton
              url={url}
              quality={quality}
              downloading={downloading}
              onDownload={handleDownload}
            />
          </div>
        )}
      </div>
    </div>
  );
}
