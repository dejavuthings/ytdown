"use client";

interface UrlInputProps {
  url: string;
  onChange: (url: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function UrlInput({ url, onChange, onSubmit, loading }: UrlInputProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
      <div className="flex-1 relative">
        <input
          type="text"
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && onSubmit()}
          placeholder="YouTube URL을 붙여넣으세요"
          className="apple-input"
          disabled={loading}
        />
      </div>
      <button
        onClick={onSubmit}
        disabled={loading || !url.trim()}
        className="apple-btn flex items-center justify-center gap-2 whitespace-nowrap w-full sm:w-auto"
      >
        {loading ? (
          <>
            <span className="spinner" />
            <span>조회 중</span>
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>조회</span>
          </>
        )}
      </button>
    </div>
  );
}
