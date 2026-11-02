import { describe, expect, it } from "vitest";
import { consigneEssayage, dimensions, memesPieces, piecesPourEssayage, PIECES_MAX } from "./essayage";
import { nouveauVetement } from "./types";

const veste = nouveauVetement({ id: "v", nom: "Veste en jean noir col cuir", categorie: "veste", image: "v.webp", couleurs: [{ nom: "Noir", hex: "#1e1e1f" }], matiere: "denim", marque: "HUGO", longueur: "hanches" });
const pantalon = nouveauVetement({ id: "p", nom: "Pantalon à pinces", categorie: "bas", image: "p.webp", couleurs: [{ nom: "Noir", hex: "#1e1e1f" }] });
const sac = nouveauVetement({ id: "s", nom: "Sac", categorie: "sac", image: "s.webp" });
const sansPhoto = nouveauVetement({ id: "x", categorie: "haut" });

describe("essayage réaliste", () => {
  it("ordonne les pièces : vêtements d'abord, accessoires ensuite, sans les pièces sans photo", () => {
    expect(piecesPourEssayage([sac, pantalon, sansPhoto, veste]).map((v) => v.id)).toEqual(["v", "p", "s"]);
    const beaucoup = Array.from({ length: 10 }, (_, i) => nouveauVetement({ id: "b" + i, categorie: "bijoux", image: "b.webp" }));
    expect(piecesPourEssayage(beaucoup)).toHaveLength(PIECES_MAX);
  });

  it("décrit chaque pièce et garde le reste de la tenue de la personne", () => {
    const c = consigneEssayage([veste, pantalon]);
    expect(c).toContain('image 2 is the jacket or coat, worn open or closed as in its photo "Veste en jean noir col cuir" (noir #1e1e1f, denim, hip length, brand HUGO)');
    expect(c).toContain("image 3 is the bottoms");
    expect(c).toContain("Keep the person's own top and shoes."); // le haut sous la veste
    expect(c).toContain("Keep the person from image 1 exactly");
    expect(consigneEssayage([veste])).toContain("Keep the person's own top and bottoms and shoes.");
  });

  it("calcule des dimensions d'environ 1 mégapixel, multiples de 16", () => {
    const d = dimensions(2 / 3);
    expect(d.largeur % 16).toBe(0);
    expect(d.hauteur % 16).toBe(0);
    expect(d.largeur / d.hauteur).toBeCloseTo(2 / 3, 1);
    expect(d.largeur * d.hauteur).toBeGreaterThan(900_000);
    expect(d.largeur * d.hauteur).toBeLessThan(1_150_000);
  });

  it("compare des ensembles de pièces", () => {
    expect(memesPieces(["a", "b"], ["b", "a"])).toBe(true);
    expect(memesPieces(["a"], ["a", "b"])).toBe(false);
  });
});
