import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, LoaderCircle, RotateCcw, Save, ScanFace, Sparkles, UserRound, X } from "lucide-react";
import { Curseur, Segments } from "../components/Elements";
import { Feuille } from "../components/Feuille";
import { Mannequin } from "../components/Mannequin";
import { useToast } from "../components/Toast";
import { useDonnees, useImage, useReglages } from "../lib/donnees";
import { analyserSilhouette, IAIndisponible, NOM_MOTEUR } from "../lib/ia";
import { imagePourIA, recadrerCarre, reduireEnJpeg } from "../lib/images";
import { tailleLisible } from "../lib/mannequin";
import { messageErreur } from "../lib/supabase";
import { AVATAR_DEFAUT, type Avatar, type LongueurCheveux, type Morphologie } from "../lib/types";

const CARNATIONS = ["#f6dcc8", "#eac0a0", "#d9a982", "#c68e6a", "#a86f4c", "#8a5536", "#6b3f27", "#4a2b1b"];
const CHEVEUX = [
  { hex: "#1b1512", nom: "Noir" },
  { hex: "#3b2a20", nom: "Brun" },
  { hex: "#6a4630", nom: "Châtain" },
  { hex: "#8a3f22", nom: "Auburn" },
  { hex: "#a57b4b", nom: "Blond foncé" },
  { hex: "#d6b47c", nom: "Blond" },
  { hex: "#b5512a", nom: "Roux" },
  { hex: "#9d9a96", nom: "Gris" },
  { hex: "#e7e3dc", nom: "Blanc" },
];

export function Moi() {
  const { profil, depot, enregistrerProfil } = useDonnees();
  const [reglages] = useReglages();
  const toast = useToast();
  const [prenom, setPrenom] = useState(profil.prenom);
  const [a, setA] = useState<Avatar>(profil.avatar);
  const [analyse, setAnalyse] = useState(false);
  const [visageSource, setVisageSource] = useState<File | null>(null);
  const silhouette = useRef<HTMLInputElement>(null);
  const visage = useRef<HTMLInputElement>(null);
  const photoPied = useImage(a.photo_pied);

  // Suit les changements venus d'un autre appareil tant que rien n'est en cours d'édition
  const modifie = prenom !== profil.prenom || JSON.stringify(a) !== JSON.stringify(profil.avatar);
  useEffect(() => {
    if (!modifie) {
      setPrenom(profil.prenom);
      setA(profil.avatar);
    }
  }, [profil]); // eslint-disable-line react-hooks/exhaustive-deps

  const maj = (p: Partial<Avatar>) => setA((x) => ({ ...x, ...p }));

  async function enregistrer(av = a) {
    try {
      await enregistrerProfil({ ...profil, prenom: prenom.trim(), avatar: av });
      toast("Mannequin enregistré");
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    }
  }

  async function depuisPhoto(f: Blob) {
    setAnalyse(true);
    try {
      const { avatar, moteur } = await analyserSilhouette(await imagePourIA(f, 1024), reglages);
      setA((x) => ({ ...x, ...avatar }));
      toast(`Proportions estimées par ${NOM_MOTEUR[moteur]}. Vérifie, puis enregistre ton mannequin.`);
    } catch (e) {
      toast(e instanceof IAIndisponible ? e.message : "Analyse impossible : " + messageErreur(e), { erreur: true });
    } finally {
      setAnalyse(false);
    }
  }

  async function choisirPhoto(f: File) {
    try {
      const cle = `pied-${Date.now().toString(36)}.jpg`;
      await depot.ecrireImage(cle, await reduireEnJpeg(f, 1600, 0.9));
      const ancienne = profil.avatar.photo_pied;
      // Enregistrée tout de suite (le reste du brouillon aussi)
      const av = { ...a, photo_pied: cle };
      setA(av);
      await enregistrerProfil({ ...profil, prenom: prenom.trim(), avatar: av });
      if (ancienne) depot.supprimerImage(ancienne).catch(() => {});
      toast("Photo en pied enregistrée", { action: { label: "Régler le mannequin", faire: () => depuisPhoto(f) } });
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    }
  }

  async function reglerAvecPhoto() {
    if (!a.photo_pied) return;
    const b = await depot.lireImage(a.photo_pied);
    if (b) depuisPhoto(b);
  }

  async function retirerPhoto() {
    const ancienne = a.photo_pied;
    const av = { ...a, photo_pied: null };
    setA(av);
    await enregistrer(av);
    if (ancienne) depot.supprimerImage(ancienne).catch(() => {});
  }

  return (
    <section className="ecran">
      <header className="ecran__tete ecran__tete--avec-action">
        <div>
          <h1>Mon mannequin</h1>
          <p className="ecran__sous-titre">Il prend tes proportions pour que tes tenues tombent comme sur toi.</p>
        </div>
      </header>

      <div className="moi">
        <div className="panneau moi__apercu">
          <Mannequin avatar={a} pieces={[]} libelle="Aperçu de ton mannequin" />
          <p className="moi__taille">
            {prenom || "Toi"} · {tailleLisible(a.taille_cm)}
          </p>
        </div>

        <div className="moi__reglages">
          <div className="panneau moi__photo">
            <div className="moi__photo-vignette">
              {photoPied ? <img src={photoPied} alt="Ta photo en pied" /> : <ScanFace size={36} aria-hidden className="moi__ia-icone" />}
            </div>
            <div className="moi__photo-texte">
              <p className="groupe__titre">Ta photo en pied</p>
              <p className="note">
                Elle sert à l'<strong>essayage réaliste</strong> : une vraie photo de toi qui porte tes pièces. De face, debout, bras un peu
                écartés du corps, vêtements près du corps, fond simple et bonne lumière.
              </p>
              <input ref={silhouette} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && choisirPhoto(e.target.files[0]), (e.target.value = ""))} />
              <div className="moi__visage-actions">
                <button className="bouton bouton--action" onClick={() => silhouette.current?.click()} disabled={analyse}>
                  <Camera size={18} aria-hidden /> {a.photo_pied ? "Changer de photo" : "Ajouter ma photo"}
                </button>
                {a.photo_pied && (
                  <button className="bouton bouton--discret" onClick={reglerAvecPhoto} disabled={analyse}>
                    {analyse ? <LoaderCircle className="tourne" size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
                    {analyse ? "Analyse…" : "Régler le mannequin avec l'IA"}
                  </button>
                )}
                {a.photo_pied && (
                  <button className="bouton bouton--discret" onClick={retirerPhoto}>
                    <X size={16} aria-hidden /> Retirer
                  </button>
                )}
              </div>
              <p className="note">
                Ta photo reste dans ton dressing. Elle n'est envoyée au service d'image (Black Forest Labs) qu'au moment où tu demandes un essayage, et à
                l'IA choisie (Ollama ou Claude) quand tu règles le mannequin.
              </p>
            </div>
          </div>

          <div className="panneau formulaire">
            <label className="champ-groupe">
              <span>Prénom</span>
              <input className="champ" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="François" />
            </label>
            <div className="champ-groupe">
              <span>Silhouette</span>
              <Segments<Morphologie>
                etiquette="Silhouette"
                valeur={a.morphologie}
                onChange={(m) => maj({ morphologie: m })}
                options={[
                  { v: "feminine", l: "Féminine" },
                  { v: "neutre", l: "Neutre" },
                  { v: "masculine", l: "Masculine" },
                ]}
              />
            </div>
            <Curseur libelle="Taille" valeur={a.taille_cm} min={140} max={210} pas={1} affichage={tailleLisible(a.taille_cm)} onChange={(n) => maj({ taille_cm: n })} />
            <Curseur libelle="Épaules" valeur={a.epaules} min={0.8} max={1.25} pas={0.01} gauche="Étroites" droite="Larges" onChange={(n) => maj({ epaules: n })} />
            <Curseur libelle="Poitrine" valeur={a.poitrine} min={0.8} max={1.25} pas={0.01} gauche="Menue" droite="Généreuse" onChange={(n) => maj({ poitrine: n })} />
            <Curseur libelle="Taille (tour)" valeur={a.tour_taille} min={0.8} max={1.3} pas={0.01} gauche="Fine" droite="Large" onChange={(n) => maj({ tour_taille: n })} />
            <Curseur libelle="Hanches" valeur={a.hanches} min={0.8} max={1.3} pas={0.01} gauche="Étroites" droite="Larges" onChange={(n) => maj({ hanches: n })} />
            <Curseur libelle="Jambes" valeur={a.jambes} min={0.9} max={1.1} pas={0.01} gauche="Plus courtes" droite="Plus longues" onChange={(n) => maj({ jambes: n })} />
          </div>

          <div className="panneau formulaire">
            <div className="champ-groupe">
              <span>Carnation</span>
              <div className="nuancier" role="radiogroup" aria-label="Carnation">
                {CARNATIONS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={a.carnation === c}
                    aria-label={`Carnation ${c}`}
                    className="nuancier__pastille"
                    style={{ background: c }}
                    onClick={() => maj({ carnation: c })}
                  />
                ))}
                <label className="nuancier__pastille nuancier__libre" style={{ background: a.carnation }} title="Autre teinte">
                  <input type="color" value={a.carnation} onChange={(e) => maj({ carnation: e.target.value })} aria-label="Autre carnation" />
                </label>
              </div>
            </div>
            <div className="champ-groupe">
              <span>Cheveux</span>
              <div className="nuancier" role="radiogroup" aria-label="Couleur des cheveux">
                {CHEVEUX.map((c) => (
                  <button
                    key={c.hex}
                    role="radio"
                    aria-checked={a.cheveux_couleur === c.hex}
                    aria-label={c.nom}
                    title={c.nom}
                    className="nuancier__pastille"
                    style={{ background: c.hex }}
                    onClick={() => maj({ cheveux_couleur: c.hex })}
                  />
                ))}
              </div>
              <Segments<LongueurCheveux>
                etiquette="Longueur des cheveux"
                valeur={a.cheveux_longueur}
                onChange={(l) => maj({ cheveux_longueur: l })}
                options={[
                  { v: "rase", l: "Rasés" },
                  { v: "court", l: "Courts" },
                  { v: "mi_long", l: "Mi-longs" },
                  { v: "long", l: "Longs" },
                ]}
              />
            </div>
            <div className="champ-groupe">
              <span>Visage</span>
              <p className="note">Ta photo dans l'ovale du visage, pour te reconnaître en un coup d'œil (facultatif).</p>
              <input ref={visage} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && setVisageSource(e.target.files[0]), (e.target.value = ""))} />
              <div className="moi__visage-actions">
                <button className="bouton bouton--discret" onClick={() => visage.current?.click()}>
                  <UserRound size={16} aria-hidden /> {a.visage ? "Changer de photo" : "Ajouter mon visage"}
                </button>
                {a.visage && (
                  <button className="bouton bouton--discret" onClick={() => maj({ visage: null })}>
                    <X size={16} aria-hidden /> Retirer
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="barre-action moi__barre">
            <button className="bouton bouton--discret" onClick={() => setA({ ...AVATAR_DEFAUT, visage: a.visage })}>
              <RotateCcw size={16} aria-hidden /> Proportions par défaut
            </button>
            <button className="bouton bouton--action" onClick={() => enregistrer()} disabled={!modifie}>
              <Save size={18} aria-hidden /> {modifie ? "Enregistrer mon mannequin" : "Mannequin enregistré"}
            </button>
          </div>
        </div>
      </div>

      <Recadrage
        source={visageSource}
        onFermer={() => setVisageSource(null)}
        onValider={async (blob) => {
          try {
            const cle = `visage-${Date.now().toString(36)}.jpg`;
            await depot.ecrireImage(cle, blob);
            const ancien = a.visage;
            const av = { ...a, visage: cle };
            setA(av);
            setVisageSource(null);
            await enregistrer(av);
            if (ancien) depot.supprimerImage(ancien).catch(() => {});
          } catch (e) {
            toast(messageErreur(e), { erreur: true });
          }
        }}
      />
    </section>
  );
}

function Recadrage({ source, onFermer, onValider }: { source: File | null; onFermer: () => void; onValider: (b: Blob) => void }) {
  const [zoom, setZoom] = useState(1.6);
  const [cx, setCx] = useState(0.5);
  const [cy, setCy] = useState(0.35);
  const url = useMemo(() => (source ? URL.createObjectURL(source) : null), [source]);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    setDims(null);
    if (!url) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }, [url]);
  useEffect(() => {
    setZoom(1.6);
    setCx(0.5);
    setCy(0.35);
  }, [source]);
  return (
    <Feuille
      ouverte={!!source}
      titre="Cadrer ton visage"
      onFermer={onFermer}
      pied={
        <button className="bouton bouton--action" onClick={async () => source && onValider(await recadrerCarre(source, zoom, cx, cy))}>
          Utiliser ce visage
        </button>
      }
    >
      <div className="recadrage">
        <div
          className="recadrage__ovale"
          style={(() => {
            if (!url || !dims) return undefined;
            // Même calcul que recadrerCarre : carré de côté min(l, h) / zoom centré sur (cx, cy)
            const S = 220;
            const base = Math.min(dims.w, dims.h) / zoom;
            const sx = Math.min(dims.w - base, Math.max(0, cx * dims.w - base / 2));
            const sy = Math.min(dims.h - base, Math.max(0, cy * dims.h - base / 2));
            const k = S / base;
            return {
              backgroundImage: `url(${url})`,
              backgroundSize: `${dims.w * k}px ${dims.h * k}px`,
              backgroundPosition: `${-sx * k}px ${-sy * k}px`,
            };
          })()}
          role="img"
          aria-label="Aperçu du cadrage"
        />
        <Curseur libelle="Zoom" valeur={zoom} min={1} max={4} pas={0.05} onChange={setZoom} />
        <Curseur libelle="Gauche / droite" valeur={cx} min={0} max={1} pas={0.01} onChange={setCx} />
        <Curseur libelle="Haut / bas" valeur={cy} min={0} max={1} pas={0.01} onChange={setCy} />
      </div>
    </Feuille>
  );
}
