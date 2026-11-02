import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DepotLocal } from "./depot-local";
import { maintenant, nouveauVetement, type Tenue } from "./types";

describe("dépôt local (IndexedDB)", () => {
  it("enregistre, relit et supprime", async () => {
    const d = new DepotLocal("test-" + Math.random());
    const v = nouveauVetement({ nom: "Jean", categorie: "bas", image: "jean.webp" });
    await d.ecrireVetement(v);
    await d.ecrireImage("jean.webp", new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
    const t: Tenue = { id: "t1", nom: "Du jour", pieces: [v.id, "autre"], occasion: null, saisons: [], note: "", favori: false, cree_le: maintenant(), maj_le: maintenant() };
    await d.ecrireTenue(t);

    let g = await d.charger();
    expect(g.vetements.map((x) => x.nom)).toEqual(["Jean"]);
    expect(g.profil.avatar.taille_cm).toBe(172);
    const img = await d.lireImage("jean.webp");
    expect(img?.type).toBe("image/webp");
    expect(img?.size).toBe(3);

    await d.supprimerVetement(v.id);
    g = await d.charger();
    expect(g.vetements).toEqual([]);
    expect(g.tenues[0].pieces).toEqual(["autre"]);
    expect(await d.lireImage("jean.webp")).toBeNull();
  });
});
