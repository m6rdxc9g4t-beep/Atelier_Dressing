import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  Box,
  Camera,
  CloudRain,
  LoaderCircle,
  Move,
  RotateCcw,
  Save,
  ScanLine,
  Shirt,
  Shuffle,
  Sparkles,
  Sun,
  Thermometer,
  X,
} from "lucide-react";
import { Curseur, Segments, Vide, Vignette } from "../components/Elements";
import { Feuille } from "../components/Feuille";
import { Mannequin } from "../components/Mannequin";
import { useToast } from "../components/Toast";
import { basculerPiece, choisirProposition, deshabiller, habiller, montrerPropositions, oublierPropositions, useCabine, type PropositionAffichee } from "../lib/cabine";
import { CATEGORIES_CABINE, LIBELLE_CATEGORIE, LIBELLE_OCCASION, OCCASIONS, saisonDuJour } from "../lib/categories";
import { aujourdhui } from "../lib/dates";
import { useDonnees, useImage, useReglages } from "../lib/donnees";
import { creer3D, essayer, essayerHF, EssayageImpossible, memesPieces } from "../lib/essayage";
import { jetonValide } from "../lib/hf";
import { NOM_MOTEUR, proposerTenuesIA, resumeDressing } from "../lib/ia";
import { meteoDuJour, type Meteo } from "../lib/meteo";
import { nettoyerTenue, proposerTenue } from "../lib/suggestion";
import { CALAGE_NEUTRE, maintenant, nouvelId, type Calage, type Essayage, type Occasion, type Vetement } from "../lib/types";

// La 3D (three.js) n'est chargée que si on l'affiche
const Vue3D = lazy(() => import("../components/Vue3D"));

type VueCabine = "3d" | "2d" | "photo";
const lireVue = (): VueCabine => {
  try {
    const v = localStorage.getItem("dressing.vue");
    return v === "2d" || v === "photo" ? v : "3d";
  } catch {
    return "3d";
  }
};

const TEMPERATURES = [
  { v: 2, l: "Froid" },
  { v: 10, l: "Frais" },
  { v: 16, l: "Doux" },
  { v: 23, l: "Chaud" },
  { v: 30, l: "Canicule" },
];

export function Cabine({ versScanner, versReglages }: { versScanner: () => void; versReglages?: () => void }) {
  const { vetements, tenues, ports, profil, derniers, depot, essayages, enregistrerVetement, enregistrerTenue, enregistrerPort, enregistrerEssayage } =
    useDonnees();
  const [reglages] = useReglages();
  const toast = useToast();
  const cabine = useCabine();
  const [meteo, setMeteo] = useState<Meteo | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [choixMeteo, setChoixMeteo] = useState(false);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ajuster, setAjuster] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [calages, setCalages] = useState<Record<string, Calage>>({});
  const [sauver, setSauver] = useState(false);
  const [generation, setGeneration] = useState(false);
  const [suivi, setSuivi] = useState("");
  const [vue, setVueEtat] = useState<VueCabine>(lireVue);
  const setVue = (v: VueCabine) => {
    setVueEtat(v);
    try {
      localStorage.setItem("dressing.vue", v);
    } catch {
      /* rien */
    }
  };
  const minuteurs = useRef<Record<string, number>>({});

  const actifs = useMemo(() => vetements.filter((v) => !v.archive), [vetements]);
  const parId = useMemo(() => new Map(vetements.map((v) => [v.id, v])), [vetements]);
  const portees = cabine.pieces
    .map((id) => parId.get(id))
    .filter((v): v is Vetement => !!v)
    .map((v) => (calages[v.id] ? { ...v, calage: calages[v.id] } : v));

  // Dernier essayage réaliste de la tenue en cours, s'il existe
  const essai = cabine.pieces.length ? essayages.find((e) => memesPieces(e.pieces, cabine.pieces.filter((id) => parId.get(id)?.categorie !== "autre"))) : undefined;
  const photoEssai = useImage(essai?.image);
  const modele3d = useImage(essai?.modele_3d ?? undefined);
  const vueEffective: VueCabine = ajuster ? "2d" : vue;
  const avecHF = reglages.moteurEssayage !== "flux";

  /** Photo d'essayage (Leffa ou FLUX.2), puis, si demandé, le modèle 3D (TRELLIS.2). */
  async function essayageReel(aussi3D = false) {
    if ((avecHF || aussi3D) && !jetonValide(reglages.jetonHF)) {
      toast("Ajoute d'abord ton jeton Hugging Face (gratuit) dans les Réglages.", { erreur: true });
      versReglages?.();
      return;
    }
    setGeneration(true);
    setAjuster(false);
    setSuivi("Préparation des photos");
    try {
      let e: Essayage = avecHF ? await essayerHF(depot, profil, portees, reglages.jetonHF, setSuivi) : await essayer(depot, profil, portees);
      await enregistrerEssayage(e);
      if (aussi3D) {
        e = await creer3D(depot, e, reglages.jetonHF, setSuivi);
        await enregistrerEssayage(e);
        setVue("3d");
        toast("Ta tenue est en 3D : fais-la tourner au doigt");
      } else {
        setVue("photo");
        toast("Ta photo est prête, elle est gardée dans Tenues → Photos");
      }
    } catch (err) {
      toast(err instanceof EssayageImpossible ? err.message : "Essayage impossible pour le moment.", { erreur: true });
    } finally {
      setGeneration(false);
      setSuivi("");
    }
  }

  async function passerEn3D() {
    if (!essai) return essayageReel(true);
    if (!jetonValide(reglages.jetonHF)) {
      toast("Ajoute d'abord ton jeton Hugging Face (gratuit) dans les Réglages.", { erreur: true });
      versReglages?.();
      return;
    }
    setGeneration(true);
    setAjuster(false);
    setSuivi("3D");
    try {
      await enregistrerEssayage(await creer3D(depot, essai, reglages.jetonHF, setSuivi));
      setVue("3d");
      toast("Ta tenue est en 3D : fais-la tourner au doigt");
    } catch (err) {
      toast(err instanceof EssayageImpossible ? err.message : "La 3D n'a pas pu être créée.", { erreur: true });
    } finally {
      setGeneration(false);
      setSuivi("");
    }
  }

  useEffect(() => {
    if (!reglages.meteo) return;
    meteoDuJour()
      .then((m) => {
        setMeteo(m);
        setTemperature((t) => t ?? m.temperature);
      })
      .catch(() => {});
  }, [reglages.meteo]);

  // Calage : l'écran suit le doigt, l'enregistrement part une demi-seconde après
  function changerCalage(id: string, c: Calage) {
    setCalages((x) => ({ ...x, [id]: c }));
    window.clearTimeout(minuteurs.current[id]);
    minuteurs.current[id] = window.setTimeout(() => {
      const v = parId.get(id);
      if (v) enregistrerVetement({ ...v, calage: c }).catch(() => toast("Réglage non enregistré", { erreur: true }));
    }, 500);
  }

  const pluie = meteo?.pluie ?? false;
  const contexteTexte = () =>
    [
      temperature != null ? `Température ressentie : ${temperature} °C${meteo ? ` (${meteo.description.toLowerCase()})` : ""}` : "Météo inconnue",
      pluie ? "Il pleut" : "",
      `Saison : ${saisonDuJour()}`,
      occasion ? `Occasion : ${LIBELLE_OCCASION[occasion]}` : "Occasion : journée ordinaire",
    ]
      .filter(Boolean)
      .join(". ");

  function sansIA(nombre = 3): PropositionAffichee[] {
    const vues = new Set<string>();
    const res: PropositionAffichee[] = [];
    for (let i = 0; i < nombre * 4 && res.length < nombre; i++) {
      const p = proposerTenue(actifs, ports, { temperature, pluie, occasion, graine: Date.now() + i * 7919 });
      if (!p) break;
      const cle = [...p.pieces].sort().join();
      if (vues.has(cle)) continue;
      vues.add(cle);
      res.push({ nom: `Idée ${res.length + 1}`, pieces: p.pieces, explication: p.raisons.join(" "), source: "Sans IA" });
    }
    return res;
  }

  const assezDePieces =
    actifs.some((v) => v.categorie === "robe") || (actifs.some((v) => v.categorie === "haut") && actifs.some((v) => v.categorie === "bas"));

  async function proposerAvecIA() {
    if (!assezDePieces) return toast("Ajoute au moins un haut et un bas (ou une robe) pour recevoir des idées.", { erreur: true });
    setEnCours(true);
    setAjuster(false);
    try {
      const ids = new Set(actifs.map((v) => v.id));
      const { tenues: t, moteur } = await proposerTenuesIA(resumeDressing(actifs, derniers), contexteTexte(), ids, reglages);
      const propres = t.map((x) => ({ ...x, pieces: nettoyerTenue(x.pieces, actifs), source: NOM_MOTEUR[moteur] })).filter((x) => x.pieces.length >= 2);
      if (!propres.length) throw new Error("L'IA n'a pas trouvé de tenue avec ton dressing.");
      montrerPropositions(propres);
    } catch (e) {
      const idees = sansIA();
      montrerPropositions(idees);
      toast((e instanceof Error ? e.message : "L'IA ne répond pas.") + " Voici des idées composées sans IA.", { erreur: true });
    } finally {
      setEnCours(false);
    }
  }

  function auHasard() {
    if (!assezDePieces) return toast("Ajoute au moins un haut et un bas (ou une robe) pour recevoir des idées.", { erreur: true });
    const p = proposerTenue(actifs, ports, { temperature, pluie, occasion, imposees: [], graine: Date.now() });
    if (p) {
      oublierPropositions();
      habiller(p.pieces);
    }
  }

  async function porter() {
    if (!cabine.pieces.length) return;
    const ensemble = [...cabine.pieces].sort().join();
    const tenue = tenues.find((t) => [...t.pieces].sort().join() === ensemble);
    try {
      await enregistrerPort({ id: nouvelId(), porte_le: aujourdhui(), tenue_id: tenue?.id ?? null, pieces: cabine.pieces, note: "", cree_le: maintenant() });
      toast("Noté dans ton journal : tenue portée aujourd'hui");
    } catch {
      toast("Impossible de noter la tenue", { erreur: true });
    }
  }

  if (!actifs.length) {
    return (
      <section className="ecran">
        <header className="ecran__tete">
          <h1>Cabine</h1>
          <p className="ecran__sous-titre">Ton mannequin t'attend.</p>
        </header>
        <div className="cabine cabine--vide">
          <div className="panneau cabine__scene">
            <Mannequin avatar={profil.avatar} pieces={[]} />
          </div>
          <Vide
            icone={<Shirt size={36} />}
            titre="Ton dressing est vide"
            texte="Photographie tes vêtements et accessoires : ils viendront habiller ton mannequin."
            action={
              <button className="bouton bouton--action" onClick={versScanner}>
                <ScanLine size={18} aria-hidden /> Scanner une pièce
              </button>
            }
          />
        </div>
      </section>
    );
  }

  const active = cabine.propositionActive != null ? cabine.propositions[cabine.propositionActive] : null;
  const pieceChoisie = selection ? portees.find((p) => p.id === selection) : null;

  return (
    <section className="ecran">
      <header className="ecran__tete ecran__tete--avec-action">
        <div>
          <h1>Cabine</h1>
          <p className="ecran__sous-titre">
            {profil.prenom ? `${profil.prenom}, qu'est-ce qu'on porte aujourd'hui ?` : "Qu'est-ce qu'on porte aujourd'hui ?"}
          </p>
        </div>
        <button className="puce puce--meteo" onClick={() => setChoixMeteo((x) => !x)} aria-expanded={choixMeteo}>
          {pluie ? <CloudRain size={16} aria-hidden /> : temperature != null ? <Sun size={16} aria-hidden /> : <Thermometer size={16} aria-hidden />}
          {temperature != null ? `${temperature} °C` : "Météo ?"}
          {meteo && <span className="puce__sous">{meteo.description}</span>}
        </button>
      </header>

      {choixMeteo && (
        <div className="panneau cabine__meteo">
          <Segments
            etiquette="Température"
            valeur={TEMPERATURES.find((t) => t.v === temperature)?.v ?? -99}
            options={TEMPERATURES.map((t) => ({ v: t.v, l: t.l }))}
            onChange={(v) => {
              setTemperature(v);
              setChoixMeteo(false);
            }}
          />
          {meteo && (
            <button className="lien" onClick={() => (setTemperature(meteo.temperature), setChoixMeteo(false))}>
              Revenir à la météo du jour ({meteo.temperature} °C)
            </button>
          )}
        </div>
      )}

      <div className="puces puces--defile" role="group" aria-label="Occasion">
        <button className="puce" aria-pressed={occasion === null} onClick={() => setOccasion(null)}>
          Tous les jours
        </button>
        {OCCASIONS.filter((o) => o !== "quotidien").map((o) => (
          <button key={o} className="puce" aria-pressed={occasion === o} onClick={() => setOccasion(o)}>
            {LIBELLE_OCCASION[o]}
          </button>
        ))}
      </div>

      <div className="cabine">
        <div className="cabine__colonne">
          {!ajuster && (
            <div className="segments cabine__vue" role="radiogroup" aria-label="Affichage">
              {(
                [
                  ["3d", "3D"],
                  ["photo", "Photo"],
                  ["2d", "Mannequin"],
                ] as [VueCabine, string][]
              ).map(([v, l]) => (
                <button key={v} role="radio" className="segment" aria-checked={vueEffective === v} aria-selected={vueEffective === v} onClick={() => setVue(v)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div className={"panneau cabine__scene" + (ajuster ? " cabine__scene--ajuster" : "") + (vueEffective === "3d" ? " cabine__scene--3d" : "")} aria-busy={generation}>
            {vueEffective === "3d" && modele3d ? (
              <Suspense fallback={<div className="vue3d__etat">Chargement de la 3D…</div>}>
                <Vue3D url={modele3d} libelle={"Toi en 3D, portant : " + portees.map((p) => p.nom).join(", ") + "."} />
              </Suspense>
            ) : vueEffective !== "2d" && photoEssai ? (
              <img className="cabine__photo" src={photoEssai} alt={"Toi, portant : " + portees.map((p) => p.nom).join(", ")} />
            ) : (
              <Mannequin
                avatar={profil.avatar}
                pieces={portees}
                selection={ajuster ? selection : null}
                onSelection={ajuster ? setSelection : undefined}
                onCalage={ajuster ? changerCalage : undefined}
                libelle={portees.length ? "Ton mannequin porte : " + portees.map((p) => p.nom).join(", ") : "Ton mannequin, sans vêtement"}
              />
            )}
            {!portees.length && <p className="cabine__invite">Touche une pièce à droite, ou laisse l'IA composer une tenue.</p>}
            {!generation && portees.length > 0 && vueEffective === "3d" && !modele3d && (
              <div className="cabine__appel">
                <p>{essai ? "Fais tourner cette photo en 3D." : "La 3D part d'une photo de toi qui porte la tenue : on la crée d'abord, puis le volume."}</p>
                <button className="bouton bouton--action" onClick={passerEn3D}>
                  <Box size={18} aria-hidden /> Créer la 3D
                </button>
              </div>
            )}
            {!generation && portees.length > 0 && vueEffective === "photo" && !photoEssai && (
              <div className="cabine__appel">
                <p>Une vraie photo de toi qui porte ces pièces.</p>
                <button className="bouton bouton--action" onClick={() => essayageReel()}>
                  <Camera size={18} aria-hidden /> Essayage réaliste
                </button>
              </div>
            )}
            {generation && (
              <div className="cabine__generation" role="status">
                <LoaderCircle className="tourne" size={32} aria-hidden />
                <p>{suivi || "Préparation…"}</p>
                <p className="note">{avecHF ? "Hugging Face : de 30 secondes à quelques minutes selon la file d'attente." : "Environ 20 à 40 secondes."}</p>
              </div>
            )}
          </div>

          {ajuster && (
            <div className="panneau cabine__ajuster">
              {pieceChoisie ? (
                <>
                  <p className="groupe__titre">Ajuster : {pieceChoisie.nom}</p>
                  <Curseur
                    libelle="Taille"
                    valeur={pieceChoisie.calage.echelle}
                    min={0.4}
                    max={2.5}
                    pas={0.01}
                    affichage={`${Math.round(pieceChoisie.calage.echelle * 100)} %`}
                    onChange={(n) => changerCalage(pieceChoisie.id, { ...pieceChoisie.calage, echelle: n })}
                  />
                  <Curseur
                    libelle="Gauche / droite"
                    valeur={pieceChoisie.calage.dx}
                    min={-0.5}
                    max={0.5}
                    pas={0.005}
                    onChange={(n) => changerCalage(pieceChoisie.id, { ...pieceChoisie.calage, dx: n })}
                  />
                  <Curseur
                    libelle="Haut / bas"
                    valeur={pieceChoisie.calage.dy}
                    min={-0.5}
                    max={0.5}
                    pas={0.005}
                    onChange={(n) => changerCalage(pieceChoisie.id, { ...pieceChoisie.calage, dy: n })}
                  />
                  <button className="bouton bouton--discret" onClick={() => changerCalage(pieceChoisie.id, { ...CALAGE_NEUTRE })}>
                    <RotateCcw size={16} aria-hidden /> Position automatique
                  </button>
                </>
              ) : (
                <p className="note">Touche une pièce sur le mannequin, puis fais-la glisser. Le réglage est gardé pour toutes tes tenues.</p>
              )}
            </div>
          )}

          {cabine.propositions.length > 0 && (
            <div className="panneau propositions">
              <div className="propositions__tete">
                <div className="segments" role="radiogroup" aria-label="Propositions">
                  {cabine.propositions.map((p, i) => (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={cabine.propositionActive === i}
                      aria-selected={cabine.propositionActive === i}
                      className="segment"
                      onClick={() => choisirProposition(i)}
                    >
                      {p.nom}
                    </button>
                  ))}
                </div>
                <button className="bouton-icone" onClick={oublierPropositions} aria-label="Fermer les propositions">
                  <X size={18} />
                </button>
              </div>
              {active ? (
                <p className="propositions__texte">
                  {active.explication || "Une tenue composée avec ton dressing."}
                  <span className="propositions__source">{active.source}</span>
                </p>
              ) : (
                <p className="note">Tu as modifié la tenue proposée.</p>
              )}
            </div>
          )}

          <div className="cabine__actions">
            <button className="bouton bouton--action" onClick={proposerAvecIA} disabled={enCours}>
              {enCours ? <LoaderCircle className="tourne" size={18} aria-hidden /> : <Sparkles size={18} aria-hidden />}
              {enCours ? "Le styliste réfléchit…" : "Proposer une tenue"}
            </button>
            <button className="bouton bouton--discret" onClick={() => essayageReel()} disabled={!portees.length || generation} title="Une vraie photo de toi avec ces pièces">
              <Camera size={18} aria-hidden /> {essai ? "Refaire la photo" : "Essayage réaliste"}
            </button>
            {essai && (
              <button className="bouton bouton--discret" onClick={passerEn3D} disabled={generation} title="Le modèle 3D tiré de la photo d'essayage">
                <Box size={18} aria-hidden /> {essai.modele_3d ? "Refaire la 3D" : "Créer la 3D"}
              </button>
            )}
            <button className="bouton bouton--discret" onClick={auHasard} title="Tirage instantané, sans IA">
              <Shuffle size={18} aria-hidden /> Au hasard
            </button>
            <button className="bouton bouton--discret" aria-pressed={ajuster} onClick={() => (setAjuster((x) => !x), setSelection(null))} disabled={!portees.length}>
              <Move size={18} aria-hidden /> {ajuster ? "Terminer" : "Ajuster"}
            </button>
          </div>
          <div className="cabine__actions">
            <button className="bouton bouton--discret" onClick={() => setSauver(true)} disabled={cabine.pieces.length < 2}>
              <Save size={18} aria-hidden /> Enregistrer la tenue
            </button>
            <button className="bouton bouton--discret" onClick={porter} disabled={!cabine.pieces.length}>
              <CalendarCheck size={18} aria-hidden /> Je la porte aujourd'hui
            </button>
            <button className="bouton bouton--discret" onClick={() => (deshabiller(), setSelection(null))} disabled={!cabine.pieces.length}>
              Tout enlever
            </button>
          </div>
        </div>

        <div className="panneau portant" aria-label="Tes pièces">
          {CATEGORIES_CABINE.map((c) => {
            const liste = actifs.filter((v) => v.categorie === c);
            if (!liste.length) return null;
            return (
              <div key={c} className="portant__rayon">
                <h2 className="groupe__titre">{LIBELLE_CATEGORIE[c]}</h2>
                <div className="portant__liste">
                  {liste.map((v) => (
                    <Vignette
                      key={v.id}
                      v={v}
                      compacte
                      active={cabine.pieces.includes(v.id)}
                      onClick={() => {
                        basculerPiece(v, vetements);
                        setSelection(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <EnregistrerTenue
        ouverte={sauver}
        nomPropose={active?.nom ?? ""}
        occasion={occasion}
        onFermer={() => setSauver(false)}
        onValider={async (nom, occ) => {
          const pieces = cabine.pieces.map((id) => parId.get(id)).filter((v): v is Vetement => !!v);
          const saisons = ["printemps", "ete", "automne", "hiver"].filter((s) =>
            pieces.every((p) => !p.saisons.length || p.saisons.includes(s as never)),
          ) as Vetement["saisons"];
          try {
            await enregistrerTenue({
              id: nouvelId(),
              nom: nom || "Ma tenue",
              pieces: cabine.pieces,
              occasion: occ,
              saisons: saisons.length === 4 ? [] : saisons,
              note: active?.explication ?? "",
              favori: false,
              cree_le: maintenant(),
              maj_le: maintenant(),
            });
            toast(`Tenue « ${nom || "Ma tenue"} » enregistrée`);
            setSauver(false);
          } catch {
            toast("Impossible d'enregistrer la tenue", { erreur: true });
          }
        }}
      />
    </section>
  );
}

function EnregistrerTenue({
  ouverte,
  nomPropose,
  occasion,
  onFermer,
  onValider,
}: {
  ouverte: boolean;
  nomPropose: string;
  occasion: Occasion | null;
  onFermer: () => void;
  onValider: (nom: string, occasion: Occasion | null) => void;
}) {
  const [nom, setNom] = useState(nomPropose);
  const [occ, setOcc] = useState<Occasion | null>(occasion);
  useEffect(() => {
    if (ouverte) {
      setNom(nomPropose.startsWith("Idée ") ? "" : nomPropose);
      setOcc(occasion);
    }
  }, [ouverte, nomPropose, occasion]);
  return (
    <Feuille
      ouverte={ouverte}
      titre="Enregistrer la tenue"
      onFermer={onFermer}
      pied={
        <button className="bouton bouton--action" onClick={() => onValider(nom.trim(), occ)}>
          <Save size={18} aria-hidden /> Enregistrer la tenue
        </button>
      }
    >
      <div className="formulaire">
        <label className="champ-groupe">
          <span>Nom de la tenue</span>
          <input className="champ" value={nom} placeholder="Lundi au bureau" onChange={(e) => setNom(e.target.value)} autoFocus />
        </label>
        <div className="champ-groupe">
          <span>Occasion</span>
          <div className="puces">
            {OCCASIONS.map((o) => (
              <button key={o} type="button" className="puce" aria-pressed={occ === o} onClick={() => setOcc(occ === o ? null : o)}>
                {LIBELLE_OCCASION[o]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Feuille>
  );
}
