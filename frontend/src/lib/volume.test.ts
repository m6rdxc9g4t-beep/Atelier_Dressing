import { describe, expect, it } from "vitest";
import { decalages, decaler, envelopper, facteurCorps, mailler, morceaux, profondeurs, union } from "./volume";

/** Masque w × h avec un rectangle plein [x0, x1] × [y0, y1]. */
function rectangle(w: number, h: number, x0: number, x1: number, y0: number, y1: number) {
  const m = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
  return m;
}

describe("volumes 3D", () => {
  it("découpe une rangée en morceaux", () => {
    const m = new Uint8Array([0, 1, 1, 0, 1, 0]);
    expect(morceaux(m, 6, 0)).toEqual([
      [1, 2],
      [4, 4],
    ]);
  });

  it("donne une demi-ellipse par morceau, nulle sur les bords gauche et droit", () => {
    const c = profondeurs(rectangle(20, 4, 5, 14, 0, 3), 20, 4, () => 1);
    const W = 21;
    const rangee = Array.from({ length: W }, (_, i) => c.z[2 * W + i]);
    expect(rangee[5]).toBe(0);
    expect(rangee[15]).toBe(0);
    expect(rangee[10]).toBeCloseTo(5, 5); // centre : demi-largeur 5, facteur 1
    expect(rangee[7]).toBeLessThan(rangee[10]);
    expect(rangee[4]).toBe(0);
    expect(c.dedans[2 * W + 4]).toBe(0);
  });

  it("garde des jambes rondes et un buste plus plat", () => {
    expect(facteurCorps(35)).toBe(1);
    expect(facteurCorps(90)).toBeCloseTo(0.62, 2);
  });

  it("met le vêtement par-dessus le corps : le mannequin est dedans", () => {
    const w = 40;
    const h = 30;
    const corps = profondeurs(rectangle(w, h, 12, 27, 0, h - 1), w, h);
    const veste = profondeurs(rectangle(w, h, 6, 33, 0, 20), w, h);
    const env = envelopper(veste, corps, 1.5);
    for (let k = 0; k < env.z.length; k++) {
      if (env.dedans[k] && corps.z[k] > 0) expect(env.z[k]).toBeGreaterThanOrEqual(corps.z[k] + 0.9 - 1e-6);
    }
    // Hors du corps (manches larges), le vêtement garde un volume propre
    const W = w + 1;
    expect(env.z[10 * W + 8]).toBeGreaterThan(0);
  });

  it("assemble plusieurs parties du corps", () => {
    const a = profondeurs(rectangle(10, 2, 0, 3, 0, 1), 10, 2);
    const b = profondeurs(rectangle(10, 2, 6, 9, 0, 1), 10, 2);
    const u = union([a, b]);
    expect(u.dedans.reduce((s, v) => s + v, 0)).toBe(a.dedans.reduce((s, v) => s + v, 0) + b.dedans.reduce((s, v) => s + v, 0));
  });

  it("maille l'avant et l'arrière", () => {
    const w = 8;
    const h = 6;
    const m = rectangle(w, h, 2, 5, 1, 4);
    const c = profondeurs(m, w, h);
    const g = mailler(m, c, 4);
    // 16 cases × 2 triangles × 2 faces × 3, plus les parois du pourtour (16 bords × 2 triangles × 3)
    expect(g.indices.length).toBe(16 * 12 + 16 * 6);
    expect(g.nAvant).toBe(16 * 6);
    expect(g.positions.length / 3).toBe((g.uvs.length / 2));
    // La face arrière est derrière : z négatif ou nul
    const n = g.positions.length / 3;
    for (let s = n / 2; s < n; s++) expect(g.positions[s * 3 + 2]).toBeLessThanOrEqual(0);
    // Le haut de la grille est en haut (y le plus grand)
    expect(Math.max(...Array.from({ length: n }, (_, s) => g.positions[s * 3 + 1]))).toBeCloseTo((h - 1) * 4 * 0.001, 6);
  });

  it("recentre les jambes du pantalon sur les jambes du corps", () => {
    const w = 40;
    const h = 10;
    const corps = new Uint8Array(w * h);
    const pantalon = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 12; x <= 17; x++) corps[y * w + x] = 1; // jambe gauche, centre 14,5
      for (let x = 22; x <= 27; x++) corps[y * w + x] = 1; // jambe droite, centre 24,5
      for (let x = 6; x <= 15; x++) pantalon[y * w + x] = 1; // centre 10,5 : 4 cases trop à gauche
      for (let x = 24; x <= 33; x++) pantalon[y * w + x] = 1; // centre 28,5 : 4 trop à droite
    }
    const d = decalages(pantalon, corps, w, h);
    expect(d.filter((x) => x.rangee === 5).map((x) => x.dx)).toEqual([4, -4]);
    const m = decaler(pantalon, w, d);
    // Les deux jambes se sont rapprochées du corps : elles occupent 10 → 29
    expect(morceaux(m, w, 5)).toEqual([[10, 29]]);
    expect(m.reduce((s, v) => s + v, 0)).toBe(pantalon.reduce((s, v) => s + v, 0));
  });

  it("ne touche pas une rangée d'un seul morceau", () => {
    const w = 10;
    const m = new Uint8Array(w).fill(1);
    expect(decalages(m, m, w, 1)).toEqual([]);
  });
});
