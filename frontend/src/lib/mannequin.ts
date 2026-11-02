// Géométrie du mannequin : une silhouette de face, dessinée à partir de tes
// mesures (morphologie, épaules, poitrine, taille, hanches, jambes), et les
// zones où se posent les pièces (haut, bas, chaussures, chapeau…).
//
// Repère SVG : 400 × 1000, le corps tient entre y = 40 (haut de la tête) et
// y = 960 (sous les pieds). Fonctions pures, testées dans mannequin.test.ts.

import { CATEGORIES_AVEC_LONGUEUR, longueurParDefaut } from "./categories";
import type { Ajustement, Avatar, Calage, Categorie, Longueur, Vetement } from "./types";

export const LARGEUR = 400;
export const HAUTEUR = 1000;
const HAUT = 40;
const BAS = 960;
const H = BAS - HAUT;
const CX = LARGEUR / 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Niveaux verticaux (en part de la hauteur du corps). */
interface Niveaux {
  menton: number;
  cou: number;
  epaules: number;
  poitrine: number;
  taille: number;
  hanches: number;
  entrejambe: number;
  genoux: number;
  chevilles: number;
}

/** Demi-largeurs en unités SVG. */
interface Largeurs {
  tete: number;
  cou: number;
  epaules: number;
  poitrine: number;
  taille: number;
  hanches: number;
  cuisse: number;
  genou: number;
  mollet: number;
  cheville: number;
  pied: number;
  bras: number;
  poignet: number;
}

export interface Geometrie {
  y: Record<keyof Niveaux, number>;
  l: Largeurs;
  ecartJambes: number;
}

// Demi-largeurs proches d'un vrai corps (1 cm ≈ 5,35 unités pour 1 m 72) : les
// photos de tes vêtements, mesurées à l'échelle réelle, tombent alors juste.
const BASE: Record<Avatar["morphologie"], Omit<Largeurs, "tete" | "cou" | "pied" | "poignet">> = {
  feminine: { epaules: 84, poitrine: 78, taille: 60, hanches: 88, cuisse: 42, genou: 20, mollet: 21, cheville: 11, bras: 15 },
  masculine: { epaules: 100, poitrine: 88, taille: 74, hanches: 80, cuisse: 40, genou: 22, mollet: 23, cheville: 13, bras: 19 },
  neutre: { epaules: 92, poitrine: 82, taille: 66, hanches: 84, cuisse: 41, genou: 21, mollet: 22, cheville: 12, bras: 17 },
};

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function geometrie(a: Avatar): Geometrie {
  const b = BASE[a.morphologie] ?? BASE.neutre;
  const jambes = borne(a.jambes, 0.9, 1.1);
  // Des jambes plus longues remontent l'entrejambe et les hanches.
  const decal = (jambes - 1) * 0.08;
  const r: Niveaux = {
    menton: 0.125,
    cou: 0.158,
    epaules: 0.185,
    poitrine: 0.27,
    taille: 0.385 - decal * 0.6,
    hanches: 0.485 - decal,
    entrejambe: 0.52 - decal,
    genoux: 0.735 - decal * 0.5,
    chevilles: 0.955,
  };
  const y = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, HAUT + v * H])) as Record<keyof Niveaux, number>;
  const e = borne(a.epaules, 0.8, 1.25);
  const p = borne(a.poitrine, 0.8, 1.25);
  const t = borne(a.tour_taille, 0.8, 1.3);
  const hh = borne(a.hanches, 0.8, 1.3);
  const l: Largeurs = {
    tete: 40,
    cou: a.morphologie === "masculine" ? 23 : 20,
    epaules: b.epaules * e,
    poitrine: b.poitrine * p,
    taille: b.taille * t,
    hanches: b.hanches * hh,
    cuisse: b.cuisse * (0.6 + 0.4 * hh),
    genou: b.genou,
    mollet: b.mollet,
    cheville: b.cheville,
    pied: 16,
    bras: b.bras,
    poignet: b.bras * 0.55,
  };
  // Écart entre les jambes : les deux cuisses se touchent presque à l'entrejambe.
  const ecartJambes = Math.max(4, l.hanches - 2 * l.cuisse + 2);
  return { y, l, ecartJambes };
}

type Pt = [number, number];

/** Courbe lisse (Catmull-Rom → Bézier) passant par les points. */
export function courbe(points: Pt[], fermer = false): string {
  if (points.length < 2) return "";
  const pts = fermer ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(pts[1][0])},${f(pts[1][1])}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return fermer ? d + " Z" : d;
}

export interface Trace {
  corps: string; // cou, buste et jambes
  brasGauche: string;
  brasDroit: string;
  tete: { cx: number; cy: number; rx: number; ry: number };
  cheveuxArriere: string;
  cheveuxAvant: string;
}

/** Contours SVG du mannequin. */
export function tracer(a: Avatar): Trace {
  const { y, l, ecartJambes } = geometrie(a);
  const tete = { cx: CX, cy: HAUT + 0.0625 * H, rx: l.tete, ry: 0.066 * H };
  const g = (dx: number): number => CX - dx; // côté gauche (à l'écran)
  const demi = ecartJambes / 2;
  const piedY = BAS - 4;
  const mollet = y.genoux + (y.chevilles - y.genoux) * 0.35;

  // Moitié gauche, du cou jusqu'à l'intérieur de la cheville, puis miroir.
  const gauche: Pt[] = [
    [g(l.cou), y.menton + 6],
    [g(l.cou + 1), y.cou],
    [g(l.epaules * 0.72), y.epaules - 5],
    [g(l.epaules), y.epaules + 10],
    [g(l.poitrine + 2), y.poitrine],
    [g(l.taille), y.taille],
    [g(l.hanches), y.hanches],
    [g(demi + 2 + l.cuisse * 2 - 6), y.entrejambe + 30],
    [g(demi + 4 + l.genou * 2), y.genoux],
    [g(demi + 6 + l.mollet * 2), mollet],
    [g(demi + 8 + l.cheville * 2), y.chevilles],
    [g(demi + 7 + l.pied * 2 + 2), piedY - 6],
    [g(demi + 7 + l.pied * 2), piedY],
    [g(demi + 7), piedY],
    [g(demi + 8), y.chevilles],
    [g(demi + 6), mollet],
    [g(demi + 4), y.genoux],
    [g(demi + 1), y.entrejambe + 10],
  ];
  const droite: Pt[] = gauche.map(([x, yy]) => [2 * CX - x, yy] as Pt).reverse();
  // On relie les deux jambes par l'entrejambe
  const contour: Pt[] = [...gauche, [CX, y.entrejambe], ...droite];

  const bras = (cote: 1 | -1): string => {
    const x0 = CX + cote * (l.epaules - 2);
    const poignetY = y.entrejambe + 18;
    const pts: Pt[] = [
      [x0 - cote * 4, y.epaules + 4],
      [x0 + cote * (l.bras * 0.9), y.epaules + 18],
      [x0 + cote * (l.bras * 1.15), y.taille - 10],
      [x0 + cote * (l.bras * 1.35), poignetY - 20],
      [x0 + cote * (l.bras * 1.4), poignetY + 22], // main
      [x0 + cote * (l.bras * 0.55), poignetY + 24],
      [x0 + cote * (l.bras * 0.5), poignetY - 22],
      [x0 + cote * (l.bras * 0.05), y.taille],
      [x0 - cote * 8, y.poitrine],
    ];
    return courbe(pts, true);
  };

  // Cheveux : une calotte au-dessus de la tête, plus ou moins longue derrière.
  const t = tete;
  const longueurs: Record<Avatar["cheveux_longueur"], number> = {
    rase: t.cy - t.ry * 0.25,
    court: t.cy + t.ry * 0.15,
    mi_long: y.epaules + 6,
    long: y.poitrine + 30,
  };
  const basCheveux = longueurs[a.cheveux_longueur] ?? longueurs.court;
  const largeurArriere = a.cheveux_longueur === "long" || a.cheveux_longueur === "mi_long" ? t.rx + 12 : t.rx + 4;
  const cheveuxArriere =
    a.cheveux_longueur === "rase"
      ? ""
      : courbe(
          [
            [t.cx - largeurArriere, basCheveux],
            [t.cx - t.rx - 6, t.cy - t.ry * 0.2],
            [t.cx - t.rx * 0.6, t.cy - t.ry - 6],
            [t.cx, t.cy - t.ry - 9],
            [t.cx + t.rx * 0.6, t.cy - t.ry - 6],
            [t.cx + t.rx + 6, t.cy - t.ry * 0.2],
            [t.cx + largeurArriere, basCheveux],
          ],
          true,
        );
  const frange = a.cheveux_longueur === "rase" ? 0.62 : 0.4;
  const cheveuxAvant = courbe(
    [
      [t.cx - t.rx - 2, t.cy - t.ry * 0.05],
      [t.cx - t.rx * 0.75, t.cy - t.ry * 0.85],
      [t.cx, t.cy - t.ry - 4],
      [t.cx + t.rx * 0.75, t.cy - t.ry * 0.85],
      [t.cx + t.rx + 2, t.cy - t.ry * 0.05],
      [t.cx + t.rx * 0.55, t.cy - t.ry * frange],
      [t.cx - t.rx * 0.2, t.cy - t.ry * (frange + 0.12)],
      [t.cx - t.rx * 0.8, t.cy - t.ry * (frange - 0.1)],
    ],
    true,
  );

  return { corps: courbe(contour, true), brasGauche: bras(-1), brasDroit: bras(1), tete, cheveuxArriere, cheveuxAvant };
}

/** Hauteur (y) où s'arrête une pièce selon sa longueur. */
function basSelonLongueur(g: Geometrie, longueur: Longueur): number {
  const { y } = g;
  switch (longueur) {
    case "courte":
      return y.taille;
    case "hanches":
      return y.hanches + 12;
    case "cuisses":
      return y.entrejambe + (y.genoux - y.entrejambe) * 0.45;
    case "genoux":
      return y.genoux + 12;
    case "mollets":
      return y.genoux + (y.chevilles - y.genoux) * 0.55;
    case "chevilles":
      return y.chevilles + 8;
  }
}

/** Zone (avant calage) où se pose une pièce sur le mannequin. */
export function zone(a: Avatar, categorie: Categorie, longueur: Longueur | null = null, sousType = ""): Rect {
  const g = geometrie(a);
  const { y, l } = g;
  const long = CATEGORIES_AVEC_LONGUEUR.includes(categorie) ? (longueur ?? longueurParDefaut(categorie, sousType)) : null;
  const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const centre = (demiLargeur: number, y0: number, y1: number) => rect(CX - demiLargeur, y0, CX + demiLargeur, y1);
  const teteY = HAUT + 0.0625 * H;
  const teteRy = 0.066 * H;

  switch (categorie) {
    case "haut":
      // Manches étalées à plat : la zone déborde des épaules.
      return centre(l.epaules + l.bras * 2.6, y.cou - 4, basSelonLongueur(g, long ?? "hanches"));
    case "veste":
      return centre(l.epaules + l.bras * 3, y.cou - 8, basSelonLongueur(g, long ?? "hanches") + 6);
    case "robe":
      return centre(Math.max(l.epaules + l.bras * 2, l.hanches * 1.6), y.cou - 2, basSelonLongueur(g, long ?? "genoux"));
    case "bas": {
      const fin = basSelonLongueur(g, long ?? "chevilles");
      const jupe = /jupe/i.test(sousType);
      return centre(jupe ? l.hanches * 1.35 : l.hanches * 1.12, y.taille - 6, fin);
    }
    case "chaussures":
      return centre(l.hanches * 0.95, y.chevilles - 26, BAS + 8);
    case "chapeau":
      return centre(l.tete * 1.7, teteY - teteRy - 34, teteY - teteRy * 0.15);
    case "lunettes":
      return centre(l.tete * 1.05, teteY - teteRy * 0.28, teteY + teteRy * 0.14);
    case "echarpe":
      return centre(l.epaules * 0.85, y.menton - 4, y.poitrine + 40);
    case "bijoux":
      return centre(l.cou * 2.6, y.cou - 6, y.poitrine);
    case "ceinture":
      return centre(l.taille * 1.35, y.taille + 4, y.taille + 30);
    case "sac": {
      // Porté à la main, côté droit de l'écran
      const x0 = CX + l.epaules + l.bras * 0.3;
      return rect(x0, y.taille + 10, x0 + 120, y.entrejambe + 110);
    }
    case "autre":
      return centre(l.epaules, y.epaules, y.hanches);
  }
}

/**
 * Où dessiner une photo de proportions (largeur / hauteur) dans la zone :
 * « contenu » (aucune déformation), calé en haut pour les vêtements, centré
 * pour les accessoires, puis réglage fin (échelle et décalage).
 */
export function placer(z: Rect, ratio: number, categorie: Categorie, calage: Calage): Rect {
  let w = z.w;
  let h = w / ratio;
  if (h > z.h) {
    h = z.h;
    w = h * ratio;
  }
  // Bas et robes : c'est la longueur qui compte. Une photo à plat est plus large
  // que le corps ; on la cale sur la hauteur tant qu'elle ne déborde pas trop.
  if ((categorie === "bas" || categorie === "robe") && h < z.h) {
    const hh = Math.min(z.h, z.w * 1.7 / ratio);
    if (hh > h) {
      h = hh;
      w = h * ratio;
    }
  }
  const s = borne(calage.echelle || 1, 0.3, 3);
  w *= s;
  h *= s;
  const enHaut = categorie === "haut" || categorie === "veste" || categorie === "robe" || categorie === "bas";
  const enBas = categorie === "chaussures";
  const x = z.x + (z.w - w) / 2 + calage.dx * z.w;
  const y = (enHaut ? z.y : enBas ? z.y + z.h - h : z.y + (z.h - h) / 2) + calage.dy * z.h;
  return { x, y, w, h };
}

/**
 * Repères mesurés sur la photo détourée (fractions de la boîte du vêtement) :
 * ligne et largeur des épaules, largeur du buste sous les manches, largeur de la ceinture.
 */
export interface Reperes {
  /** Hauteur de la ligne d'épaules (0 = haut du col, 1 = bas du vêtement). */
  ligneEpaules: number | null;
  /** Largeur à la ligne d'épaules. */
  epaules: number | null;
  /** Largeur du buste seul (quand les manches sont détachées du corps), sinon null. */
  tronc: number | null;
  ceinture: number | null;
  /** La photo n'est pas détourée (fond conservé) : pas de mesure possible. */
  opaque: boolean;
  /** Boîte du vêtement dans la photo (fractions), pour convertir les repères. */
  boite: { x: number; y: number; w: number; h: number } | null;
}

/** Mesure les repères à partir du canal alpha (0-255) d'une photo w × h. */
export function reperesDepuisAlpha(alpha: ArrayLike<number>, w: number, h: number): Reperes {
  const plein = (x: number, y: number) => alpha[y * w + x] > 128;
  const ext: [number, number][] = [];
  let top = -1;
  let bot = -1;
  let x0 = w;
  let x1 = -1;
  let pleins = 0;
  for (let y = 0; y < h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++) {
      if (plein(x, y)) {
        pleins++;
        if (a < 0) a = x;
        b = x;
      }
    }
    ext.push([a, b]);
    if (a >= 0) {
      if (top < 0) top = y;
      bot = y;
      x0 = Math.min(x0, a);
      x1 = Math.max(x1, b);
    }
  }
  const opaque = pleins > w * h * 0.97;
  const vide: Reperes = { ligneEpaules: null, epaules: null, tronc: null, ceinture: null, opaque, boite: null };
  if (top < 0 || opaque) return vide;
  const H = bot - top + 1;
  const W = x1 - x0 + 1;
  const ligne = (p: number) => Math.min(bot, Math.round(top + p * H));
  const largeur = (p: number) => {
    const [a, b] = ext[ligne(p)];
    return a >= 0 ? (b - a + 1) / W : 0;
  };
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const mediane = (l: number[]) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];

  // Ligne d'épaules : là où le vêtement atteint 85 % de sa plus grande largeur dans le haut (40 %)
  let maxHaut = 0;
  for (let p = 0; p <= 0.4; p += 0.01) maxHaut = Math.max(maxHaut, largeur(p));
  let ligneEpaules = 0.15;
  for (let p = 0.02; p <= 0.4; p += 0.01) {
    if (largeur(p) >= 0.85 * maxHaut) {
      ligneEpaules = p;
      break;
    }
  }

  // Buste seul : morceau qui contient le milieu, entre 50 % et 70 % de la hauteur
  const cx = Math.round(x0 + W / 2);
  const morceauCentre = (y: number) => {
    let a = cx;
    let b = cx;
    if (!plein(cx, y)) return 0;
    while (a > 0 && plein(a - 1, y)) a--;
    while (b < w - 1 && plein(b + 1, y)) b++;
    return (b - a + 1) / W;
  };
  const centres: number[] = [];
  for (let p = 0.5; p <= 0.7; p += 0.02) centres.push(morceauCentre(ligne(p)));
  const tronc = mediane(centres);

  const ceinture: number[] = [];
  for (let p = 0; p <= 0.03; p += 0.005) ceinture.push(largeur(p));

  return {
    ligneEpaules: r3(ligneEpaules),
    epaules: r3(largeur(ligneEpaules)),
    // Manches détachées du corps : le buste est nettement plus étroit que la photo
    tronc: tronc > 0.2 && tronc < 0.75 ? r3(tronc) : null,
    ceinture: r3(mediane(ceinture)),
    opaque,
    boite: { x: x0 / w, y: top / h, w: W / w, h: H / h },
  };
}

/** Une photo à plat montre la moitié du tour : vue de face, un bas paraît ~35 % plus long que large. */
const ALLONGEMENT_BAS = 1.35;

/** Pose une pièce pour qu'un segment de la photo (fractions) tombe sur un segment du corps. */
function caler(ratio: number, gx1: number, gx2: number, gy: number, cible: { gauche: number; droite: number; y: number }): Rect {
  const w = (cible.droite - cible.gauche) / Math.max(0.05, gx2 - gx1);
  const h = w / ratio;
  return { x: cible.gauche - gx1 * w, y: cible.y - gy * h, w, h };
}

/**
 * Rectangle d'une pièce à l'échelle réelle.
 * 1. Repères donnés par l'IA (Claude) à la reconnaissance : points d'épaules, de ceinture, ourlet.
 * 2. Sinon, repères mesurés sur la photo détourée.
 * 3. Sinon (photo non détourée, accessoires), null : la pièce remplit sa zone.
 */
export function rectReel(
  a: Avatar,
  v: Pick<Vetement, "categorie" | "longueur" | "sous_type"> & { ajustement?: Ajustement | null },
  ratio: number,
  r: Reperes | null,
): Rect | null {
  const g = geometrie(a);
  const { y, l } = g;
  const longueur = CATEGORIES_AVEC_LONGUEUR.includes(v.categorie) ? (v.longueur ?? longueurParDefaut(v.categorie, v.sous_type)) : null;
  const haut = v.categorie === "haut" || v.categorie === "veste" || v.categorie === "robe";
  const aisance = v.categorie === "veste" ? 1.08 : 1.03;
  // Épaules du corps, bras compris : là où se trouvent les coutures d'épaule d'un vêtement porté
  const epaulesCorps = { gauche: CX - (l.epaules + l.bras * 0.8) * aisance, droite: CX + (l.epaules + l.bras * 0.8) * aisance, y: y.epaules - 2 };
  const tailleCorps = { gauche: CX - l.taille * 1.1, droite: CX + l.taille * 1.1, y: y.taille - 4 };

  // Allonge un bas pour qu'il tombe à sa longueur (vue de face), dans des limites raisonnables
  const allonger = (rect: Rect, haut01: number, bas01: number): Rect => {
    if (!longueur) return rect;
    const voulue = basSelonLongueur(g, longueur) - (rect.y + haut01 * rect.h);
    const h = borne(voulue / Math.max(0.2, bas01 - haut01), rect.h, rect.h * 1.6);
    return { ...rect, y: rect.y - haut01 * (h - rect.h), h };
  };

  const aj = v.ajustement;
  if (haut && aj?.epaules) {
    return caler(ratio, aj.epaules.gauche, aj.epaules.droite, aj.epaules.y, epaulesCorps);
  }
  if (v.categorie === "bas" && aj?.ceinture) {
    const rect = caler(ratio, aj.ceinture.gauche, aj.ceinture.droite, aj.ceinture.y, tailleCorps);
    return allonger(rect, aj.ceinture.y, aj.ourlet ?? 1);
  }

  if (!r || r.opaque || !r.boite) return null;
  const b = r.boite;
  // Repères mesurés (fractions de la boîte) → fractions de la photo entière
  const enX = (f: number) => b.x + f * b.w;
  const enY = (f: number) => b.y + f * b.h;
  if (haut && r.ligneEpaules != null && r.epaules) {
    const gy = enY(r.ligneEpaules);
    if (r.tronc) {
      // Manches détachées : on cale le buste sur la poitrine, la ligne d'épaules sur les épaules
      const largeurBuste = 2 * l.poitrine * (v.categorie === "veste" ? 1.18 : 1.1);
      const w = largeurBuste / (r.tronc * b.w);
      const h = w / ratio;
      return { x: CX - (enX(0.5)) * w, y: epaulesCorps.y - gy * h, w, h };
    }
    return caler(ratio, enX(0.5 - r.epaules / 2), enX(0.5 + r.epaules / 2), gy, epaulesCorps);
  }
  if (v.categorie === "bas" && r.ceinture && r.ceinture > 0.2) {
    const rect = caler(ratio, enX(0.5 - r.ceinture / 2), enX(0.5 + r.ceinture / 2), enY(0), tailleCorps);
    return longueur ? allonger(rect, enY(0), enY(1)) : { ...rect, h: rect.h * ALLONGEMENT_BAS };
  }
  if (v.categorie === "chaussures") {
    // La paire couvre les deux pieds, posée au sol
    const w = ((g.ecartJambes / 2 + 7 + l.pied * 2 + 8) * 2) / b.w;
    const h = w / ratio;
    return { x: CX - enX(0.5) * w, y: BAS + 4 - enY(1) * h, w, h };
  }
  return null;
}

/** Rectangle final d'une pièce sur le mannequin (échelle réelle si possible, puis calage). */
export function rectPiece(
  a: Avatar,
  v: Pick<Vetement, "categorie" | "longueur" | "sous_type" | "calage"> & { ajustement?: Ajustement | null },
  ratio: number,
  reperes: Reperes | null = null,
): Rect {
  const z = zone(a, v.categorie, v.longueur, v.sous_type);
  const reel = rectReel(a, v, ratio, reperes);
  if (!reel) return placer(z, ratio, v.categorie, v.calage);
  const s = borne(v.calage.echelle || 1, 0.3, 3);
  const w = reel.w * s;
  const h = reel.h * s;
  return { x: reel.x + (reel.w - w) / 2 + v.calage.dx * z.w, y: reel.y + v.calage.dy * z.h, w, h };
}

/** Taille lisible : 172 → « 1 m 72 ». */
export function tailleLisible(cm: number): string {
  const m = Math.floor(cm / 100);
  return `${m} m ${String(Math.round(cm - m * 100)).padStart(2, "0")}`;
}
