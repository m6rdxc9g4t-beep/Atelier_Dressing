// Couleurs des vêtements : conversion, distance perçue, nom le plus proche et
// harmonie d'une tenue (neutres + une couleur d'accent au plus).

import type { Couleur } from "./types";

export const PALETTE: Couleur[] = [
  { nom: "Noir", hex: "#141414" },
  { nom: "Blanc", hex: "#f7f7f5" },
  { nom: "Écru", hex: "#eee6d3" },
  { nom: "Gris clair", hex: "#c4c4c4" },
  { nom: "Gris", hex: "#8a8a8a" },
  { nom: "Anthracite", hex: "#3d3f42" },
  { nom: "Beige", hex: "#d8c3a0" },
  { nom: "Camel", hex: "#b88552" },
  { nom: "Marron", hex: "#6b4429" },
  { nom: "Kaki", hex: "#6f6a3e" },
  { nom: "Vert", hex: "#3f8f4f" },
  { nom: "Vert sapin", hex: "#1f4a37" },
  { nom: "Bleu marine", hex: "#1c2541" },
  { nom: "Bleu", hex: "#2f62c8" },
  { nom: "Bleu ciel", hex: "#9cc7ec" },
  { nom: "Denim", hex: "#4a6a91" },
  { nom: "Rouge", hex: "#c8242f" },
  { nom: "Bordeaux", hex: "#6e1a2b" },
  { nom: "Rose", hex: "#e2689b" },
  { nom: "Rose poudré", hex: "#e8c0c3" },
  { nom: "Orange", hex: "#e87a2c" },
  { nom: "Jaune", hex: "#f1cf3b" },
  { nom: "Moutarde", hex: "#c99a2e" },
  { nom: "Violet", hex: "#6d3fa0" },
  { nom: "Lilas", hex: "#b9a3dc" },
  { nom: "Doré", hex: "#c9a54a" },
  { nom: "Argenté", hex: "#b8bcc2" },
];

/** Couleurs qui vont avec tout. */
const NOMS_NEUTRES = new Set([
  "noir", "blanc", "écru", "ecru", "gris", "gris clair", "anthracite", "beige", "camel", "marron",
  "bleu marine", "marine", "denim", "kaki", "doré", "argenté", "crème", "taupe", "chocolat",
]);

export function hexValide(hex: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(hex.trim());
}

export function normaliserHex(hex: string): string {
  const h = hex.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) return "#" + h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(h) ? "#" + h : "#888888";
}

export function hexVersRgb(hex: string): [number, number, number] {
  const h = normaliserHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbVersHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

/** sRGB → CIE Lab (D65). */
export function rgbVersLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function distanceLab(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Nom de la couleur de la palette la plus proche. */
export function nomCouleur(hex: string): string {
  const lab = rgbVersLab(...hexVersRgb(hex));
  let meilleur = PALETTE[0];
  let d = Infinity;
  for (const c of PALETTE) {
    const dc = distanceLab(lab, rgbVersLab(...hexVersRgb(c.hex)));
    if (dc < d) {
      d = dc;
      meilleur = c;
    }
  }
  return meilleur.nom;
}

/** Une couleur neutre (noir, blanc, gris, beige, marine, denim…) va avec tout. */
export function estNeutre(c: Couleur): boolean {
  if (NOMS_NEUTRES.has(c.nom.trim().toLowerCase())) return true;
  const [r, g, b] = hexVersRgb(c.hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return s < 0.18 || l < 0.12 || l > 0.93;
}

/** Teinte en degrés (0-360). */
export function teinte(hex: string): number {
  const [r, g, b] = hexVersRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h;
}

const ecartTeinte = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Harmonie d'une tenue, de 0 à 1.
 * Les neutres vont avec tout ; deux couleurs vives passent si elles sont de la
 * même famille (≤ 35°) ou complémentaires (≈ 180°) ; au-delà de deux accents, ça se gâte.
 */
export function harmonie(couleursParPiece: Couleur[][]): number {
  const accents: string[] = [];
  for (const couleurs of couleursParPiece) {
    const principale = couleurs[0];
    if (principale && !estNeutre(principale)) accents.push(principale.hex);
  }
  if (accents.length <= 1) return 1;
  let score = 1;
  for (let i = 0; i < accents.length; i++) {
    for (let j = i + 1; j < accents.length; j++) {
      const e = ecartTeinte(teinte(accents[i]), teinte(accents[j]));
      if (e <= 35) score -= 0.05;
      else if (e >= 150) score -= 0.15;
      else score -= 0.4;
    }
  }
  if (accents.length > 2) score -= 0.2 * (accents.length - 2);
  return Math.max(0, Math.min(1, score));
}
