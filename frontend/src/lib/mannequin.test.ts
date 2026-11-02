import { describe, expect, it } from "vitest";
import { geometrie, placer, rectPiece, tailleLisible, tracer, zone } from "./mannequin";
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
