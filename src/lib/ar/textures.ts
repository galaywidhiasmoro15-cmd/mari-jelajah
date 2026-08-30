import * as THREE from "three";

/**
 * Panel edukasi dirender sebagai tekstur canvas lalu dipasang pada bidang 3D,
 * sehingga panel menjadi objek dunia (punya position.x/y/z) — bukan overlay CSS.
 */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function textureFromCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function makePanelTexture(opts: {
  title: string;
  body: string;
  accent: string;
  footer?: string;
}): { texture: THREE.CanvasTexture; aspect: number } {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(6, 46, 34, 0.92)";
  roundRect(ctx, 8, 8, w - 16, h - 16, 36);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = opts.accent;
  ctx.stroke();

  ctx.fillStyle = opts.accent;
  roundRect(ctx, 8, 8, w - 16, 96, 36);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const titleLines = wrapText(ctx, opts.title, w - 120, 1);
  ctx.fillText(titleLines[0] ?? "", 48, 60);

  ctx.font = "34px system-ui, sans-serif";
  ctx.fillStyle = "rgba(236, 253, 245, 0.95)";
  const bodyLines = wrapText(ctx, opts.body || "", w - 110, 9);
  bodyLines.forEach((line, i) => ctx.fillText(line, 52, 175 + i * 48));

  if (opts.footer) {
    ctx.font = "italic 28px system-ui, sans-serif";
    ctx.fillStyle = "rgba(167, 243, 208, 0.9)";
    ctx.fillText(opts.footer, 52, h - 56);
  }

  return { texture: textureFromCanvas(canvas), aspect: w / h };
}

export function makeButtonTexture(
  label: string,
  variant: "choice" | "primary" | "neutral" = "choice",
): THREE.CanvasTexture {
  const w = 640;
  const h = 160;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const bg =
    variant === "primary" ? "#10b981" : variant === "neutral" ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.94)";
  const fg = variant === "choice" ? "#064e3b" : "#ffffff";
  ctx.fillStyle = bg;
  roundRect(ctx, 6, 6, w - 12, h - 12, 40);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = variant === "choice" ? "rgba(16,185,129,0.7)" : "rgba(255,255,255,0.7)";
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px system-ui, sans-serif";
  const lines = wrapText(ctx, label, w - 80, 2);
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 50));
  return textureFromCanvas(canvas);
}

export function makeLabelTexture(title: string, sub: string, accent: string): THREE.CanvasTexture {
  const w = 768;
  const h = 224;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(2, 25, 18, 0.82)";
  roundRect(ctx, 6, 6, w - 12, h - 12, 60);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.fillText(wrapText(ctx, title, w - 80, 1)[0] ?? "", w / 2, 84);
  ctx.font = "40px system-ui, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(sub, w / 2, 156);
  return textureFromCanvas(canvas);
}
