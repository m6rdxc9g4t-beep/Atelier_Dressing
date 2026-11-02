import { describe, expect, it } from "vitest";
import { besoinVeste, chaleurVisee, derniersPorts, nettoyerTenue, notePiece, proposerTenue } from "./suggestion";
import { nouveauVetement, type Port, type Vetement } from "./types";

const v = (id: string, p: Partial<Vetement>): Vetement => nouveauVetement({ id, nom: id, ...p });
const blanc = [{ nom: "Blanc", hex: "#f7f7f5" }];
const denim = [{ nom: "Denim", hex: "#4a6a91" }];

const dressing: Vetement[] = [
  v("tshirt", { categorie: "haut", chaleur: 2, couleurs: blanc, saisons: ["ete", "printemps"] }),
  v("pull", { categorie: "haut", chaleur: 4, couleurs: [{ nom: "Gris", hex: "#8a8a8a" }], saisons: ["hiver", "automne"] }),
  v("jean", { categorie: "bas", chaleur: 3, couleurs: denim }),
  v("short", { categorie: "bas", chaleur: 1, couleurs: [{ nom: "Beige", hex: "#d8c3a0" }], saisons: ["ete"] }),
  v("baskets", { categorie: "chaussures", couleurs: blanc }),
  v("manteau", { categorie: "veste", chaleur: 5, couleurs: [{ nom: "Camel", hex: "#b88552" }] }),
  v("ancien", { categorie: "haut", archive: true }),
];

const ete = new Date("2026-07-14T12:00:00");
const hiver = new Date("2026-01-14T12:00:00");

describe("suggestions sans IA", () => {
  it("vise la bonne chaleur", () => {
    expect(chaleurVisee(30)).toBe(1);
    expect(chaleurVisee(15)).toBe(3);
    expect(chaleurVisee(-2)).toBe(5);
    expect(chaleurVisee(null)).toBe(3);
    expect(besoinVeste(12)).toBe(true);
    expect(besoinVeste(22, true)).toBe(true);
    expect(besoinVeste(22)).toBe(false);
  });

  it("exclut les pièces archivées", () => {
    expect(notePiece(dressing[6], { temperature: 20, occasion: null }, undefined)).toBe(0);
  });

  it("habille léger en été et chaudement en hiver", () => {
    const e = proposerTenue(dressing, [], { temperature: 29, occasion: null, graine: 1 }, ete)!;
    expect(e.pieces).toContain("tshirt");
    expect(e.pieces).not.toContain("manteau");
    expect(e.pieces).toContain("baskets");
    const h = proposerTenue(dressing, [], { temperature: 2, occasion: null, graine: 1 }, hiver)!;
    expect(h.pieces).toContain("pull");
    expect(h.pieces).toContain("manteau");
    expect(h.pieces).toContain("jean");
  });

  it("garde les pièces imposées", () => {
    const p = proposerTenue(dressing, [], { temperature: 29, occasion: null, imposees: ["jean"], graine: 3 }, ete)!;
    expect(p.pieces).toContain("jean");
    expect(p.pieces).not.toContain("short");
  });

  it("calcule la dernière date de port", () => {
    const ports: Port[] = [
      { id: "1", porte_le: "2026-07-01", tenue_id: null, pieces: ["jean"], note: "", cree_le: "" },
      { id: "2", porte_le: "2026-07-10", tenue_id: null, pieces: ["jean", "tshirt"], note: "", cree_le: "" },
    ];
    expect(derniersPorts(ports).get("jean")).toBe("2026-07-10");
  });

  it("nettoie une tenue incohérente", () => {
    const robe = v("robe", { categorie: "robe" });
    expect(nettoyerTenue(["tshirt", "robe", "jean", "baskets", "inconnu"], [...dressing, robe])).toEqual(["robe", "baskets"]);
    expect(nettoyerTenue(["tshirt", "pull", "jean"], dressing)).toEqual(["tshirt", "jean"]);
  });
});
