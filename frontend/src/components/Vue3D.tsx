// Cabine en 3D : le modèle 3D (GLB) tiré de ta photo d'essayage par TRELLIS.2,
// posé sur un sol neutre avec son ombre douce. Tu tournes autour au doigt.
// three.js n'est chargé que pour cette vue (import paresseux dans Cabine).

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LoaderCircle, RotateCw } from "lucide-react";

const VUES = { face: 0, profil: Math.PI / 2, dos: Math.PI } as const;
const HAUTEUR_CIBLE = 1.7; // le modèle est remis à l'échelle d'une personne
const VISEE = 0.92;

function libererObjet(o: THREE.Object3D) {
  o.traverse((x) => {
    if (x instanceof THREE.Mesh) {
      x.geometry.dispose();
      for (const m of [x.material].flat() as THREE.MeshStandardMaterial[]) {
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) t?.dispose();
        m.dispose();
      }
    }
  });
}

export default function Vue3D({ url, libelle }: { url: string; libelle: string }) {
  const boite = useRef<HTMLDivElement>(null);
  const moteur = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; controles: OrbitControls; modele: THREE.Object3D | null } | null>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
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
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Reflets doux pour les matières PBR du modèle
    const pmrem = new THREE.PMREMGenerator(renderer);
    const salle = new THREE.Scene();
    salle.add(new THREE.HemisphereLight(0xffffff, 0x3a332c, 2.2));
    scene.environment = pmrem.fromScene(salle, 0.04).texture;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    camera.position.set(0, VISEE, 4.2);
    const controles = new OrbitControls(camera, renderer.domElement);
    controles.target.set(0, VISEE, 0);
    controles.enablePan = false;
    controles.enableDamping = true;
    controles.minDistance = 1.4;
    controles.maxDistance = 6;
    controles.minPolarAngle = 0.4;
    controles.maxPolarAngle = 2.0;
    controles.autoRotateSpeed = 2.2;

    // Lumière de studio neutre : les couleurs des vêtements restent justes.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2b30, 0.9));
    const cle = new THREE.DirectionalLight(0xffffff, 1.6);
    cle.position.set(0.8, 2.2, 2.4);
    scene.add(cle);
    const contre = new THREE.DirectionalLight(0xe8eaf0, 0.9);
    contre.position.set(-1.2, 1.8, -2.4);
    scene.add(contre);

    // Ombre de contact au sol, neutre
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const cs = c.getContext("2d");
    if (cs) {
      const grad = cs.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgb(0 0 0 / 0.5)");
      grad.addColorStop(1, "rgb(0 0 0 / 0)");
      cs.fillStyle = grad;
      cs.fillRect(0, 0, 256, 256);
    }
    const ombre = new THREE.CanvasTexture(c);
    ombre.colorSpace = THREE.SRGBColorSpace;
    const disque = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ map: ombre, transparent: true, depthWrite: false }));
    disque.rotation.x = -Math.PI / 2;
    disque.position.y = 0.002;
    scene.add(disque);

    moteur.current = { scene, camera, controles, modele: null };

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
      if (moteur.current?.modele) libererObjet(moteur.current.modele);
      disque.geometry.dispose();
      ombre.dispose();
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      moteur.current = null;
    };
  }, []);

  // Le modèle : debout sur le socle, centré, à hauteur d'une personne
  useEffect(() => {
    let annule = false;
    setEtat((e) => (e === "erreur" ? e : "chargement"));
    new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        const m = moteur.current;
        if (annule || !m) return libererObjet(gltf.scene);
        if (m.modele) {
          m.scene.remove(m.modele);
          libererObjet(m.modele);
        }
        const objet = gltf.scene;
        const boiteM = new THREE.Box3().setFromObject(objet);
        const dim = boiteM.getSize(new THREE.Vector3());
        const echelle = HAUTEUR_CIBLE / Math.max(dim.y, 1e-6);
        objet.scale.setScalar(echelle);
        const centre = boiteM.getCenter(new THREE.Vector3());
        objet.position.set(-centre.x * echelle, -boiteM.min.y * echelle, -centre.z * echelle);
        m.scene.add(objet);
        m.modele = objet;
        setEtat("pret");
      })
      .catch(() => !annule && setEtat("erreur"));
    return () => {
      annule = true;
    };
  }, [url]);

  useEffect(() => {
    if (moteur.current) moteur.current.controles.autoRotate = tourne;
  }, [tourne]);

  const vue = (angle: number) => {
    const m = moteur.current;
    if (!m) return;
    setTourne(false);
    const d = m.camera.position.distanceTo(m.controles.target);
    m.camera.position.set(Math.sin(angle) * d, VISEE, Math.cos(angle) * d);
    m.controles.update();
  };

  return (
    <div className="vue3d">
      <div ref={boite} className="vue3d__toile" aria-label={libelle + " Fais glisser pour tourner autour."} role="img" />
      {etat === "chargement" && (
        <div className="vue3d__etat" role="status">
          <LoaderCircle className="tourne" size={28} aria-hidden /> Chargement du modèle 3D…
        </div>
      )}
      {etat === "erreur" && (
        <div className="vue3d__etat" role="alert">
          Le modèle 3D ne s'affiche pas sur cet appareil.
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
    </div>
  );
}
