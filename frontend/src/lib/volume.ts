// Volumes 3D du mannequin et des vêtements, à partir de silhouettes 2D.
//
// Principe : chaque silhouette (le corps, chaque bras, chaque vêtement posé à l'échelle
// réelle) est découpée en rangées horizontales. Sur chaque rangée, chaque morceau plein
// devient une demi-ellipse en profondeur : une cuisse, un bras, un buste prennent du volume.
// Un vêtement est ensuite une enveloppe un peu plus large que ce qu'il recouvre (corps,
// puis vêtements du dessous) : le mannequin est *dans* le vêtement, et on peut tourner autour.
// La face avant porte la photo de face, la face arrière la photo de dos.
//
// Fonctions pures sur des grilles (testées dans volume.test.ts) ; le rendu est dans
// components/Vue3D.tsx (three.js).

/** Grille de sommets (w + 1) × (h + 1) posée sur un masque de w × h cases. */
export interface Champ {
  w: number;
  h: number;
  /** Demi-profondeur de chaque sommet (0 hors de la silhouette). */
  z: Float32Array;
  /** Sommet touché par la silhouette. */
  dedans: Uint8Array;
}

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Profondeur relative d'un corps selon la demi-largeur du morceau : jambes et bras ronds, buste plus plat. */
export function facteurCorps(R: number): number {
  return 1.0 - 0.38 * borne((R - 40) / 30, 0, 1);
}

/** Morceaux pleins d'une rangée du masque : [début, fin] en cases, inclus. */
export function morceaux(masque: Uint8Array, w: number, rangee: number): [number, number][] {
  const out: [number, number][] = [];
  let debut = -1;
  for (let x = 0; x <= w; x++) {
    const plein = x < w && masque[rangee * w + x] > 0;
    if (plein && debut < 0) debut = x;
    if (!plein && debut >= 0) {
      out.push([debut, x - 1]);
      debut = -1;
    }
  }
  return out;
}

/**
 * Demi-profondeurs aux sommets : chaque morceau de rangée est une demi-ellipse de demi-largeur R
 * et de demi-profondeur facteur(R) × R ; un sommet prend le plus grand des deux rangées voisines.
 * Les sommets du bord gauche / droit d'un morceau sont à 0 : l'avant et l'arrière s'y rejoignent.
 */
export function profondeurs(masque: Uint8Array, w: number, h: number, facteur: (R: number) => number = facteurCorps, echelle = 1): Champ {
  const W = w + 1;
  const z = new Float32Array(W * (h + 1));
  const dedans = new Uint8Array(W * (h + 1));
  for (let r = 0; r < h; r++) {
    for (const [a, b] of morceaux(masque, w, r)) {
      const R = (b + 1 - a) / 2;
      const f = facteur(R * echelle);
      for (let i = a; i <= b + 1; i++) {
        const d = Math.min(i - a, b + 1 - i);
        const zz = f * Math.sqrt(Math.max(0, R * R - (R - d) * (R - d)));
        for (const j of [r, r + 1]) {
          const k = j * W + i;
          dedans[k] = 1;
          if (zz > z[k]) z[k] = zz;
        }
      }
    }
  }
  return { w, h, z, dedans };
}

/** Le plus grand de plusieurs champs (le corps entier : buste, bras…). */
export function union(champs: Champ[]): Champ {
  const { w, h } = champs[0];
  const z = new Float32Array((w + 1) * (h + 1));
  const dedans = new Uint8Array(z.length);
  for (const c of champs) {
    for (let k = 0; k < z.length; k++) {
      if (c.z[k] > z[k]) z[k] = c.z[k];
      if (c.dedans[k]) dedans[k] = 1;
    }
  }
  return { w, h, z, dedans };
}

/** Lissage 3 × 3 sur les sommets d'une silhouette (les sommets du dehors ne bougent pas). */
export function lisser(c: Champ, passes: number): Float32Array {
  const W = c.w + 1;
  const H = c.h + 1;
  let z = c.z;
  for (let p = 0; p < passes; p++) {
    const n = new Float32Array(z);
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        if (!c.dedans[k] || z[k] === 0) continue;
        let s = 0;
        let m = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const kk = k + dj * W + di;
            if (c.dedans[kk]) {
              s += z[kk];
              m++;
            }
          }
        }
        n[k] = s / m;
      }
    }
    z = n;
  }
  return z;
}

/**
 * Enveloppe d'un vêtement : au-dessus de ce qu'il recouvre (corps et vêtements du dessous),
 * avec une aisance ; là où il dépasse du corps (manches larges, jambes amples, jupe), il garde
 * son propre volume, plus plat. Lissé pour éviter les marches au bord du corps.
 */
export function envelopper(vetement: Champ, dessous: Champ, aisance: number, aplati = 0.4): Champ {
  const { w, h } = vetement;
  const z = new Float32Array(vetement.z.length);
  for (let k = 0; k < z.length; k++) {
    if (!vetement.dedans[k]) continue;
    const propre = vetement.z[k] * aplati;
    z[k] = dessous.z[k] > 0 ? Math.max(dessous.z[k] + aisance, propre) : propre;
  }
  const brut: Champ = { w, h, z, dedans: vetement.dedans };
  const lisse = lisser(brut, 2);
  // Jamais sous le corps après lissage : le mannequin reste dedans
  for (let k = 0; k < z.length; k++) {
    if (vetement.dedans[k] && dessous.z[k] > 0) lisse[k] = Math.max(lisse[k], dessous.z[k] + aisance * 0.6);
  }
  return { w, h, z: lisse, dedans: vetement.dedans };
}

export interface Maillage {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Nombre d'indices de la face avant (les suivants sont la face arrière). */
  nAvant: number;
}

/**
 * Maillage avant + arrière d'une silhouette : une case pleine = deux triangles devant,
 * deux derrière (sens inversé). Repère : x de -L/2 à L/2, y vers le haut, z vers l'avant ;
 * une case = `pas` unités du repère SVG (400 × 1000), ramené à l'échelle `unite`.
 */
export function mailler(masque: Uint8Array, c: Champ, pas: number, unite = 0.001, arriere = 0.92): Maillage {
  const { w, h } = c;
  const W = w + 1;
  const L = w * pas;
  const Ht = h * pas;
  const idx = new Int32Array(W * (h + 1)).fill(-1);
  const pos: number[] = [];
  const uv: number[] = [];
  let n = 0;
  for (let k = 0; k < W * (h + 1); k++) {
    if (!c.dedans[k]) continue;
    idx[k] = n++;
    const i = k % W;
    const j = Math.floor(k / W);
    const x = i * pas;
    const y = j * pas;
    pos.push((x - L / 2) * unite, (Ht - y) * unite, c.z[k] * pas * unite);
    uv.push(x / L, 1 - y / Ht);
  }
  // Face arrière : mêmes sommets, profondeur négative
  const nAvantSommets = n;
  for (let s = 0; s < nAvantSommets; s++) {
    pos.push(pos[s * 3], pos[s * 3 + 1], -pos[s * 3 + 2] * arriere);
    uv.push(uv[s * 2], uv[s * 2 + 1]);
  }
  const avant: number[] = [];
  const dos: number[] = [];
  const o = nAvantSommets;
  const plein = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && masque[j * w + i] > 0;
  // Paroi entre l'avant et l'arrière le long d'un bord (u → v) : le volume est fermé
  const paroi = (u: number, v: number) => dos.push(u, v, v + o, u, v + o, u + o);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!masque[j * w + i]) continue;
      const a = idx[j * W + i];
      const b = idx[j * W + i + 1];
      const cc = idx[(j + 1) * W + i + 1];
      const d = idx[(j + 1) * W + i];
      if (a < 0 || b < 0 || cc < 0 || d < 0) continue;
      // Devant : sens trigonométrique vu de face (z+)
      avant.push(a, d, cc, a, cc, b);
      dos.push(a + o, cc + o, d + o, a + o, b + o, cc + o);
      if (!plein(i - 1, j)) paroi(a, d);
      if (!plein(i + 1, j)) paroi(cc, b);
      if (!plein(i, j - 1)) paroi(b, a);
      if (!plein(i, j + 1)) paroi(d, cc);
    }
  }
  return {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    indices: new Uint32Array([...avant, ...dos]),
    nAvant: avant.length,
  };
}

/** Alpha (0-255) d'une image RGBA → masque 0/1. */
export function masqueDepuisAlpha(data: Uint8ClampedArray, seuil = 128): Uint8Array {
  const m = new Uint8Array(data.length / 4);
  for (let p = 0; p < m.length; p++) m[p] = data[p * 4 + 3] >= seuil ? 1 : 0;
  return m;
}

/** Un morceau de rangée à déplacer horizontalement (en cases). */
export interface Decalage {
  rangee: number;
  a: number;
  b: number;
  dx: number;
}

/**
 * Recentre les jambes d'un pantalon sur les jambes du corps, et les manches sur les bras :
 * sur chaque rangée où le vêtement et le corps ont le même nombre de morceaux (2 jambes,
 * ou manche + buste + manche), le morceau de gauche et celui de droite se recentrent sur
 * ceux du corps. Les décalages sont lissés d'une rangée à l'autre (pas de déchirure).
 */
export function decalages(vet: Uint8Array, corps: Uint8Array, w: number, h: number, max = 12, lissage = 4): Decalage[] {
  const G = new Float32Array(h);
  const D = new Float32Array(h);
  const actif = new Uint8Array(h);
  const runs: [number, number][][] = [];
  const centre = ([a, b]: [number, number]) => (a + b) / 2;
  for (let r = 0; r < h; r++) {
    const g = morceaux(vet, w, r);
    const c = morceaux(corps, w, r);
    runs.push(g);
    if (g.length >= 2 && g.length === c.length) {
      G[r] = Math.max(-max, Math.min(max, centre(c[0]) - centre(g[0])));
      D[r] = Math.max(-max, Math.min(max, centre(c[c.length - 1]) - centre(g[g.length - 1])));
      actif[r] = 1;
    }
  }
  const moyenne = (t: Float32Array, r: number) => {
    let s = 0;
    let n = 0;
    for (let k = r - lissage; k <= r + lissage; k++) {
      if (k >= 0 && k < h && actif[k]) {
        s += t[k];
        n++;
      }
    }
    return n ? s / n : 0;
  };
  const out: Decalage[] = [];
  for (let r = 0; r < h; r++) {
    const g = runs[r];
    if (g.length < 2) continue;
    // Rangées sans correspondance (une manche seule…) : on prolonge le décalage des voisines
    const dg = Math.round(moyenne(G, r));
    const dd = Math.round(moyenne(D, r));
    if (dg) out.push({ rangee: r, a: g[0][0], b: g[0][1], dx: dg });
    if (dd) out.push({ rangee: r, a: g[g.length - 1][0], b: g[g.length - 1][1], dx: dd });
  }
  return out;
}

/** Applique les décalages à un masque. */
export function decaler(masque: Uint8Array, w: number, liste: Decalage[]): Uint8Array {
  const m = new Uint8Array(masque);
  for (const d of liste) for (let x = d.a; x <= d.b; x++) m[d.rangee * w + x] = 0;
  for (const d of liste) {
    for (let x = d.a; x <= d.b; x++) {
      const nx = x + d.dx;
      if (nx >= 0 && nx < w) m[d.rangee * w + nx] = 1;
    }
  }
  return m;
}
