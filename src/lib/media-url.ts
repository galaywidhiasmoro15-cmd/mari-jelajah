/**
 * Normalisasi URL media yang dimasukkan guru.
 * Banyak guru menempel tautan halaman (Google Drive, Dropbox, GitHub, Imgur,
 * YouTube) yang bukan tautan langsung ke berkas, sehingga gambar gagal dimuat.
 * Fungsi di bawah mengubahnya menjadi tautan langsung bila polanya dikenali.
 */

function withScheme(url: string): string {
  const clean = url.trim().replace(/[.,;:!?]+$/, "");
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function driveId(url: string): string | null {
  const m1 = url.match(/drive\.google\.com\/file\/d\/([-\w]{10,})/i);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([-\w]{10,})/i);
  if (m2 && /drive\.google\.com|docs\.google\.com/i.test(url)) return m2[1];
  return null;
}

/** Ubah tautan halaman menjadi tautan langsung gambar bila memungkinkan. */
export function normalizeImageUrl(raw: string | null | undefined): string {
  const url = withScheme(raw ?? "");
  if (!url) return "";

  const gid = driveId(url);
  if (gid) return `https://drive.google.com/thumbnail?id=${gid}&sz=w1600`;

  if (/dropbox\.com/i.test(url)) {
    return url.replace(/[?&]dl=\d/i, "").replace(/[?&]raw=\d/i, "") + (url.includes("?") ? "&raw=1" : "?raw=1");
  }

  if (/github\.com\/[^/]+\/[^/]+\/blob\//i.test(url)) {
    return url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
  }

  const imgur = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+)$/i);
  if (imgur) return `https://i.imgur.com/${imgur[1]}.jpeg`;

  return url;
}

export type VideoSource =
  | { kind: "embed"; url: string }
  | { kind: "file"; url: string }
  | { kind: "link"; url: string };

/** Kenali sumber video: YouTube/Vimeo (embed), berkas mp4/webm, atau tautan biasa. */
export function normalizeVideoUrl(raw: string | null | undefined): VideoSource | null {
  const url = withScheme(raw ?? "");
  if (!url) return null;

  const yt =
    url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([-\w]{6,})/i);
  if (yt) return { kind: "embed", url: `https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1` };

  const vimeo = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeo) return { kind: "embed", url: `https://player.vimeo.com/video/${vimeo[1]}` };

  const gid = driveId(url);
  if (gid) return { kind: "embed", url: `https://drive.google.com/file/d/${gid}/preview` };

  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(url)) return { kind: "file", url };

  return { kind: "link", url };
}

/** Deteksi apakah sebuah URL kemungkinan besar adalah gambar langsung. */
export function looksLikeImageUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/.test(path) || /drive\.google\.com\/thumbnail/i.test(url);
}
