import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Heart, Link2, LoaderCircle, Pencil, ScanLine, Scissors, Search, Shirt, Trash, Sparkles } from "lucide-react";
import { ImportLien } from "../components/ImportLien";
import { preparerDos } from "../lib/lien";
import { Curseur, Pastilles, Photo, Vide, Vignette } from "../components/Elements";
import { FicheVetement } from "../components/FicheVetement";
import { Feuille } from "../components/Feuille";
import { Mannequin } from "../components/Mannequin";
import { useToast } from "../components/Toast";
import { basculerPiece, useCabine } from "../lib/cabine";
import {
  CATEGORIES,
  LIBELLE_CATEGORIE,
  LIBELLE_CHALEUR,
  LIBELLE_LONGUEUR,
  LIBELLE_OCCASION,
  LIBELLE_PIECE,
  LIBELLE_SAISON,
  SAISONS,
} from "../lib/categories";
import { dateCourte, depuis, euros } from "../lib/dates";
import { detourer, OPTIONS_DETOURAGE, type Pixels } from "../lib/detourage";
import { useDonnees, useReglages } from "../lib/donnees";
import { analyserVetement, IAIndisponible, NOM_MOTEUR } from "../lib/ia";
import { imagePourIA, pixelsVersBlob, versPixels } from "../lib/images";
import { messageErreur } from "../lib/supabase";
import type { Categorie, Saison, Vetement } from "../lib/types";

type Tri = "recent" | "moins" | "plus" | "nom";

export function Dressing({ versScanner, versCabine }: { versScanner: () => void; versCabine: () => void }) {
  const { vetements, compteurs, derniers } = useDonnees();
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [saison, setSaison] = useState<Saison | null>(null);
  const [favoris, setFavoris] = useState(false);
  const [archives, setArchives] = useState(false);
  const [tri, setTri] = useState<Tri>("recent");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const visibles = useMemo(() => vetements.filter((v) => v.archive === archives), [vetements, archives]);
  const comptes = useMemo(() => {
    const m = new Map<Categorie, number>();
    for (const v of visibles) m.set(v.categorie, (m.get(v.categorie) ?? 0) + 1);
    return m;
  }, [visibles]);

  const liste = useMemo(() => {
    const q = recherche
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    const sansAccent = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const r = visibles.filter(
      (v) =>
        (!categorie || v.categorie === categorie) &&
        (!saison || !v.saisons.length || v.saisons.includes(saison)) &&
        (!favoris || v.favori) &&
        (!q ||
          sansAccent([v.nom, v.sous_type, v.marque, v.matiere, v.motif, v.style, ...v.couleurs.map((c) => c.nom)].join(" ")).includes(q)),
    );
    const n = (v: Vetement) => compteurs.get(v.id) ?? 0;
    if (tri === "moins") r.sort((a, b) => n(a) - n(b) || (derniers.get(a.id) ?? "").localeCompare(derniers.get(b.id) ?? ""));
    else if (tri === "plus") r.sort((a, b) => n(b) - n(a));
    else if (tri === "nom") r.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return r;
  }, [visibles, categorie, saison, favoris, recherche, tri, compteurs, derniers]);

  const v = ouvert ? vetements.find((x) => x.id === ouvert) : null;

  if (!vetements.length) {
    return (
      <section className="ecran">
        <header className="ecran__tete">
          <h1>Dressing</h1>
        </header>
        <Vide
          icone={<Shirt size={36} />}
          titre="Ton dressing est vide"
          texte="Chaque pièce photographiée arrive ici, détourée et rangée par catégorie."
          action={
            <button className="bouton bouton--action" onClick={versScanner}>
              <ScanLine size={18} aria-hidden /> Scanner une pièce
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="ecran">
      <header className="ecran__tete ecran__tete--avec-action">
        <div>
          <h1>Dressing</h1>
          <p className="ecran__sous-titre">
            {visibles.length} pièce{visibles.length > 1 ? "s" : ""}
            {archives ? " archivée" + (visibles.length > 1 ? "s" : "") : ""}
          </p>
        </div>
        <button className="bouton bouton--action" onClick={versScanner}>
          <ScanLine size={18} aria-hidden /> Ajouter
        </button>
      </header>

      <div className="dressing__filtres">
        <label className="recherche">
          <Search size={18} aria-hidden />
          <input
            className="champ"
            type="search"
            placeholder="Chercher : lin, bleu marine, Levi's…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Chercher une pièce"
          />
        </label>
        <div className="puces puces--defile" role="group" aria-label="Catégorie">
          <button className="puce" aria-pressed={!categorie} onClick={() => setCategorie(null)}>
            Tout <span className="puce__compte">{visibles.length}</span>
          </button>
          {CATEGORIES.filter((c) => comptes.get(c)).map((c) => (
            <button key={c} className="puce" aria-pressed={categorie === c} onClick={() => setCategorie(categorie === c ? null : c)}>
              {LIBELLE_CATEGORIE[c]} <span className="puce__compte">{comptes.get(c)}</span>
            </button>
          ))}
        </div>
        <div className="dressing__options">
          <div className="puces" role="group" aria-label="Filtres">
            <button className="puce" aria-pressed={favoris} onClick={() => setFavoris(!favoris)}>
              <Heart size={14} aria-hidden /> Favoris
            </button>
            {SAISONS.map((s) => (
              <button key={s} className="puce" aria-pressed={saison === s} onClick={() => setSaison(saison === s ? null : s)}>
                {LIBELLE_SAISON[s]}
              </button>
            ))}
            <button className="puce" aria-pressed={archives} onClick={() => setArchives(!archives)}>
              <Archive size={14} aria-hidden /> Archivées
            </button>
          </div>
          <label className="dressing__tri">
            <span className="visuellement-cache">Trier</span>
            <select className="champ champ--compact" value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
              <option value="recent">Ajout récent</option>
              <option value="moins">Moins portées d'abord</option>
              <option value="plus">Plus portées d'abord</option>
              <option value="nom">Nom</option>
            </select>
          </label>
        </div>
      </div>

      {liste.length ? (
        <div className="grille-dressing">
          {liste.map((x) => (
            <Vignette
              key={x.id}
              v={x}
              onClick={() => setOuvert(x.id)}
              sous={<span className="vignette__ports">{compteurs.get(x.id) ? `${compteurs.get(x.id)}×` : "jamais"}</span>}
            />
          ))}
        </div>
      ) : (
        <p className="note dressing__rien">Aucune pièce ne correspond à ces filtres.</p>
      )}

      <Detail v={v ?? null} onFermer={() => setOuvert(null)} versCabine={versCabine} />
    </section>
  );
}

function Detail({ v, onFermer, versCabine }: { v: Vetement | null; onFermer: () => void; versCabine: () => void }) {
  const { vetements, profil, compteurs, derniers, depot, enregistrerVetement, supprimerVetement } = useDonnees();
  const [reglages] = useReglages();
  const [ajustage, setAjustage] = useState(false);
  const [lienDos, setLienDos] = useState(false);
  const [dosEnCours, setDosEnCours] = useState(false);
  const fichierDos = useRef<HTMLInputElement>(null);
  const cabine = useCabine();
  const toast = useToast();
  const [mode, setMode] = useState<"fiche" | "modifier" | "photo">("fiche");
  const [brouillon, setBrouillon] = useState<Vetement | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  useEffect(() => {
    setMode("fiche");
    setBrouillon(v);
    setConfirmer(false);
  }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return <Feuille ouverte={false} titre="" onFermer={onFermer}>{null}</Feuille>;

  const nb = compteurs.get(v.id) ?? 0;

  // Photo de dos : la 3D affiche le vrai dos de la pièce
  async function ajouterDos(source: Blob) {
    if (!v) return;
    setDosEnCours(true);
    try {
      const dos = await preparerDos(source);
      const cle = `${v.id}-dos-${Date.now().toString(36)}.${dos.type === "image/webp" ? "webp" : dos.type === "image/jpeg" ? "jpg" : "png"}`;
      await depot.ecrireImage(cle, dos);
      const ancienne = v.image_dos;
      await enregistrerVetement({ ...v, image_dos: cle });
      if (ancienne) depot.supprimerImage(ancienne).catch(() => {});
      toast("Photo de dos ajoutée : la 3D montre le vrai dos");
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    } finally {
      setDosEnCours(false);
    }
  }

  // Demande à l'IA où sont les épaules / la ceinture sur la photo, pour bien l'ajuster sur toi
  async function reajuster() {
    if (!v) return;
    const cle = v.image ?? v.image_originale;
    const b = cle ? await depot.lireImage(cle) : null;
    if (!b) return toast("Photo introuvable", { erreur: true });
    setAjustage(true);
    try {
      const { analyse, moteur } = await analyserVetement(await imagePourIA(b), reglages);
      if (!analyse.ajustement) {
        toast(`${NOM_MOTEUR[moteur]} n'a pas trouvé de repères fiables : la pièce reste calée sur la mesure de la photo.`, { erreur: true });
      } else {
        await enregistrerVetement({ ...v, ajustement: analyse.ajustement, calage: { echelle: 1, dx: 0, dy: 0 } });
        toast(`Pièce réajustée sur ton mannequin (${NOM_MOTEUR[moteur]})`);
      }
    } catch (e) {
      toast(e instanceof IAIndisponible ? e.message : messageErreur(e), { erreur: true });
    } finally {
      setAjustage(false);
    }
  }
  const dernier = derniers.get(v.id);

  async function sauver(x: Vetement, message: string) {
    try {
      await enregistrerVetement(x);
      toast(message);
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    }
  }

  const pied =
    mode === "modifier" ? (
      <>
        <button className="bouton bouton--discret" onClick={() => (setMode("fiche"), setBrouillon(v))}>
          Annuler
        </button>
        <button
          className="bouton bouton--action"
          onClick={async () => {
            if (brouillon) await sauver(brouillon, "Fiche enregistrée");
            setMode("fiche");
          }}
        >
          Enregistrer la fiche
        </button>
      </>
    ) : mode === "fiche" ? (
      <>
        <button
          className="bouton bouton--action"
          onClick={() => {
            if (!cabine.pieces.includes(v.id)) basculerPiece(v, vetements);
            onFermer();
            versCabine();
          }}
        >
          <Sparkles size={18} aria-hidden /> Essayer en cabine
        </button>
        <button className="bouton bouton--discret" onClick={() => setMode("modifier")}>
          <Pencil size={16} aria-hidden /> Modifier
        </button>
      </>
    ) : null;

  return (
    <Feuille ouverte titre={mode === "photo" ? "Retoucher la photo" : v.nom || LIBELLE_PIECE[v.categorie]} onFermer={onFermer} pied={pied} large>
      {mode === "photo" ? (
        <Retouche v={v} onFini={() => setMode("fiche")} />
      ) : mode === "modifier" && brouillon ? (
        <FicheVetement v={brouillon} onChange={setBrouillon} />
      ) : (
        <div className="detail">
          <div className="detail__visuels">
            <Photo cle={v.image ?? v.image_originale} alt={v.nom} damier className="photo--grande" />
            <div className="detail__mannequin">
              <Mannequin avatar={profil.avatar} pieces={[v]} petit libelle={`${v.nom} sur ton mannequin`} />
            </div>
          </div>
          <div className="detail__dos">
            {v.image_dos ? <Photo cle={v.image_dos} alt="Dos de la pièce" damier /> : null}
            <span className="note">
              {v.image_dos ? "Photo de dos : la 3D montre le vrai dos." : "Sans photo de dos, la 3D imagine le dos à partir de la face."}
            </span>
            <input ref={fichierDos} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && ajouterDos(e.target.files[0]), (e.target.value = ""))} />
            <button className="bouton bouton--discret" onClick={() => fichierDos.current?.click()} disabled={dosEnCours}>
              {dosEnCours ? <LoaderCircle className="tourne" size={16} aria-hidden /> : null}
              {v.image_dos ? "Changer" : "Photo de dos"}
            </button>
            <button className="bouton bouton--discret" onClick={() => setLienDos(true)} disabled={dosEnCours}>
              <Link2 size={16} aria-hidden /> Lien
            </button>
          </div>
          <ImportLien
            ouverte={lienDos}
            roles={["dos"]}
            onFermer={() => setLienDos(false)}
            onImporter={({ dos }) => {
              setLienDos(false);
              if (dos) ajouterDos(dos);
            }}
          />
          <dl className="detail__infos">
            <div>
              <dt>Catégorie</dt>
              <dd>
                {LIBELLE_PIECE[v.categorie]}
                {v.sous_type && ` · ${v.sous_type}`}
                {v.longueur && ` · ${LIBELLE_LONGUEUR[v.longueur].toLowerCase()}`}
              </dd>
            </div>
            {!!v.couleurs.length && (
              <div>
                <dt>Couleurs</dt>
                <dd className="detail__couleurs">
                  <Pastilles couleurs={v.couleurs} /> {v.couleurs.map((c) => c.nom).join(", ")}
                </dd>
              </div>
            )}
            {(v.matiere || v.motif) && (
              <div>
                <dt>Matière</dt>
                <dd>{[v.matiere, v.motif !== "uni" ? v.motif : ""].filter(Boolean).join(" · ") || "Uni"}</dd>
              </div>
            )}
            <div>
              <dt>Chaleur</dt>
              <dd>{LIBELLE_CHALEUR[v.chaleur]}</dd>
            </div>
            <div>
              <dt>Saisons</dt>
              <dd>{v.saisons.length ? v.saisons.map((s) => LIBELLE_SAISON[s]).join(", ") : "Toute l'année"}</dd>
            </div>
            {!!v.occasions.length && (
              <div>
                <dt>Occasions</dt>
                <dd>{v.occasions.map((o) => LIBELLE_OCCASION[o]).join(", ")}</dd>
              </div>
            )}
            {(v.marque || v.taille) && (
              <div>
                <dt>Marque · taille</dt>
                <dd>{[v.marque, v.taille].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
            <div>
              <dt>Portée</dt>
              <dd>
                {nb ? `${nb} fois, ${depuis(dernier).replace("portée ", "")}` : "Jamais portée"}
                {v.prix != null && nb > 0 && <span className="note"> · {euros(v.prix / nb)} par port</span>}
              </dd>
            </div>
            {(v.prix != null || v.achete_le) && (
              <div>
                <dt>Achat</dt>
                <dd>{[v.prix != null ? euros(v.prix) : "", v.achete_le ? `le ${dateCourte(v.achete_le)}` : ""].filter(Boolean).join(" ")}</dd>
              </div>
            )}
            {v.notes && (
              <div>
                <dt>Notes</dt>
                <dd>{v.notes}</dd>
              </div>
            )}
          </dl>
          <div className="detail__actions">
            <button className="bouton bouton--discret" aria-pressed={v.favori} onClick={() => sauver({ ...v, favori: !v.favori }, v.favori ? "Retirée des favoris" : "Ajoutée aux favoris")}>
              <Heart size={16} aria-hidden fill={v.favori ? "currentColor" : "none"} /> {v.favori ? "Favori" : "Favori"}
            </button>
            {["haut", "bas", "robe", "veste"].includes(v.categorie) && (
              <button className="bouton bouton--discret" onClick={reajuster} disabled={ajustage}>
                {ajustage ? <LoaderCircle className="tourne" size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
                {ajustage ? "Ajustement…" : "Réajuster sur moi"}
              </button>
            )}
            {v.image_originale && (
              <button className="bouton bouton--discret" onClick={() => setMode("photo")}>
                <Scissors size={16} aria-hidden /> Retoucher la photo
              </button>
            )}
            <button
              className="bouton bouton--discret"
              onClick={() => sauver({ ...v, archive: !v.archive }, v.archive ? "Pièce ressortie du placard" : "Pièce archivée : elle ne sera plus proposée")}
            >
              {v.archive ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />} {v.archive ? "Désarchiver" : "Archiver"}
            </button>
            {confirmer ? (
              <button
                className="bouton bouton--danger"
                onClick={async () => {
                  try {
                    await supprimerVetement(v.id);
                    toast("Pièce supprimée");
                    onFermer();
                  } catch (e) {
                    toast(messageErreur(e), { erreur: true });
                  }
                }}
              >
                <Trash size={16} aria-hidden /> Confirmer la suppression
              </button>
            ) : (
              <button className="bouton bouton--discret" onClick={() => setConfirmer(true)}>
                <Trash size={16} aria-hidden /> Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </Feuille>
  );
}

/** Refaire le détourage à partir de la photo d'origine. */
function Retouche({ v, onFini }: { v: Vetement; onFini: () => void }) {
  const { depot, enregistrerVetement } = useDonnees();
  const toast = useToast();
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [tolerance, setTolerance] = useState(OPTIONS_DETOURAGE.tolerance);
  const [entiere, setEntiere] = useState(false);
  const [apercu, setApercu] = useState<{ blob: Blob; url: string; fiable: boolean } | null>(null);
  const [original, setOriginal] = useState<Blob | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!v.image_originale) return;
    depot.lireImage(v.image_originale).then(async (b) => {
      if (!b) return toast("Photo d'origine introuvable", { erreur: true });
      setOriginal(b);
      setPixels(await versPixels(b, 900));
    });
  }, [v.image_originale, depot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pixels) return;
    let actif = true;
    const r = detourer(pixels, { tolerance });
    pixelsVersBlob(r.pixels).then((blob) => {
      if (actif) setApercu((a) => (a && URL.revokeObjectURL(a.url), { blob, url: URL.createObjectURL(blob), fiable: r.fiable }));
    });
    return () => {
      actif = false;
    };
  }, [pixels, tolerance]);

  const urlOriginal = useMemo(() => (original ? URL.createObjectURL(original) : null), [original]);

  async function valider() {
    const blob = entiere ? original : apercu?.blob;
    if (!blob) return;
    setEnCours(true);
    try {
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
      const cle = `${v.id}-${Date.now().toString(36)}.${ext}`;
      await depot.ecrireImage(cle, blob);
      const ancienne = v.image;
      await enregistrerVetement({ ...v, image: cle, ajustement: null }); // nouveau cadrage : anciens repères caducs
      if (ancienne && ancienne !== v.image_originale) depot.supprimerImage(ancienne).catch(() => {});
      toast("Nouvelle photo enregistrée");
      onFini();
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="retouche">
      <div className="photo photo--damier photo--grande">
        {entiere && urlOriginal ? (
          <img src={urlOriginal} alt="Photo d'origine" />
        ) : apercu ? (
          <img src={apercu.url} alt="Photo détourée" />
        ) : (
          <LoaderCircle className="tourne" size={32} aria-label="Chargement" />
        )}
      </div>
      {!entiere && (
        <Curseur libelle="Tolérance du fond" valeur={tolerance} min={8} max={45} pas={1} gauche="Stricte" droite="Large" onChange={setTolerance} />
      )}
      <label className="case-ligne">
        <input type="checkbox" checked={entiere} onChange={(e) => setEntiere(e.target.checked)} />
        Garder la photo entière (sans détourage)
      </label>
      <div className="retouche__actions">
        <button className="bouton bouton--discret" onClick={onFini}>
          Annuler
        </button>
        <button className="bouton bouton--action" onClick={valider} disabled={enCours || (!apercu && !entiere)}>
          Enregistrer la photo
        </button>
      </div>
    </div>
  );
}
