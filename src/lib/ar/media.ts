/**
 * Ekstraksi media dari teks materi/soal.
 * Mendukung: markdown gambar ![alt](url), markdown link [teks](url), dan URL polos.
 * URL gambar -> ditampilkan sebagai bidang gambar 3D di samping panel.
 * URL model (.glb/.gltf) -> dimuat sebagai objek 3D di atas panel.
 */

const URL_RE = /(!\[[^\]]*\]\(([^)\s]+)\))|(\[[^\]]+\]\(([^)\s]+)\))|((?:https?:\/\/|www\.)[^\s<)]+)/gi;

export type ARMedia = {
  text: string;
  images: string[];
  models: string[];
  links: string[];
};

function normalize(url: string) {
  const clean = url.replace(/[.,;:!?]+$/, "");
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

export function extractARMedia(raw: string | null | undefined): ARMedia {
  const text = raw ?? "";
  const images: string[] = [];
  const models: string[] = [];
  const links: string[] = [];

  const stripped = text.replace(URL_RE, (_m, _img, imgUrl, _lnk, lnkUrl, bare) => {
    const url = normalize(imgUrl || lnkUrl || bare || "");
    if (!url) return "";
    const path = url.split(/[?#]/)[0].toLowerCase();
    if (imgUrl || /\.(png|jpe?g|webp|gif|avif|bmp)$/.test(path)) {
      if (!images.includes(url)) images.push(url);
    } else if (/\.(glb|gltf)$/.test(path)) {
      if (!models.includes(url)) models.push(url);
    } else {
      if (!links.includes(url)) links.push(url);
    }
    return "";
  });

  return {
    text: stripped.replace(/[ \t]{2,}/g, " ").trim(),
    images,
    models,
    links,
  };
}
