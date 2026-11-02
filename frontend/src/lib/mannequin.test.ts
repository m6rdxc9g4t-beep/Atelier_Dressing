import { describe, expect, it } from "vitest";
import { geometrie, placer, rectPiece, rectReel, reperesDepuisAlpha, tailleLisible, tracer, zone } from "./mannequin";
import { AVATAR_DEFAUT, CALAGE_NEUTRE } from "./types";

describe("mannequin", () => {
  it("dessine des contours SVG valides", () => {
    const t = tracer(AVATAR_DEFAUT);
    expect(t.corps).toMatch(/^M[\d.]+,[\d.]+ C.* Z$/);
    expect(t.corps).not.toContain("NaN");
    expect(t.brasGauche).not.toContain("NaN");
    expect(t.cheveuxArriere).not.toContain("NaN");
    expect(tracer({ ...AVATAR_DEFAUT, cheveux_longueur: "rase" }).cheveuxArriere).toBe("");
  });

  it("suit les mesures : hanches plus larges, épaules plus étroites", () => {
    const base = geometrie(AVATAR_DEFAUT);
    const autre = geometrie({ ...AVATAR_DEFAUT, hanches: 1.2, epaules: 0.85 });
    expect(autre.l.hanches).toBeGreaterThan(base.l.hanches);
    expect(autre.l.epaules).toBeLessThan(base.l.epaules);
    // Des jambes plus longues remontent les hanches
    expect(geometrie({ ...AVATAR_DEFAUT, jambes: 1.08 }).y.hanches).toBeLessThan(base.y.hanches);
  });

  it("place les zones dans le bon ordre vertical", () => {
    const chapeau = zone(AVATAR_DEFAUT, "chapeau");
    const haut = zone(AVATAR_DEFAUT, "haut");
    const bas = zone(AVATAR_DEFAUT, "bas");
    const pieds = zone(AVATAR_DEFAUT, "chaussures");
    expect(chapeau.y).toBeLessThan(haut.y);
    expect(haut.y).toBeLessThan(bas.y);
    expect(bas.y + bas.h).toBeLessThanOrEqual(pieds.y + pieds.h);
    expect(pieds.y + pieds.h).toBeGreaterThan(950);
  });

  it("raccourcit une jupe aux genoux par rapport à un pantalon", () => {
    const jupe = zone(AVATAR_DEFAUT, "bas", "genoux", "jupe");
    const pantalon = zone(AVATAR_DEFAUT, "bas", null, "jean");
    expect(jupe.y + jupe.h).toBeLessThan(pantalon.y + pantalon.h);
    expect(jupe.w).toBeGreaterThan(pantalon.w);
  });

  it("pose une photo sans la déformer, puis applique le calage", () => {
    const z = { x: 100, y: 100, w: 200, h: 100 };
    const r = placer(z, 1, "haut", CALAGE_NEUTRE);
    expect(r).toEqual({ x: 150, y: 100, w: 100, h: 100 });
    const decale = placer(z, 1, "haut", { echelle: 1.5, dx: 0.1, dy: -0.1 });
    expect(decale.w).toBe(150);
    expect(decale.x).toBe(100 + (200 - 150) / 2 + 20);
    expect(decale.y).toBe(90);
    // Les chaussures se calent en bas de la zone
    expect(placer(z, 4, "chaussures", CALAGE_NEUTRE).y).toBe(150);
  });

  it("calcule le rectangle d'une pièce", () => {
    const r = rectPiece(AVATAR_DEFAUT, { categorie: "chaussures", longueur: null, sous_type: "baskets", calage: CALAGE_NEUTRE }, 2);
    expect(r.w / r.h).toBeCloseTo(2);
  });

  it("écrit la taille", () => {
    expect(tailleLisible(172)).toBe("1 m 72");
    expect(tailleLisible(205)).toBe("2 m 05");
  });
});

describe("pièces à l'échelle réelle", () => {
  /** Alpha synthétique : un pantalon (ceinture 60 % de la largeur, jambes qui s'écartent). */
  function pantalon(w = 100, h = 190) {
    const a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const demi = 30 + (20 * y) / h;
      for (let x = 0; x < w; x++) if (Math.abs(x - w / 2) <= demi) a[y * w + x] = 255;
    }
    return a;
  }

  /** Un t-shirt à plat, manches écartées : buste de 50 %, manches entre 12 et 30 % de la hauteur. */
  function tshirt(w = 200, h = 180) {
    const a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const buste = Math.abs(x - w / 2) <= 50 && y >= 8;
        const col = Math.abs(x - w / 2) <= 30 && y < 8;
        const manches = y >= 18 && y <= 54 && Math.abs(x - w / 2) <= 100;
        if (buste || col || manches) a[y * w + x] = 255;
      }
    }
    return a;
  }

  it("mesure la ceinture d'un bas", () => {
    const r = reperesDepuisAlpha(pantalon(), 100, 190);
    expect(r.opaque).toBe(false);
    expect(r.ceinture!).toBeGreaterThan(0.58);
    expect(r.ceinture!).toBeLessThan(0.66);
    expect(reperesDepuisAlpha(new Uint8Array(100).fill(255), 10, 10).opaque).toBe(true);
  });

  it("trouve la ligne d'épaules et le buste d'un t-shirt à plat", () => {
    const r = reperesDepuisAlpha(tshirt(), 200, 180);
    expect(r.ligneEpaules!).toBeGreaterThan(0.05);
    expect(r.ligneEpaules!).toBeLessThan(0.15);
    expect(r.tronc!).toBeCloseTo(0.505, 1); // manches détachées : le buste seul
  });

  it("cale la ceinture sur la taille et descend aux chevilles", () => {
    const r = reperesDepuisAlpha(pantalon(), 100, 190);
    const v = { categorie: "bas" as const, longueur: null, sous_type: "pantalon", calage: CALAGE_NEUTRE };
    const rect = rectPiece(AVATAR_DEFAUT, v, 100 / 190, r);
    const g = geometrie(AVATAR_DEFAUT);
    expect(rect.w * r.ceinture! * r.boite!.w).toBeCloseTo(2 * g.l.taille * 1.1, 0);
    expect(rect.y).toBeCloseTo(g.y.taille - 4, 0);
    expect(rect.y + rect.h).toBeGreaterThan(g.y.genoux);
  });

  it("pose les coutures d'épaules données par l'IA sur les épaules du corps", () => {
    const g = geometrie(AVATAR_DEFAUT);
    const v = {
      categorie: "veste" as const,
      longueur: null,
      sous_type: "veste",
      calage: CALAGE_NEUTRE,
      ajustement: { epaules: { y: 0.2, gauche: 0.2, droite: 0.8 } },
    };
    const rect = rectPiece(AVATAR_DEFAUT, v, 0.9, null);
    const gauche = rect.x + 0.2 * rect.w;
    const droite = rect.x + 0.8 * rect.w;
    expect((gauche + droite) / 2).toBeCloseTo(200, 0);
    expect(droite - gauche).toBeGreaterThan(2 * g.l.epaules);
    expect(rect.y + 0.2 * rect.h).toBeCloseTo(g.y.epaules - 2, 0);
  });

  it("revient à la zone sans repères (photo non détourée)", () => {
    const v = { categorie: "bas" as const, longueur: null, sous_type: "", calage: CALAGE_NEUTRE };
    const opaque = { ligneEpaules: null, epaules: null, tronc: null, ceinture: null, opaque: true, boite: null };
    expect(rectReel(AVATAR_DEFAUT, v, 0.5, opaque)).toBeNull();
  });
});
