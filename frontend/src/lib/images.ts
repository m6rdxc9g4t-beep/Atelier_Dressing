// Photos : lecture (orientation de l'appareil respectée), réduction, passage en
// pixels pour le détourage, retour en fichier, base64 pour l'IA.

import type { Pixels } from "./detourage";

export async function bitmapDe(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    // Safari ancien : on passe par un <img>
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toile(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Le navigateur ne peut pas traiter cette photo.");
  return [c, ctx];
}

/** Dimensions réduites pour que le plus grand côté fasse au plus `max`. */
export function reduire(w: number, h: number, max: number): [number, number] {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

export async function versPixels(source: Blob, max = 900): Promise<Pixels> {
  const bmp = await bitmapDe(source);
  const [w, h] = reduire(bmp.width, bmp.height, max);
  const [, ctx] = toile(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, w, h);
  return { data: d.data, width: w, height: h };
}

function enBlob(c: HTMLCanvasElement, type: string, qualite?: number): Promise<Blob> {
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Photo illisible"))), type, qualite));
}

/** Pixels → fichier image avec transparence (WebP si possible, sinon PNG). */
export async function pixelsVersBlob(px: Pixels): Promise<Blob> {
  const [c, ctx] = toile(px.width, px.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  const webp = await enBlob(c, "image/webp", 0.9);
  return webp.type === "image/webp" ? webp : enBlob(c, "image/png");
}

/** Photo d'origine allégée (JPEG), gardée pour pouvoir refaire le détourage. */
export async function reduireEnJpeg(source: Blob, max = 1400, qualite = 0.85): Promise<Blob> {
  const bmp = await bitmapDe(source);
  const [w, h] = reduire(bmp.width, bmp.height, max);
  const [c, ctx] = toile(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return enBlob(c, "image/jpeg", qualite);
}

export async function blobVersBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  const tranche = 0x8000;
  for (let i = 0; i < buf.length; i += tranche) bin += String.fromCharCode(...buf.subarray(i, i + tranche));
  return btoa(bin);
}

/** Image prête pour l'IA : JPEG ≤ 1024 px sur fond blanc (les modèles lisent mal la transparence). */
export async function imagePourIA(source: Blob, max = 1024): Promise<{ media_type: string; data: string }> {
  const bmp = await bitmapDe(source);
  const [w, h] = reduire(bmp.width, bmp.height, max);
  const [c, ctx] = toile(w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { media_type: "image/jpeg", data: await blobVersBase64(await enBlob(c, "image/jpeg", 0.85)) };
}

/** Recadrage carré (visage) : zoom ≥ 1, centre en part de l'image (0-1). */
export async function recadrerCarre(source: Blob, zoom: number, cx: number, cy: number, cote = 320): Promise<Blob> {
  const bmp = await bitmapDe(source);
  const base = Math.min(bmp.width, bmp.height) / Math.max(1, zoom);
  const sx = Math.min(bmp.width - base, Math.max(0, cx * bmp.width - base / 2));
  const sy = Math.min(bmp.height - base, Math.max(0, cy * bmp.height - base / 2));
  const [c, ctx] = toile(cote, cote);
  ctx.drawImage(bmp, sx, sy, base, base, 0, 0, cote, cote);
  bmp.close?.();
  return enBlob(c, "image/jpeg", 0.9);
}

/** Largeur / hauteur d'une image. */
export async function ratioDe(source: Blob): Promise<number> {
  const bmp = await bitmapDe(source);
  const r = bmp.width / Math.max(1, bmp.height);
  bmp.close?.();
  return r;
}
