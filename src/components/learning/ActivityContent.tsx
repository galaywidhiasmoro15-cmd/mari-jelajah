import { useEffect, useState } from "react";
import { RichText } from "@/lib/rich-text";
import { normalizeImageUrl, normalizeVideoUrl } from "@/lib/media-url";
import { ImageOff, ExternalLink } from "lucide-react";

/** Gambar dengan normalisasi URL + fallback informatif bila gagal dimuat. */
export function SmartImage({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const url = normalizeImageUrl(src);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => setState("loading"), [url]);

  if (!url) return null;

  if (state === "error") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <ImageOff className="h-4 w-4" /> Gambar tidak dapat ditampilkan di sini
        </div>
        <p className="mt-1">
          Sumber gambar menolak diakses dari aplikasi. Buka langsung untuk melihatnya:
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 font-semibold underline break-all"
        >
          <ExternalLink className="h-3 w-3" /> {url}
        </a>
      </div>
    );
  }

  return (
    <div className="relative">
      {state === "loading" && (
        <div className="absolute inset-0 grid place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">
          Memuat gambar…
        </div>
      )}
      <img
        src={url}
        alt={alt || "Gambar pembelajaran"}
        referrerPolicy="no-referrer"
        className={className || "w-full rounded-lg object-contain"}
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
      />
    </div>
  );
}

/** Pemutar video: YouTube/Vimeo/Drive (embed), berkas mp4, atau tautan biasa. */
export function SmartVideo({ src }: { src: string }) {
  const v = normalizeVideoUrl(src);
  if (!v) return null;
  if (v.kind === "embed") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={v.url}
          title="Video pembelajaran"
          className="h-full w-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (v.kind === "file") {
    return <video src={v.url} controls playsInline className="w-full rounded-lg bg-black" />;
  }
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 underline break-all"
    >
      <ExternalLink className="h-4 w-4" /> Buka video
    </a>
  );
}

export function MateriText({ text }: { text: string }) {
  return <RichText text={text} className="prose prose-sm max-w-none rounded-lg bg-slate-50 p-3 leading-relaxed" />;
}
