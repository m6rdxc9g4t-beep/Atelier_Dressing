// Détourage automatique d'une photo de vêtement, sans IA et hors ligne.
//
// Le vêtement est posé à plat (ou suspendu) devant un fond plutôt uni : drap,
// parquet, mur. On estime les couleurs du fond sur le bord de la photo, on
// « remplit » depuis les bords tout ce qui leur ressemble, puis on garde la ou
// les grandes zones restantes : c'est le vêtement. Les trous intérieurs (anse de
// sac, entre les bretelles) restent opaques s'ils ne touchent pas le bord.
//
// Fonctions pures sur des pixels RGBA : testées sans navigateur (detourage.test.ts).

import { rgbVersHex, rgbVersLab } from "./couleurs";

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface OptionsDetourage {
  /** Écart de couleur (ΔE Lab) toléré pour le fond. 10 = strict, 35 = large. */
  tolerance: number;
  /** Marge autour du vêtement après recadrage, en part du côté le plus long. */
  marge: number;
}

export const OPTIONS_DETOURAGE: OptionsDetourage = { tolerance: 20, marge: 0.03 };

export interface ResultatDetourage {
  pixels: Pixels;
  /** Part de la photo reconnue comme fond (0-1). */
  partFond: number;
  /** Le détourage semble correct (fond reconnu, un vêtement net au milieu). */
  fiable: boolean;
  /** Couleurs principales du vêtement, de la plus présente à la moins présente. */
  couleurs: { hex: string; part: number }[];
}

type Lab = [number, number, number];

function labDe(data: Uint8ClampedArray, i: number): Lab {
  return rgbVersLab(data[i], data[i + 1], data[i + 2]);
}

/** k-moyennes simple sur des couleurs Lab (déterministe). */
export function kMoyennes(points: Lab[], k: number, iterations = 8): { centre: Lab; taille: number }[] {
  if (!points.length) return [];
  const tries = [...points].sort((a, b) => a[0] - b[0]);
  const centres: Lab[] = [];
  for (let c = 0; c < k; c++) centres.push([...tries[Math.floor(((c + 0.5) / k) * tries.length)]] as Lab);
  let tailles = new Array(k).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sommes = centres.map(() => [0, 0, 0]);
    tailles = new Array(k).fill(0);
    for (const p of points) {
      let m = 0;
      let dm = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - centres[c][0]) ** 2 + (p[1] - centres[c][1]) ** 2 + (p[2] - centres[c][2]) ** 2;
        if (d < dm) {
          dm = d;
          m = c;
        }
      }
      sommes[m][0] += p[0];
      sommes[m][1] += p[1];
      sommes[m][2] += p[2];
      tailles[m]++;
    }
    for (let c = 0; c < k; c++) {
      if (tailles[c]) centres[c] = [sommes[c][0] / tailles[c], sommes[c][1] / tailles[c], sommes[c][2] / tailles[c]];
    }
  }
  return centres.map((centre, i) => ({ centre, taille: tailles[i] })).filter((c) => c.taille > 0);
}

/** Couleurs du fond, estimées sur une bande le long des bords. */
export function couleursDuFond(px: Pixels): Lab[] {
  const { width: w, height: h, data } = px;
  const bande = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const pas = Math.max(1, Math.round((w + h) / 400));
  const points: Lab[] = [];
  for (let y = 0; y < h; y += pas) {
    for (let x = 0; x < w; x += pas) {
      if (x >= bande && x < w - bande && y >= bande && y < h - bande) continue;
      points.push(labDe(data, (y * w + x) * 4));
    }
  }
  const groupes = kMoyennes(points, 3);
  const total = points.length;
  // On ignore les petits groupes : un coin de vêtement qui touche le bord, une ombre.
  return groupes.filter((g) => g.taille / total >= 0.12).map((g) => g.centre);
}

/** Masque du fond : 1 = fond relié au bord, 0 = sujet. */
export function masqueFond(px: Pixels, tolerance: number): Uint8Array {
  const { width: w, height: h, data } = px;
  const fonds = couleursDuFond(px);
  const n = w * h;
  const proche = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const lab = labDe(data, p * 4);
    for (const f of fonds) {
      if ((lab[0] - f[0]) ** 2 + (lab[1] - f[1]) ** 2 + (lab[2] - f[2]) ** 2 < tolerance * tolerance) {
        proche[p] = 1;
        break;
      }
    }
    // Pixel déjà transparent (PNG détouré importé) : c'est du fond.
    if (data[p * 4 + 3] < 16) proche[p] = 1;
  }
  const fond = new Uint8Array(n);
  const file = new Int32Array(n);
  let debut = 0;
  let fin = 0;
  const pousser = (p: number) => {
    if (proche[p] && !fond[p]) {
      fond[p] = 1;
      file[fin++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    pousser(x);
    pousser((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    pousser(y * w);
    pousser(y * w + w - 1);
  }
  while (debut < fin) {
    const p = file[debut++];
    const x = p % w;
    if (x > 0) pousser(p - 1);
    if (x < w - 1) pousser(p + 1);
    if (p >= w) pousser(p - w);
    if (p < n - w) pousser(p + w);
  }
  return fond;
}

/** Garde les grandes zones du sujet (supprime les poussières et petits reflets). */
export function garderGrandesZones(sujet: Uint8Array, w: number, h: number, partMin = 0.15): Uint8Array<ArrayBuffer> {
  const n = w * h;
  const etiquette = new Int32Array(n);
  const tailles: number[] = [0];
  const file = new Int32Array(n);
  let courante = 0;
  for (let s = 0; s < n; s++) {
    if (!sujet[s] || etiquette[s]) continue;
    courante++;
    let debut = 0;
    let fin = 0;
    file[fin++] = s;
    etiquette[s] = courante;
    let taille = 0;
    while (debut < fin) {
      const p = file[debut++];
      taille++;
      const x = p % w;
      const voisins = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const v of voisins) {
        if (v >= 0 && v < n && sujet[v] && !etiquette[v]) {
          etiquette[v] = courante;
          file[fin++] = v;
        }
      }
    }
    tailles.push(taille);
  }
  const plusGrande = Math.max(0, ...tailles);
  const seuil = Math.max(plusGrande * partMin, n * 0.004);
  const garde = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (etiquette[p] && tailles[etiquette[p]] >= seuil) garde[p] = 1;
  return garde;
}

/** Érosion puis dilatation d'un pixel : enlève la frange d'ombre autour du sujet. */
function ouvrir(m: Uint8Array, w: number, h: number): Uint8Array<ArrayBuffer> {
  const passe = (src: Uint8Array, garder: (somme: number) => boolean): Uint8Array<ArrayBuffer> => {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let somme = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && xx < w && yy >= 0 && yy < h) somme += src[yy * w + xx];
          }
        }
        dst[y * w + x] = garder(somme) ? 1 : 0;
      }
    }
    return dst;
  };
  const erode = passe(m, (s) => s >= 9 - 1); // tolère un voisin manquant
  return passe(erode, (s) => s >= 1);
}

/** Couleurs principales des pixels opaques (k-moyennes), regroupées si proches. */
export function couleursPrincipales(px: Pixels, max = 3): { hex: string; part: number }[] {
  const { data, width: w, height: h } = px;
  const pas = Math.max(1, Math.round(Math.sqrt((w * h) / 6000)));
  const points: Lab[] = [];
  const rgbs: [number, number, number][] = [];
  for (let y = 0; y < h; y += pas) {
    for (let x = 0; x < w; x += pas) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      points.push(labDe(data, i));
      rgbs.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!points.length) return [];
  const groupes = kMoyennes(points, 4);
  // Couleur moyenne en RGB de chaque groupe
  const sommes = groupes.map(() => [0, 0, 0, 0]);
  points.forEach((p, i) => {
    let m = 0;
    let dm = Infinity;
    groupes.forEach((g, gi) => {
      const d = (p[0] - g.centre[0]) ** 2 + (p[1] - g.centre[1]) ** 2 + (p[2] - g.centre[2]) ** 2;
      if (d < dm) {
        dm = d;
        m = gi;
      }
    });
    sommes[m][0] += rgbs[i][0];
    sommes[m][1] += rgbs[i][1];
    sommes[m][2] += rgbs[i][2];
    sommes[m][3]++;
  });
  const total = points.length;
  const brutes = sommes
    .map((s, i) => ({ lab: groupes[i].centre, rgb: [s[0] / s[3], s[1] / s[3], s[2] / s[3]] as const, part: s[3] / total }))
    .filter((c) => c.part > 0)
    .sort((a, b) => b.part - a.part);
  // Fusionne les nuances très proches (ombre / lumière du même tissu)
  const fusion: typeof brutes = [];
  for (const c of brutes) {
    const proche = fusion.find((f) => Math.hypot(f.lab[0] - c.lab[0], f.lab[1] - c.lab[1], f.lab[2] - c.lab[2]) < 14);
    if (proche) proche.part += c.part;
    else fusion.push({ ...c });
  }
  return fusion
    .filter((c) => c.part >= 0.08)
    .slice(0, max)
    .map((c) => ({ hex: rgbVersHex(c.rgb[0], c.rgb[1], c.rgb[2]), part: Math.round(c.part * 100) / 100 }));
}

/** Détoure, adoucit le contour et recadre au plus près du vêtement. */
export function detourer(px: Pixels, options: Partial<OptionsDetourage> = {}): ResultatDetourage {
  const { tolerance, marge } = { ...OPTIONS_DETOURAGE, ...options };
  const { width: w, height: h, data } = px;
  const n = w * h;
  const fond = masqueFond(px, tolerance);
  let sujet = new Uint8Array(n);
  for (let p = 0; p < n; p++) sujet[p] = fond[p] ? 0 : 1;
  sujet = ouvrir(sujet, w, h);
  sujet = garderGrandesZones(sujet, w, h);

  let nbSujet = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!sujet[y * w + x]) continue;
      nbSujet++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const partFond = 1 - nbSujet / n;
  const fiable = nbSujet > n * 0.03 && partFond > 0.12;
  if (!nbSujet) {
    return { pixels: { data: new Uint8ClampedArray(data), width: w, height: h }, partFond, fiable: false, couleurs: [] };
  }

  // Alpha adouci : moyenne 3×3 du masque (contour d'un demi-pixel)
  const alpha = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
            s += sujet[yy * w + xx];
            c++;
          }
        }
      }
      alpha[y * w + x] = sujet[y * w + x] ? Math.round((255 * s) / c) : Math.round((255 * s) / c / 3);
    }
  }

  const m = Math.round(Math.max(w, h) * marge);
  const cx0 = Math.max(0, x0 - m);
  const cy0 = Math.max(0, y0 - m);
  const cx1 = Math.min(w - 1, x1 + m);
  const cy1 = Math.min(h - 1, y1 + m);
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;
  const sortie = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const src = (cy0 + y) * w + (cx0 + x);
      const dst = (y * cw + x) * 4;
      sortie[dst] = data[src * 4];
      sortie[dst + 1] = data[src * 4 + 1];
      sortie[dst + 2] = data[src * 4 + 2];
      sortie[dst + 3] = Math.min(data[src * 4 + 3], alpha[src]);
    }
  }
  const pixels = { data: sortie, width: cw, height: ch };
  return { pixels, partFond, fiable, couleurs: couleursPrincipales(pixels) };
}
