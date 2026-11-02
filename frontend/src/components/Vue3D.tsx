// Cabine en 3D : ton mannequin en volume, dans tes vêtements, et tu tournes autour.
// Les volumes viennent de lib/volume.ts ; ici, le dessin des silhouettes et des textures
// (photo de face devant, photo de dos derrière) et la scène three.js.
// Chargé à la demande (three.js pèse ~150 Ko compressé) depuis la Cabine.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LoaderCircle, RotateCw } from "lucide-react";
import { PLAN } from "../lib/categories";
import type { Depot } from "../lib/depot";
import { mesurerImage, urlImage } from "../lib/donnees";
import { HAUTEUR, LARGEUR, rectPiece, tracer, type Rect } from "../lib/mannequin";
import type { Avatar, Vetement } from "../lib/types";
import { decalages, decaler, envelopper, lisser, mailler, masqueDepuisAlpha, profondeurs, union, type Champ, type Decalage, type Maillage } from "../lib/volume";

const PAS = 2; // une case de la grille = 2 unités (≈ 0,4 cm)
const GW = LARGEUR / PAS;
const GH = HAUTEUR / PAS;
const TEX = 1.5; // résolution des textures (unités → pixels)
const AISANCE = 2.4; // en cases (≈ 0,9 cm)
/** Pièces qu'on ne voit que de face (pas de dos sur la photo). */
const FACE_SEULE = new Set(["lunettes", "bijoux"]);

interface Couche {
  maillage: Maillage;
  avant: HTMLCanvasElement;
  arriere: HTMLCanvasElement | null;
  peau?: boolean;
}

function toile(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return [c, ctx] as const;
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error("Photo illisible"));
    img.src = url;
  });
}

/** Masque de grille d'un dessin fait dans le repère SVG. */
function masque(dessiner: (ctx: CanvasRenderingContext2D) => void): Uint8Array {
  const [, ctx] = toile(GW, GH);
  ctx.scale(1 / PAS, 1 / PAS);
  dessiner(ctx);
  return masqueDepuisAlpha(ctx.getImageData(0, 0, GW, GH).data);
}

function dessinerImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect, miroir: boolean) {
  ctx.save();
  if (miroir) {
    ctx.translate(LARGEUR, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** Prépare les couches : le corps (buste et tête, deux bras), puis chaque pièce du dessous au dessus. */
async function preparer(avatar: Avatar, pieces: Vetement[], depot: Depot): Promise<{ couches: Couche[]; sansDos: string[] }> {
  const t = tracer(avatar);
  const corps = new Path2D(t.corps);
  const tete = new Path2D();
  tete.ellipse(t.tete.cx, t.tete.cy, t.tete.rx, t.tete.ry, 0, 0, Math.PI * 2);
  const brasG = new Path2D(t.brasGauche);
  const brasD = new Path2D(t.brasDroit);

  const mBuste = masque((c) => {
    c.fill(corps);
    c.fill(tete);
  });
  const mBrasG = masque((c) => c.fill(brasG));
  const mBrasD = masque((c) => c.fill(brasD));
  // Volumes du corps, lissés pour effacer les marches entre rangées
  const champs = [mBuste, mBrasG, mBrasD].map((m) => {
    const c = profondeurs(m, GW, GH, undefined, PAS);
    return { ...c, z: lisser(c, 3) };
  });
  const mCorps = new Uint8Array(mBuste.length);
  for (let k = 0; k < mCorps.length; k++) mCorps[k] = mBuste[k] | mBrasG[k] | mBrasD[k];

  // Peau et cheveux : devant, et derrière (arrière de la tête couvert de cheveux)
  const [peauAvant, cA] = toile(LARGEUR * TEX, HAUTEUR * TEX);
  const [peauArriere, cR] = toile(LARGEUR * TEX, HAUTEUR * TEX);
  for (const c of [cA, cR]) {
    c.scale(TEX, TEX);
    c.fillStyle = avatar.carnation;
    c.fillRect(0, 0, LARGEUR, HAUTEUR);
    c.fillStyle = avatar.cheveux_couleur;
    if (t.cheveuxArriere) c.fill(new Path2D(t.cheveuxArriere));
  }
  if (avatar.cheveux_longueur !== "rase") cR.fill(tete);
  const visage = avatar.visage ? await urlImage(depot, avatar.visage) : null;
  if (visage) {
    const img = await chargerImage(visage).catch(() => null);
    if (img) {
      cA.save();
      cA.clip(tete);
      const s = Math.max((t.tete.rx * 2) / img.width, (t.tete.ry * 2) / img.height);
      cA.drawImage(img, t.tete.cx - (img.width * s) / 2, t.tete.cy - (img.height * s) / 2, img.width * s, img.height * s);
      cA.restore();
    } else cA.fill(new Path2D(t.cheveuxAvant));
  } else cA.fill(new Path2D(t.cheveuxAvant));

  const couches: Couche[] = [
    { maillage: mailler(mBuste, champs[0], PAS), avant: peauAvant, arriere: peauArriere, peau: true },
    { maillage: mailler(mBrasG, champs[1], PAS), avant: peauAvant, arriere: peauArriere, peau: true },
    { maillage: mailler(mBrasD, champs[2], PAS), avant: peauAvant, arriere: peauArriere, peau: true },
  ];

  let dessous: Champ = union(champs);
  const sansDos: string[] = [];
  const triees = [...pieces].filter((p) => p.categorie !== "autre" && p.image).sort((a, b) => PLAN[a.categorie] - PLAN[b.categorie]);
  for (const p of triees) {
    const url = await urlImage(depot, p.image!);
    if (!url) continue;
    const img = await chargerImage(url).catch(() => null);
    if (!img) continue;
    const { ratio, reperes } = mesurerImage(img);
    const r = rectPiece(avatar, p, ratio, reperes);
    const m0 = masque((c) => c.drawImage(img, r.x, r.y, r.w, r.h));
    if (!m0.some((v) => v)) continue;
    // Jambes du pantalon recentrées sur les jambes du mannequin
    const liste = p.categorie === "bas" ? decalages(m0, mCorps, GW, GH, 24 / PAS * 2, 6) : [];
    const m = liste.length ? decaler(m0, GW, liste) : m0;
    const propre = profondeurs(m, GW, GH, () => 0.9, PAS);
    const env = envelopper(propre, dessous, AISANCE);
    dessous = union([dessous, env]);

    const [avant, ca] = toile(LARGEUR * TEX, HAUTEUR * TEX);
    ca.scale(TEX, TEX);
    dessinerImage(ca, img, r, false);

    let arriere: HTMLCanvasElement | null = null;
    if (!FACE_SEULE.has(p.categorie)) {
      const [ar, cr] = toile(LARGEUR * TEX, HAUTEUR * TEX);
      cr.scale(TEX, TEX);
      const urlDos = p.image_dos ? await urlImage(depot, p.image_dos) : null;
      const dos = urlDos ? await chargerImage(urlDos).catch(() => null) : null;
      // Fond : la silhouette de face en miroir (pas de trou si la photo de dos est plus étroite),
      // unie dans la couleur du tissu s'il y a une vraie photo de dos, sinon la face assombrie
      dessinerImage(cr, img, r, true);
      cr.globalCompositeOperation = "source-atop";
      cr.fillStyle = dos ? (p.couleurs[0]?.hex ?? "#222") : "rgba(0,0,0,0.16)";
      cr.fillRect(0, 0, LARGEUR, HAUTEUR);
      cr.globalCompositeOperation = "source-over";
      if (dos) {
        // Photo de dos calée sur la même largeur, en haut
        const h = (r.w / dos.width) * dos.height;
        dessinerImage(cr, dos, { x: r.x, y: r.y, w: r.w, h }, true);
      } else sansDos.push(p.nom || p.sous_type);
      arriere = ar;
    }
    // Décalages, puis bords nettoyés (le tissu remplit aussi les vides laissés par le décalage)
    const finir = (c: HTMLCanvasElement) => {
      const t = decalerToile(c, liste);
      nettoyerBords(t.getContext("2d", { willReadFrequently: true })!);
      return t;
    };
    couches.push({ maillage: mailler(m, env, PAS), avant: finir(avant), arriere: arriere && finir(arriere) });
  }
  return { couches, sansDos };
}

/**
 * Bords de la photo détourée : les pixels semi-transparents gardent un peu du fond d'origine
 * (liseré clair). On leur donne la couleur du tissu voisin, on prolonge le tissu de 3 pixels
 * et on rend tout opaque : c'est la forme 3D qui découpe la silhouette.
 */
function nettoyerBords(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let passe = 0; passe < 3; passe++) {
    const source = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (source[i + 3] >= 250) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = ((y + dy) * w + (x + dx)) * 4;
            if (source[j + 3] >= 250) {
              r += source[j];
              g += source[j + 1];
              b += source[j + 2];
              n++;
            }
          }
        }
        if (n) {
          d[i] = r / n;
          d[i + 1] = g / n;
          d[i + 2] = b / n;
          d[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Applique aux textures les mêmes décalages que ceux du masque (par bandes horizontales). */
function decalerToile(src: HTMLCanvasElement, liste: Decalage[]): HTMLCanvasElement {
  if (!liste.length) return src;
  const k = PAS * TEX;
  const [n, c] = toile(src.width, src.height);
  c.drawImage(src, 0, 0);
  for (const d of liste) c.clearRect(d.a * k, d.rangee * k, (d.b - d.a + 1) * k, k);
  for (const d of liste) {
    const sx = d.a * k;
    const sy = d.rangee * k;
    const sw = (d.b - d.a + 1) * k;
    c.drawImage(src, sx, sy, sw, k, sx + d.dx * k, sy, sw, k);
  }
  return n;
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function maille(c: Couche): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(c.maillage.positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(c.maillage.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(c.maillage.indices, 1));
  g.addGroup(0, c.maillage.nAvant, 0);
  g.addGroup(c.maillage.nAvant, c.maillage.indices.length - c.maillage.nAvant, 1);
  g.computeVertexNormals();
  const matiere = (canvas: HTMLCanvasElement | null) =>
    canvas
      ? new THREE.MeshStandardMaterial({
          map: texture(canvas),
          roughness: c.peau ? 0.62 : 0.88,
          metalness: 0,
          alphaTest: c.peau ? 0 : 0.5,
          transparent: false,
          side: c.peau ? THREE.FrontSide : THREE.DoubleSide,
        })
      : new THREE.MeshBasicMaterial({ visible: false });
  return new THREE.Mesh(g, [matiere(c.avant), matiere(c.arriere)]);
}

const VUES = { face: 0, profil: Math.PI / 2, dos: Math.PI } as const;

export default function Vue3D({ avatar, pieces, depot }: { avatar: Avatar; pieces: Vetement[]; depot: Depot }) {
  const boite = useRef<HTMLDivElement>(null);
  const moteur = useRef<{ scene: THREE.Scene; groupe: THREE.Group; camera: THREE.PerspectiveCamera; controles: OrbitControls } | null>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [sansDos, setSansDos] = useState<string[]>([]);
  const [tourne, setTourne] = useState(false);

  // Scène, caméra, lumières, une seule fois
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setEtat("erreur");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    camera.position.set(0, 0.55, 2.6);
    const controles = new OrbitControls(camera, renderer.domElement);
    controles.target.set(0, 0.5, 0);
    controles.enablePan = false;
    controles.enableDamping = true;
    controles.minDistance = 1.1;
    controles.maxDistance = 4;
    controles.minPolarAngle = 0.5;
    controles.maxPolarAngle = 2.1;
    controles.autoRotateSpeed = 2.2;

    const signature = getComputedStyle(document.documentElement).getPropertyValue("--atelier-signature").trim() || "#e6c79c";
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2420, 1.5));
    const cle = new THREE.DirectionalLight(0xffffff, 1.7);
    cle.position.set(0.7, 1.5, 2);
    scene.add(cle);
    const contre = new THREE.DirectionalLight(new THREE.Color(signature), 1.1);
    contre.position.set(-1, 1.2, -2);
    scene.add(contre);
    const derriere = new THREE.DirectionalLight(0xffffff, 0.8);
    derriere.position.set(0.5, 1, -2);
    scene.add(derriere);

    // Lueur au sol, dans la couleur de l'app
    const [sol, cs] = toile(256, 256);
    const grad = cs.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, signature);
    grad.addColorStop(1, "transparent");
    cs.globalAlpha = 0.45;
    cs.fillStyle = grad;
    cs.fillRect(0, 0, 256, 256);
    const disque = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ map: texture(sol), transparent: true, depthWrite: false }));
    disque.rotation.x = -Math.PI / 2;
    disque.position.y = 0.035;
    scene.add(disque);

    const groupe = new THREE.Group();
    scene.add(groupe);
    moteur.current = { scene, groupe, camera, controles };

    const taille = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(taille);
    obs.observe(el);
    taille();
    let anim = 0;
    const boucle = () => {
      controles.update();
      renderer.render(scene, camera);
      anim = requestAnimationFrame(boucle);
    };
    boucle();
    return () => {
      cancelAnimationFrame(anim);
      obs.disconnect();
      controles.dispose();
      groupe.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of [o.material].flat()) {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      moteur.current = null;
    };
  }, []);

  // Le mannequin et ses pièces, à chaque changement de tenue
  const cleTenue = JSON.stringify([avatar, pieces.map((p) => [p.id, p.image, p.image_dos, p.calage, p.ajustement, p.longueur])]);
  useEffect(() => {
    let annule = false;
    setEtat((e) => (e === "erreur" ? e : "chargement"));
    preparer(avatar, pieces, depot)
      .then(({ couches, sansDos }) => {
        const m = moteur.current;
        if (annule || !m) return;
        for (const o of [...m.groupe.children]) {
          m.groupe.remove(o);
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            for (const mat of [o.material].flat()) {
              (mat as THREE.MeshStandardMaterial).map?.dispose();
              mat.dispose();
            }
          }
        }
        for (const c of couches) m.groupe.add(maille(c));
        setSansDos(sansDos);
        setEtat("pret");
      })
      .catch(() => !annule && setEtat("erreur"));
    return () => {
      annule = true;
    };
  }, [cleTenue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (moteur.current) moteur.current.controles.autoRotate = tourne;
  }, [tourne]);

  const vue = (angle: number) => {
    const m = moteur.current;
    if (!m) return;
    setTourne(false);
    const d = m.camera.position.distanceTo(m.controles.target);
    m.camera.position.set(Math.sin(angle) * d, 0.55, Math.cos(angle) * d);
    m.controles.update();
  };

  return (
    <div className="vue3d">
      <div ref={boite} className="vue3d__toile" aria-label="Ton mannequin en 3D : fais glisser pour tourner autour" role="img" />
      {etat === "chargement" && (
        <div className="vue3d__etat" role="status">
          <LoaderCircle className="tourne" size={28} aria-hidden /> Mise en volume…
        </div>
      )}
      {etat === "erreur" && (
        <div className="vue3d__etat" role="alert">
          La 3D n'est pas disponible sur cet appareil.
        </div>
      )}
      <div className="vue3d__commandes">
        <div className="segments" role="group" aria-label="Point de vue">
          <button className="segment" onClick={() => vue(VUES.face)}>
            Face
          </button>
          <button className="segment" onClick={() => vue(VUES.profil)}>
            Profil
          </button>
          <button className="segment" onClick={() => vue(VUES.dos)}>
            Dos
          </button>
        </div>
        <button className="bouton-icone" aria-pressed={tourne} onClick={() => setTourne((x) => !x)} aria-label={tourne ? "Arrêter la rotation" : "Faire tourner"}>
          <RotateCw size={18} />
        </button>
      </div>
      {etat === "pret" && sansDos.length > 0 && (
        <p className="vue3d__note">Dos imaginé pour : {sansDos.join(", ")}. Ajoute la photo de dos dans la fiche de la pièce.</p>
      )}
    </div>
  );
}
