import { describe, expect, it } from "vitest";
import { estNeutre, harmonie, nomCouleur, normaliserHex, teinte } from "./couleurs";

const c = (nom: string, hex: string) => ({ nom, hex });

describe("couleurs", () => {
  it("normalise les codes hexadécimaux", () => {
    expect(normaliserHex("FFF")).toBe("#ffffff");
    expect(normaliserHex("#1A2b3C")).toBe("#1a2b3c");
    expect(normaliserHex("rouge")).toBe("#888888");
  });

  it("nomme la couleur la plus proche", () => {
    expect(nomCouleur("#101010")).toBe("Noir");
    expect(nomCouleur("#1d2643")).toBe("Bleu marine");
    expect(nomCouleur("#c52530")).toBe("Rouge");
  });

  it("reconnaît les neutres", () => {
    expect(estNeutre(c("Bleu marine", "#1c2541"))).toBe(true);
    expect(estNeutre(c("Gris", "#8a8a8a"))).toBe(true);
    expect(estNeutre(c("?", "#f5f5f0"))).toBe(true);
    expect(estNeutre(c("Rouge", "#c8242f"))).toBe(false);
  });

  it("calcule la teinte", () => {
    expect(Math.round(teinte("#ff0000"))).toBe(0);
    expect(Math.round(teinte("#00ff00"))).toBe(120);
  });

  it("note l'harmonie d'une tenue", () => {
    const neutres = harmonie([[c("Blanc", "#fff")], [c("Denim", "#4a6a91")], [c("Noir", "#111")]]);
    const unAccent = harmonie([[c("Rouge", "#c8242f")], [c("Denim", "#4a6a91")]]);
    const camaieu = harmonie([[c("Rose", "#e2689b")], [c("Bordeaux", "#9e2350")]]);
    const choc = harmonie([[c("Jaune", "#f1cf3b")], [c("Vert", "#3f8f4f")], [c("Rose", "#e2689b")]]);
    expect(neutres).toBe(1);
    expect(unAccent).toBe(1);
    expect(camaieu).toBeGreaterThan(0.9);
    expect(choc).toBeLessThan(0.5);
  });
});
