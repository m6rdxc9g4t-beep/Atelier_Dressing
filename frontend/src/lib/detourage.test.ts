import { describe, expect, it } from "vitest";
import { couleursDuFond, couleursPrincipales, detourer, garderGrandesZones, type Pixels } from "./detourage";

/** Photo de synthèse : fond uni (légèrement bruité) et un « t-shirt » rectangulaire au centre. */
function photo(w = 120, h = 100, fond = [235, 232, 226], sujet = [30, 60, 140], bruit = 6): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  let graine = 7;
  const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * bruit;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // corps 40..80 × 30..85, manches 20..100 × 30..50
      const dansCorps = x >= 40 && x < 80 && y >= 30 && y < 85;
      const dansManches = x >= 20 && x < 100 && y >= 30 && y < 50;
      const c = dansCorps || dansManches ? sujet : fond;
      data[i] = c[0] + alea();
      data[i + 1] = c[1] + alea();
      data[i + 2] = c[2] + alea();
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe("détourage", () => {
  it("reconnaît la couleur du fond sur les bords", () => {
    const f = couleursDuFond(photo());
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f[0][0]).toBeGreaterThan(85); // fond clair (L*)
  });

  it("détoure et recadre au plus près du vêtement", () => {
    const r = detourer(photo(), { marge: 0 });
    expect(r.fiable).toBe(true);
    // 80 × 55 px de vêtement, à un pixel près (érosion / adoucissement)
    expect(Math.abs(r.pixels.width - 80)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.pixels.height - 55)).toBeLessThanOrEqual(3);
    const alpha = (x: number, y: number) => r.pixels.data[(y * r.pixels.width + x) * 4 + 3];
    expect(alpha(Math.floor(r.pixels.width / 2), Math.floor(r.pixels.height / 2))).toBe(255);
    // Coin bas-gauche : sous la manche, c'est du fond devenu transparent
    expect(alpha(2, r.pixels.height - 3)).toBeLessThan(30);
    expect(r.partFond).toBeGreaterThan(0.5);
  });

  it("donne la couleur principale du vêtement", () => {
    const r = detourer(photo());
    expect(r.couleurs[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    const [rr, , bb] = [1, 3, 5].map((i) => parseInt(r.couleurs[0].hex.slice(i, i + 2), 16));
    expect(bb).toBeGreaterThan(rr); // bleu
  });

  it("supprime les petites poussières", () => {
    const w = 20;
    const h = 20;
    const m = new Uint8Array(w * h);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 1;
    m[0] = 1; // poussière isolée
    const g = garderGrandesZones(m, w, h);
    expect(g[0]).toBe(0);
    expect(g[10 * w + 10]).toBe(1);
  });

  it("signale une photo sans fond reconnaissable", () => {
    const r = detourer(photo(60, 60, [30, 60, 140], [30, 60, 140]));
    expect(r.fiable).toBe(false);
  });

  it("couleursPrincipales ignore les pixels transparents", () => {
    const px = photo(10, 10, [255, 0, 0], [255, 0, 0], 0);
    for (let i = 3; i < px.data.length; i += 4) px.data[i] = 0;
    expect(couleursPrincipales(px)).toEqual([]);
  });
});
