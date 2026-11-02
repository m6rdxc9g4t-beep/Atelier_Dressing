import { describe, expect, it } from "vitest";
import { piecesPourHF } from "./essayage";
import { jetonValide, messageHF, typeEssai } from "./hf";
import { nouveauVetement } from "./types";

describe("Hugging Face", () => {
  it("sait quelles pièces Leffa peut poser", () => {
    expect(typeEssai("haut")).toBe("upper_body");
    expect(typeEssai("veste")).toBe("upper_body");
    expect(typeEssai("bas")).toBe("lower_body");
    expect(typeEssai("robe")).toBe("dresses");
    expect(typeEssai("chaussures")).toBeNull();
    expect(typeEssai("sac")).toBeNull();
  });

  it("pose le bas, puis le haut, puis la veste par-dessus, sans les accessoires", () => {
    const veste = nouveauVetement({ id: "v", categorie: "veste", image: "v.webp" });
    const tshirt = nouveauVetement({ id: "t", categorie: "haut", image: "t.webp" });
    const pantalon = nouveauVetement({ id: "p", categorie: "bas", image: "p.webp" });
    const sac = nouveauVetement({ id: "s", categorie: "sac", image: "s.webp" });
    const sansPhoto = nouveauVetement({ id: "x", categorie: "haut" });
    expect(piecesPourHF([veste, sac, tshirt, sansPhoto, pantalon]).map((v) => v.id)).toEqual(["p", "t", "v"]);
  });

  it("reconnaît un jeton", () => {
    expect(jetonValide("hf_" + "a".repeat(34))).toBe(true);
    expect(jetonValide(" hf_" + "B1".repeat(17) + " ")).toBe(true);
    expect(jetonValide("sk-ant-123")).toBe(false);
    expect(jetonValide("")).toBe(false);
  });

  it("traduit les erreurs de quota avec le délai", () => {
    const m = messageHF("You have exceeded your ZeroGPU quota (180s requested vs. 166s left). Try again in 23:34:02.");
    expect(m).toContain("quota GPU gratuit");
    expect(m).toContain("23 h 34 min");
    expect(messageHF("Failed to fetch")).toBe("Pas de connexion avec Hugging Face.");
  });
});
