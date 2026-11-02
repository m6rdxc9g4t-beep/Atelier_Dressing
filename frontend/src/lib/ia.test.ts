import { describe, expect, it } from "vitest";
import { normaliserAnalyse, normaliserSilhouette, normaliserTenues, resumeDressing } from "./ia";
import { nouveauVetement } from "./types";

describe("normalisation des réponses de l'IA", () => {
  it("nettoie l'analyse d'un vêtement", () => {
    const a = normaliserAnalyse({
      nom: "chemise en lin",
      categorie: "HAUT",
      sous_type: "Chemise",
      couleurs: [{ nom: "blanc", hex: "F5F5F0" }, { nom: "", hex: "pas une couleur" }, { hex: "#1c2541" }],
      saisons: ["ete", "été", "printemps", "ete"],
      occasions: ["quotidien", "plage"],
      longueur: "hanches",
      chaleur: 9,
      marque: "",
    });
    expect(a.nom).toBe("Chemise en lin");
    expect(a.categorie).toBe("haut");
    expect(a.sous_type).toBe("chemise");
    expect(a.couleurs).toEqual([
      { nom: "Blanc", hex: "#f5f5f0" },
      { nom: "Bleu marine", hex: "#1c2541" },
    ]);
    expect(a.saisons).toEqual(["ete", "printemps"]);
    expect(a.occasions).toEqual(["quotidien"]);
    expect(a.chaleur).toBe(5);
    expect(a.motif).toBe("uni");
  });

  it("tolère une réponse vide", () => {
    const a = normaliserAnalyse(null);
    expect(a.categorie).toBe("autre");
    expect(a.longueur).toBeNull();
    expect(a.chaleur).toBe(2);
  });

  it("ne garde que les identifiants connus dans les tenues", () => {
    const t = normaliserTenues(
      { tenues: [{ nom: "lin", pieces: ["a", "b", "zzz", "a"], explication: "Frais." }, { nom: "x", pieces: ["zzz"] }] },
      new Set(["a", "b"]),
    );
    expect(t).toEqual([{ nom: "Lin", pieces: ["a", "b"], explication: "Frais." }]);
  });

  it("borne les proportions de la silhouette", () => {
    const s = normaliserSilhouette({ morphologie: "feminine", epaules: 3, hanches: 0.5, jambes: "?", carnation: "#c68e6a", cheveux_longueur: "long" });
    expect(s).toMatchObject({ morphologie: "feminine", epaules: 1.2, hanches: 0.85, jambes: 1, carnation: "#c68e6a", cheveux_longueur: "long" });
  });

  it("résume le dressing en une ligne par pièce", () => {
    const v = nouveauVetement({ id: "x1", nom: "Jean brut", categorie: "bas", couleurs: [{ nom: "Denim", hex: "#4a6a91" }] });
    const r = resumeDressing([v, nouveauVetement({ archive: true })], new Map([["x1", "2026-07-01"]]), new Date("2026-07-11T12:00:00"));
    expect(r.split("\n")).toHaveLength(1);
    expect(r).toContain("x1 | bas | Jean brut | Denim");
    expect(r).toContain("porté il y a 10 j");
  });
});
