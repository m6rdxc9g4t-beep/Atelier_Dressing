import { useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, CircleAlert, ImagePlus, Link2, LoaderCircle, ScanLine, Sparkles, Wand2 } from "lucide-react";
import { ImportLien } from "../components/ImportLien";
import { preparerDos } from "../lib/lien";
import { FicheVetement } from "../components/FicheVetement";
import { Mannequin } from "../components/Mannequin";
import { Segments, Curseur } from "../components/Elements";
import { useToast } from "../components/Toast";
import { longueurParDefaut } from "../lib/categories";
import { nomCouleur } from "../lib/couleurs";
import { detourer, OPTIONS_DETOURAGE, type Pixels, type ResultatDetourage } from "../lib/detourage";
import { useDonnees, useReglages } from "../lib/donnees";
import { analyserVetement, IAIndisponible, NOM_MOTEUR, type AnalyseVetement, type ModeIA } from "../lib/ia";
import { imagePourIA, pixelsVersBlob, reduireEnJpeg, versPixels } from "../lib/images";
import { messageErreur } from "../lib/supabase";
import { nouveauVetement, type Vetement } from "../lib/types";

interface Brouillon {
  fichier: Blob;
  /** Photo de dos (3D), détourée à l'enregistrement. */
  dos?: Blob;
  urlDos?: string;
  original: Blob;
  urlOriginal: string;
  pixels: Pixels;
  resultat: ResultatDetourage;
  detoure: Blob;
  urlDetoure: string;
  tolerance: number;
  garderEntiere: boolean;
  vetement: Vetement;
  modifie: boolean;
}

type EtatIA =
  | { etat: "attente" }
  | { etat: "en_cours" }
  | { etat: "ok"; moteur: string }
  | { etat: "erreur"; message: string; proposer: ModeIA | null };

/** Fusionne l'analyse de l'IA dans la fiche, sans écraser ce que tu as déjà modifié. */
function fusionner(v: Vetement, a: AnalyseVetement, modifie: boolean): Vetement {
  const prend = <K extends keyof AnalyseVetement>(k: K, vide: boolean) => (modifie && !vide ? {} : { [k]: a[k] });
  return {
    ...v,
    ...prend("nom", !v.nom),
    ...prend("categorie", false),
    ...prend("sous_type", !v.sous_type),
    ...(a.couleurs.length ? prend("couleurs", !v.couleurs.length) : {}),
    ...prend("matiere", !v.matiere),
    ...prend("motif", !v.motif || v.motif === "uni"),
    ...prend("saisons", !v.saisons.length),
    ...prend("occasions", !v.occasions.length),
    ...prend("style", !v.style),
    ...prend("chaleur", false),
    ...prend("marque", !v.marque),
    longueur: modifie && v.longueur ? v.longueur : (a.longueur ?? longueurParDefaut(a.categorie, a.sous_type)),
    // Les repères d'ajustement suivent la photo : on garde toujours ceux de l'IA
    ajustement: a.ajustement,
  };
}

export function Scanner({ versDressing }: { versDressing: () => void }) {
  const { depot, profil, enregistrerVetement } = useDonnees();
  const [reglages, majReglages] = useReglages();
  const toast = useToast();
  const [file, setFile] = useState<File[]>([]);
  // File d'attente des photos importées d'un coup (ref + état pour l'affichage)
  const fileRef = useRef<File[]>([]);
  const majFile = (f: File[]) => {
    fileRef.current = f;
    setFile(f);
  };
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [preparation, setPreparation] = useState(false);
  const [ia, setIa] = useState<EtatIA>({ etat: "attente" });
  const [vue, setVue] = useState<"detouree" | "originale">("detouree");
  const [enregistrement, setEnregistrement] = useState(false);
  const [survol, setSurvol] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const dosRef = useRef<HTMLInputElement>(null);
  const [lien, setLien] = useState(false);
  const jeton = useRef(0);
  const ajoutees = useRef(0);

  // Libère les adresses des photos quand on passe à la suivante
  useEffect(
    () => () => {
      if (brouillon) {
        URL.revokeObjectURL(brouillon.urlOriginal);
        URL.revokeObjectURL(brouillon.urlDetoure);
      }
    },
    [brouillon?.urlOriginal, brouillon?.urlDetoure], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function lancerIA(b: Brouillon, mode?: ModeIA) {
    const moi = ++jeton.current;
    setIa({ etat: "en_cours" });
    try {
      const source = b.resultat.fiable && !b.garderEntiere ? b.detoure : b.original;
      const indice = b.resultat.couleurs.map((c) => `${nomCouleur(c.hex)} ${c.hex} (${Math.round(c.part * 100)} %)`).join(", ");
      const { analyse, moteur } = await analyserVetement(await imagePourIA(source), mode ? { ...reglages, modeIA: mode } : reglages, indice);
      if (moi !== jeton.current) return;
      setBrouillon((x) => (x && x.vetement.id === b.vetement.id ? { ...x, vetement: fusionner(x.vetement, analyse, x.modifie) } : x));
      setIa({ etat: "ok", moteur: NOM_MOTEUR[moteur] });
    } catch (e) {
      if (moi !== jeton.current) return;
      setIa({
        etat: "erreur",
        message: e instanceof IAIndisponible ? e.message : "L'IA n'a pas pu lire la photo : " + messageErreur(e),
        proposer: e instanceof IAIndisponible ? e.proposer : null,
      });
    }
  }

  async function preparer(fichier: Blob, dos?: Blob) {
    setPreparation(true);
    setVue("detouree");
    try {
      const [original, pixels] = await Promise.all([reduireEnJpeg(fichier), versPixels(fichier, 900)]);
      // Laisse l'écran afficher « Détourage… » avant le calcul
      await new Promise((r) => setTimeout(r, 30));
      const resultat = detourer(pixels, { tolerance: OPTIONS_DETOURAGE.tolerance });
      const detoure = await pixelsVersBlob(resultat.pixels);
      const vetement = nouveauVetement({
        couleurs: resultat.couleurs.map((c) => ({ hex: c.hex, nom: nomCouleur(c.hex) })),
      });
      const b: Brouillon = {
        fichier,
        original,
        urlOriginal: URL.createObjectURL(original),
        pixels,
        resultat,
        detoure,
        urlDetoure: URL.createObjectURL(detoure),
        tolerance: OPTIONS_DETOURAGE.tolerance,
        garderEntiere: !resultat.fiable,
        vetement,
        modifie: false,
        dos,
        urlDos: dos ? URL.createObjectURL(dos) : undefined,
      };
      setBrouillon(b);
      lancerIA(b);
    } catch (e) {
      toast("Photo illisible : " + messageErreur(e), { erreur: true });
      suivante();
    } finally {
      setPreparation(false);
    }
  }

  function ajouterFichiers(liste: FileList | File[] | null) {
    const images = [...(liste ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!images.length) return;
    if (brouillon || preparation) {
      majFile([...fileRef.current, ...images]);
    } else {
      ajoutees.current = 0;
      majFile(images.slice(1));
      preparer(images[0]);
    }
  }

  function suivante() {
    jeton.current++;
    setIa({ etat: "attente" });
    setBrouillon(null);
    const [premier, ...reste] = fileRef.current;
    majFile(reste);
    if (premier) preparer(premier);
  }

  async function redetourer(tolerance: number) {
    if (!brouillon) return;
    const resultat = detourer(brouillon.pixels, { tolerance });
    const detoure = await pixelsVersBlob(resultat.pixels);
    setBrouillon((b) =>
      b ? { ...b, tolerance, resultat, detoure, urlDetoure: URL.createObjectURL(detoure), garderEntiere: false } : b,
    );
  }

  async function enregistrer() {
    if (!brouillon) return;
    setEnregistrement(true);
    const v = { ...brouillon.vetement, nom: brouillon.vetement.nom.trim() || brouillon.vetement.sous_type || "Nouvelle pièce" };
    try {
      const image = brouillon.garderEntiere ? brouillon.original : brouillon.detoure;
      const ext = image.type === "image/webp" ? "webp" : image.type === "image/jpeg" ? "jpg" : "png";
      const cleImage = `${v.id}.${ext}`;
      const cleOriginale = `${v.id}-orig.jpg`;
      await depot.ecrireImage(cleImage, image);
      await depot.ecrireImage(cleOriginale, brouillon.original);
      let image_dos: string | null = null;
      if (brouillon.dos) {
        const dos = await preparerDos(brouillon.dos);
        image_dos = `${v.id}-dos.${dos.type === "image/webp" ? "webp" : dos.type === "image/jpeg" ? "jpg" : "png"}`;
        await depot.ecrireImage(image_dos, dos);
      }
      await enregistrerVetement({
        ...v,
        image: cleImage,
        image_originale: cleOriginale,
        image_dos,
      });
      ajoutees.current++;
      if (file.length) toast(`« ${v.nom} » ajoutée. Pièce suivante…`);
      else
        toast(ajoutees.current > 1 ? `${ajoutees.current} pièces ajoutées au dressing` : "Pièce ajoutée au dressing", {
          action: { label: "Voir le dressing", faire: versDressing },
        });
      suivante();
    } catch (e) {
      toast("Enregistrement impossible : " + messageErreur(e), { erreur: true });
    } finally {
      setEnregistrement(false);
    }
  }

  const deposer = (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    ajouterFichiers(e.dataTransfer.files);
  };

  const entrees = (
    <>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (ajouterFichiers(e.target.files), (e.target.value = ""))} />
      <input ref={galerie} type="file" accept="image/*" multiple hidden onChange={(e) => (ajouterFichiers(e.target.files), (e.target.value = ""))} />
      <input
        ref={dosRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setBrouillon((x) => (x ? { ...x, dos: f, urlDos: URL.createObjectURL(f) } : x));
          e.target.value = "";
        }}
      />
      <ImportLien
        ouverte={lien}
        onFermer={() => setLien(false)}
        onImporter={({ face, dos }) => {
          setLien(false);
          if (face) {
            ajoutees.current = 0;
            preparer(face, dos);
          }
        }}
      />
    </>
  );

  if (!brouillon) {
    return (
      <section
        className={"ecran scanner" + (survol ? " scanner--survol" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
      >
        <header className="ecran__tete">
          <h1>Scanner</h1>
          <p className="ecran__sous-titre">Photographie une pièce : elle est détourée, reconnue par l'IA, puis rangée dans ton dressing.</p>
        </header>
        {entrees}
        <div className="panneau scanner__accueil">
          <span className="scanner__icone" aria-hidden>
            {preparation ? <LoaderCircle className="tourne" size={44} /> : <ScanLine size={44} />}
          </span>
          {preparation ? (
            <p className="scanner__statut" role="status">
              Détourage de la photo…
            </p>
          ) : (
            <>
              <div className="scanner__boutons">
                <button className="bouton bouton--action bouton--grand" onClick={() => photo.current?.click()}>
                  <Camera size={20} aria-hidden /> Prendre une photo
                </button>
                <button className="bouton bouton--discret bouton--grand" onClick={() => galerie.current?.click()}>
                  <ImagePlus size={20} aria-hidden /> Importer des photos
                </button>
                <button className="bouton bouton--discret bouton--grand" onClick={() => setLien(true)}>
                  <Link2 size={20} aria-hidden /> Depuis un lien de boutique
                </button>
              </div>
              <p className="note scanner__glisser">Sur Mac, tu peux aussi glisser tes photos ici, plusieurs à la fois.</p>
            </>
          )}
        </div>
        <div className="panneau conseils">
          <h2 className="groupe__titre">Pour un détourage net</h2>
          <ol className="conseils__liste">
            <li>
              <strong>À plat sur un fond uni</strong> qui contraste avec la pièce : drap, parquet, sol clair.
            </li>
            <li>
              <strong>De face et bien éclairée</strong>, sans ombre forte ni flash.
            </li>
            <li>
              <strong>Une pièce par photo.</strong> Les chaussures par paire, côte à côte.
            </li>
          </ol>
        </div>
      </section>
    );
  }

  const b = brouillon;
  const majVetement = (v: Vetement) => setBrouillon((x) => (x ? { ...x, vetement: v, modifie: true } : x));
  const urlAffichee = vue === "originale" || b.garderEntiere ? b.urlOriginal : b.urlDetoure;

  return (
    <section className="ecran scanner" onDragOver={(e) => e.preventDefault()} onDrop={deposer}>
      {entrees}
      <header className="ecran__tete ecran__tete--avec-action">
        <div>
          <h1>Vérifier la pièce</h1>
          <p className="ecran__sous-titre">
            {file.length ? `Encore ${file.length} photo${file.length > 1 ? "s" : ""} après celle-ci. ` : ""}
            Corrige ce qui ne va pas, puis ajoute-la à ton dressing.
          </p>
        </div>
      </header>

      <div className="scanner__grille">
        <div className="scanner__visuel">
          <div className="panneau scanner__photo">
            <div className="photo photo--damier photo--grande">
              <img src={urlAffichee} alt="Photo de la pièce" />
            </div>
            <Segments
              etiquette="Photo affichée"
              valeur={b.garderEntiere ? "originale" : vue}
              onChange={(x) => (b.garderEntiere ? undefined : setVue(x))}
              options={[
                { v: "detouree", l: "Détourée" },
                { v: "originale", l: "Originale" },
              ]}
            />
            {!b.resultat.fiable && (
              <p className="message message--alerte">
                <CircleAlert size={18} aria-hidden /> Le fond est difficile à séparer. Augmente la tolérance, ou garde la photo entière.
              </p>
            )}
            {!b.garderEntiere && (
              <Curseur
                libelle="Tolérance du fond"
                valeur={b.tolerance}
                min={8}
                max={45}
                pas={1}
                gauche="Stricte"
                droite="Large"
                onChange={(t) => redetourer(t)}
              />
            )}
            <div className="detail__dos">
              {b.urlDos ? (
                <div className="photo">
                  <img src={b.urlDos} alt="Photo de dos" />
                </div>
              ) : null}
              <span className="note">{b.dos ? "Photo de dos ajoutée : la 3D aura le vrai dos." : "Pour la 3D, ajoute aussi la photo de dos."}</span>
              <button className="bouton bouton--discret" onClick={() => dosRef.current?.click()}>
                {b.dos ? "Changer" : "Photo de dos"}
              </button>
            </div>
            <label className="case-ligne">
              <input
                type="checkbox"
                checked={b.garderEntiere}
                onChange={(e) => setBrouillon((x) => (x ? { ...x, garderEntiere: e.target.checked } : x))}
              />
              Garder la photo entière (sans détourage)
            </label>
          </div>
          <div className="panneau scanner__apercu">
            <h2 className="groupe__titre">Sur toi</h2>
            <Mannequin avatar={profil.avatar} pieces={[b.vetement]} apercus={{ [b.vetement.id]: urlAffichee }} petit libelle="Aperçu de la pièce sur ton mannequin" />
          </div>
        </div>

        <div className="panneau scanner__fiche">
          <EtatAnalyse ia={ia} relancer={(m) => lancerIA(b, m)} basculer={(m) => majReglages({ modeIA: m })} />
          <FicheVetement v={b.vetement} onChange={majVetement} />
        </div>
      </div>

      <div className="barre-action scanner__barre">
        <button className="bouton bouton--discret" onClick={suivante} disabled={enregistrement}>
          {file.length ? "Passer" : "Annuler"}
        </button>
        <button className="bouton bouton--action" onClick={enregistrer} disabled={enregistrement}>
          {enregistrement ? <LoaderCircle className="tourne" size={18} aria-hidden /> : <Wand2 size={18} aria-hidden />}
          Ajouter au dressing
        </button>
      </div>
    </section>
  );
}

function EtatAnalyse({
  ia,
  relancer,
  basculer,
}: {
  ia: EtatIA;
  relancer: (mode?: ModeIA) => void;
  basculer: (mode: ModeIA) => void;
}) {
  if (ia.etat === "en_cours")
    return (
      <p className="etat-analyse" role="status">
        <LoaderCircle className="tourne" size={18} aria-hidden /> L'IA regarde la pièce…
      </p>
    );
  if (ia.etat === "ok")
    return (
      <p className="etat-analyse etat-analyse--ok" role="status">
        <Sparkles size={18} aria-hidden /> Reconnue par {ia.moteur}. Vérifie avant d'ajouter.
      </p>
    );
  if (ia.etat === "erreur")
    return (
      <div className="message message--alerte etat-analyse--erreur" role="alert">
        <span>
          <CircleAlert size={18} aria-hidden /> {ia.message}
        </span>
        <span className="etat-analyse__actions">
          {ia.proposer && (
            <button
              className="bouton bouton--discret"
              onClick={() => {
                basculer(ia.proposer!);
                relancer(ia.proposer!);
              }}
            >
              Essayer avec {ia.proposer === "claude" ? "Claude" : "Ollama"}
            </button>
          )}
          <button className="bouton bouton--discret" onClick={() => relancer()}>
            Réessayer
          </button>
        </span>
        <span className="note">Tu peux aussi remplir la fiche toi-même : les couleurs sont déjà mesurées sur la photo.</span>
      </div>
    );
  return null;
}
