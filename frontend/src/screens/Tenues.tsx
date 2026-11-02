import { useMemo, useState } from "react";
import { Camera, CalendarCheck, Download, Heart, Layers, Sparkles, Trash } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { Segments, Vide, Vignette } from "../components/Elements";
import { Mannequin } from "../components/Mannequin";
import { useToast } from "../components/Toast";
import { habiller } from "../lib/cabine";
import { CATEGORIES, LIBELLE_CATEGORIE, LIBELLE_OCCASION } from "../lib/categories";
import { aujourdhui, dateLongue, depuis, euros } from "../lib/dates";
import { useDonnees, useImage } from "../lib/donnees";
import { memesPieces } from "../lib/essayage";
import { messageErreur } from "../lib/supabase";
import { maintenant, nouvelId, type Essayage, type Tenue, type Vetement } from "../lib/types";

type Vue = "tenues" | "photos" | "journal" | "bilan";

export function Tenues({ versCabine }: { versCabine: () => void }) {
  const [vue, setVue] = useState<Vue>("tenues");
  return (
    <section className="ecran">
      <header className="ecran__tete">
        <h1>Tenues</h1>
        <p className="ecran__sous-titre">Tes tenues enregistrées, ce que tu as porté, et le bilan de ton dressing.</p>
      </header>
      <Segments
        etiquette="Vue"
        valeur={vue}
        onChange={setVue}
        options={[
          { v: "tenues", l: "Mes tenues" },
          { v: "photos", l: "Photos" },
          { v: "journal", l: "Journal" },
          { v: "bilan", l: "Bilan" },
        ]}
      />
      {vue === "tenues" && <ListeTenues versCabine={versCabine} />}
      {vue === "photos" && <Photos versCabine={versCabine} />}
      {vue === "journal" && <Journal />}
      {vue === "bilan" && <Bilan />}
    </section>
  );
}

function ListeTenues({ versCabine }: { versCabine: () => void }) {
  const { tenues, vetements, ports, profil, essayages, enregistrerTenue, supprimerTenue, enregistrerPort } = useDonnees();
  const toast = useToast();
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const parId = useMemo(() => new Map(vetements.map((v) => [v.id, v])), [vetements]);
  const portsParTenue = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of ports) if (p.tenue_id) m.set(p.tenue_id, (m.get(p.tenue_id) ?? 0) + 1);
    return m;
  }, [ports]);
  const triees = [...tenues].sort((a, b) => Number(b.favori) - Number(a.favori) || b.cree_le.localeCompare(a.cree_le));

  if (!tenues.length)
    return (
      <Vide
        icone={<Layers size={36} />}
        titre="Aucune tenue enregistrée"
        texte="Compose une tenue en cabine (ou laisse l'IA le faire), puis touche « Enregistrer la tenue »."
        action={
          <button className="bouton bouton--action" onClick={versCabine}>
            <Sparkles size={18} aria-hidden /> Aller en cabine
          </button>
        }
      />
    );

  const porter = async (t: Tenue) => {
    try {
      await enregistrerPort({ id: nouvelId(), porte_le: aujourdhui(), tenue_id: t.id, pieces: t.pieces, note: "", cree_le: maintenant() });
      toast(`« ${t.nom} » notée pour aujourd'hui`);
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    }
  };

  return (
    <div className="grille-tenues">
      {triees.map((t) => {
        const pieces = t.pieces.map((id) => parId.get(id)).filter((v): v is Vetement => !!v);
        const n = portsParTenue.get(t.id) ?? 0;
        return (
          <article key={t.id} className="panneau carte-tenue">
            <button
              className="carte-tenue__visuel"
              onClick={() => {
                habiller(t.pieces);
                versCabine();
              }}
              aria-label={`Essayer « ${t.nom} » en cabine`}
            >
              <VisuelTenue
                essai={essayages.find((e) => memesPieces(e.pieces, pieces.filter((p) => p.categorie !== "autre").map((p) => p.id)))}
                libelle={`${t.nom} : ${pieces.map((p) => p.nom).join(", ")}`}
              >
                <Mannequin avatar={profil.avatar} pieces={pieces} petit libelle={`${t.nom} : ${pieces.map((p) => p.nom).join(", ")}`} />
              </VisuelTenue>
            </button>
            <div className="carte-tenue__texte">
              <h2 className="carte-tenue__nom">
                {t.nom}
                {t.favori && <Heart size={14} className="carte-tenue__favori" fill="currentColor" aria-label="Favorite" />}
              </h2>
              <p className="note">
                {[t.occasion ? LIBELLE_OCCASION[t.occasion] : "", `${pieces.length} pièce${pieces.length > 1 ? "s" : ""}`, n ? `portée ${n}×` : "jamais portée"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="carte-tenue__actions">
              <button className="bouton-icone" onClick={() => porter(t)} aria-label={`Je porte « ${t.nom} » aujourd'hui`} title="Je la porte aujourd'hui">
                <CalendarCheck size={18} />
              </button>
              <button
                className="bouton-icone"
                aria-pressed={t.favori}
                onClick={() => enregistrerTenue({ ...t, favori: !t.favori }).catch((e) => toast(messageErreur(e), { erreur: true }))}
                aria-label={t.favori ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                <Heart size={18} fill={t.favori ? "currentColor" : "none"} />
              </button>
              {aSupprimer === t.id ? (
                <button
                  className="bouton bouton--danger bouton--petit"
                  onClick={() => supprimerTenue(t.id).then(() => toast("Tenue supprimée"), (e) => toast(messageErreur(e), { erreur: true }))}
                >
                  Supprimer ?
                </button>
              ) : (
                <button className="bouton-icone" onClick={() => setASupprimer(t.id)} aria-label={`Supprimer « ${t.nom} »`}>
                  <Trash size={18} />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Journal() {
  const { ports, vetements, tenues, supprimerPort } = useDonnees();
  const toast = useToast();
  const parId = useMemo(() => new Map(vetements.map((v) => [v.id, v])), [vetements]);
  const tenueParId = useMemo(() => new Map(tenues.map((t) => [t.id, t])), [tenues]);
  if (!ports.length)
    return (
      <Vide
        icone={<CalendarCheck size={36} />}
        titre="Ton journal est vide"
        texte="En cabine, « Je la porte aujourd'hui » note ta tenue ici. Le dressing saura alors ce qui dort au placard."
      />
    );
  return (
    <ol className="journal">
      {ports.slice(0, 120).map((p) => {
        const pieces = p.pieces.map((id) => parId.get(id)).filter((v): v is Vetement => !!v);
        const t = p.tenue_id ? tenueParId.get(p.tenue_id) : null;
        return (
          <li key={p.id} className="panneau journal__jour">
            <div className="journal__tete">
              <div>
                <p className="journal__date">{dateLongue(p.porte_le)}</p>
                <p className="note">{t ? t.nom : `${pieces.length} pièce${pieces.length > 1 ? "s" : ""}`}</p>
              </div>
              <button
                className="bouton-icone"
                aria-label="Retirer ce jour du journal"
                onClick={() => supprimerPort(p.id).then(() => toast("Jour retiré du journal"), (e) => toast(messageErreur(e), { erreur: true }))}
              >
                <Trash size={18} />
              </button>
            </div>
            <div className="journal__pieces">
              {pieces.map((v) => (
                <Vignette key={v.id} v={v} compacte onClick={() => {}} />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Bilan() {
  const { vetements, compteurs, derniers } = useDonnees();
  const actifs = vetements.filter((v) => !v.archive);
  const valeur = actifs.reduce((s, v) => s + (v.prix ?? 0), 0);
  const avecPrix = actifs.filter((v) => v.prix != null && (compteurs.get(v.id) ?? 0) > 0);
  const coutMoyen = avecPrix.length ? avecPrix.reduce((s, v) => s + v.prix! / (compteurs.get(v.id) ?? 1), 0) / avecPrix.length : null;
  const ilYa90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const recentes = actifs.filter((v) => (derniers.get(v.id) ?? "") >= ilYa90).length;
  const aRessortir = actifs
    .filter((v) => v.categorie !== "autre" && (derniers.get(v.id) ?? "") < new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
    .sort((a, b) => (derniers.get(a.id) ?? "").localeCompare(derniers.get(b.id) ?? ""))
    .slice(0, 12);
  const top = [...actifs].filter((v) => compteurs.get(v.id)).sort((a, b) => (compteurs.get(b.id) ?? 0) - (compteurs.get(a.id) ?? 0)).slice(0, 5);

  return (
    <div className="bilan">
      <div className="tuiles">
        <div className="panneau tuile-chiffre">
          <span className="tuile-chiffre__valeur">{actifs.length}</span>
          <span className="tuile-chiffre__libelle">pièces dans le dressing</span>
        </div>
        <div className="panneau tuile-chiffre">
          <span className="tuile-chiffre__valeur">{actifs.length ? Math.round((recentes / actifs.length) * 100) : 0} %</span>
          <span className="tuile-chiffre__libelle">portées ces 90 derniers jours</span>
        </div>
        {valeur > 0 && (
          <div className="panneau tuile-chiffre">
            <span className="tuile-chiffre__valeur">{euros(valeur)}</span>
            <span className="tuile-chiffre__libelle">valeur d'achat</span>
          </div>
        )}
        {coutMoyen != null && (
          <div className="panneau tuile-chiffre">
            <span className="tuile-chiffre__valeur">{euros(coutMoyen)}</span>
            <span className="tuile-chiffre__libelle">coût moyen par port</span>
          </div>
        )}
      </div>

      <div className="panneau">
        <h2 className="groupe__titre">Répartition</h2>
        <ul className="repartition">
          {CATEGORIES.map((c) => ({ c, n: actifs.filter((v) => v.categorie === c).length }))
            .filter((x) => x.n)
            .map(({ c, n }) => (
              <li key={c}>
                <span>{LIBELLE_CATEGORIE[c]}</span>
                <strong>{n}</strong>
              </li>
            ))}
        </ul>
      </div>

      {aRessortir.length > 0 && (
        <div className="panneau">
          <h2 className="groupe__titre">À ressortir du placard</h2>
          <p className="note">Pas portées depuis plus de deux mois. L'IA et le tirage au hasard les mettent en avant.</p>
          <div className="liste-mini">
            {aRessortir.map((v) => (
              <div key={v.id} className="liste-mini__el">
                <Vignette v={v} compacte onClick={() => {}} />
                <span>
                  <span className="liste-mini__nom">{v.nom}</span>
                  <span className="note">{depuis(derniers.get(v.id))}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {top.length > 0 && (
        <div className="panneau">
          <h2 className="groupe__titre">Tes pièces préférées</h2>
          <div className="liste-mini">
            {top.map((v) => (
              <div key={v.id} className="liste-mini__el">
                <Vignette v={v} compacte onClick={() => {}} />
                <span>
                  <span className="liste-mini__nom">{v.nom}</span>
                  <span className="note">
                    {compteurs.get(v.id)} fois{v.prix != null ? ` · ${euros(v.prix / (compteurs.get(v.id) ?? 1))} par port` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** La photo réaliste de la tenue si elle existe, sinon le mannequin. */
function VisuelTenue({ essai, libelle, children }: { essai?: Essayage; libelle: string; children: React.ReactNode }) {
  const url = useImage(essai?.image);
  return url ? <img className="carte-tenue__photo" src={url} alt={libelle} /> : <>{children}</>;
}

function Photos({ versCabine }: { versCabine: () => void }) {
  const { essayages, vetements, supprimerEssayage } = useDonnees();
  const toast = useToast();
  const [ouverte, setOuverte] = useState<Essayage | null>(null);
  const parId = useMemo(() => new Map(vetements.map((v) => [v.id, v])), [vetements]);
  if (!essayages.length)
    return (
      <Vide
        icone={<Camera size={36} />}
        titre="Aucune photo d'essayage"
        texte="En cabine, habille le mannequin puis touche « Essayage réaliste » : une vraie photo de toi avec ces pièces arrive ici."
        action={
          <button className="bouton bouton--action" onClick={versCabine}>
            <Sparkles size={18} aria-hidden /> Aller en cabine
          </button>
        }
      />
    );
  const pieces = ouverte ? ouverte.pieces.map((id) => parId.get(id)).filter((v): v is Vetement => !!v) : [];
  return (
    <>
      <div className="grille-photos">
        {essayages.map((e) => (
          <MiniPhoto key={e.id} e={e} onClick={() => setOuverte(e)} />
        ))}
      </div>
      <Feuille
        ouverte={!!ouverte}
        titre="Essayage"
        large
        onFermer={() => setOuverte(null)}
        pied={
          ouverte && (
            <>
              <button
                className="bouton bouton--action"
                onClick={() => {
                  habiller(ouverte.pieces);
                  setOuverte(null);
                  versCabine();
                }}
              >
                <Sparkles size={18} aria-hidden /> Ouvrir en cabine
              </button>
              <TelechargerPhoto e={ouverte} />
              <button
                className="bouton bouton--discret"
                onClick={() =>
                  supprimerEssayage(ouverte.id).then(
                    () => (setOuverte(null), toast("Photo supprimée")),
                    (err) => toast(messageErreur(err), { erreur: true }),
                  )
                }
              >
                <Trash size={16} aria-hidden /> Supprimer
              </button>
            </>
          )
        }
      >
        {ouverte && (
          <div className="essai">
            <GrandePhoto e={ouverte} />
            <div className="journal__pieces">
              {pieces.map((v) => (
                <Vignette key={v.id} v={v} compacte onClick={() => {}} />
              ))}
            </div>
            <p className="note">
              {dateLongue(ouverte.cree_le.slice(0, 10))} · {ouverte.moteur}
            </p>
          </div>
        )}
      </Feuille>
    </>
  );
}

function MiniPhoto({ e, onClick }: { e: Essayage; onClick: () => void }) {
  const url = useImage(e.image);
  return (
    <button className="mini-photo" onClick={onClick} aria-label={`Essayage du ${dateLongue(e.cree_le.slice(0, 10))}`}>
      {url ? <img src={url} alt="" /> : null}
    </button>
  );
}

function GrandePhoto({ e }: { e: Essayage }) {
  const url = useImage(e.image);
  return url ? <img className="essai__photo" src={url} alt="Essayage réaliste" /> : null;
}

function TelechargerPhoto({ e }: { e: Essayage }) {
  const url = useImage(e.image);
  return url ? (
    <a className="bouton bouton--discret" href={url} download={`essayage-${e.cree_le.slice(0, 10)}.jpg`}>
      <Download size={16} aria-hidden /> Télécharger
    </a>
  ) : null;
}
