// Génère les icônes PNG de l'app à partir de public/icone.svg.
// Usage : npm install --no-save sharp && node scripts/icones.mjs
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const arrondi = await readFile(new URL("../public/icone.svg", import.meta.url), "utf8");
// Version carrée (iPhone arrondit lui-même les coins ; zone de sécurité Android)
const carre = arrondi.replace(' rx="230"', "");

const sorties = [
  [carre, "apple-touch-icon.png", 180],
  [carre, "icone-512-masquable.png", 512],
  [arrondi, "icone-192.png", 192],
  [arrondi, "icone-512.png", 512],
];

for (const [svg, nom, taille] of sorties) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(taille, taille)
    .png()
    .toFile(new URL(`../public/${nom}`, import.meta.url).pathname);
  console.log(`public/${nom} (${taille}×${taille})`);
}
