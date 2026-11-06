import { useEffect, useRef, useState } from "react";
import { Cloud, Cpu, Download, LoaderCircle, Monitor, Moon, ShieldCheck, Sparkles, Sun, Upload } from "lucide-react";
import { MODELES_CLAUDE, statutClaude } from "../lib/claude";
import { etatRelais } from "../lib/relais";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { useDonnees, useReglages, useTheme } from "../lib/donnees";
import { jetonValide, PAGE_JETONS } from "../lib/hf";
import { ollamaDisponible, type ModeIA } from "../lib/ia";
import { estInstallee, estIOS, estTauri } from "../lib/plateforme";
import { exporter, importer } from "../lib/sauvegarde";
import { cloudConfigure, messageErreur, supabase } from "../lib/supabase";

export function Reglages({
  ouverte,
  onFermer,
  email,
  versConnexion,
}: {
  ouverte: boolean;
  onFermer: () => void;
  email: string | null;
  versConnexion: () => void;
}) {
  const [r, maj] = useReglages();
  const [theme, choisirTheme] = useTheme();
  const toast = useToast();
  const donnees = useDonnees();
  const iPhoneNonInstalle = estIOS && !estInstallee && !estTauri;
  const local = donnees.depot.mode === "local";
  const [ollama, setOllama] = useState<boolean | null>(null);
  const [travail, setTravail] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const [claude, setClaude] = useState<{ ok: boolean; texte: string } | null>(null);

  // Claude est-il prêt ? CLI du Mac sur l'app Mac, Mac relais ailleurs.
  useEffect(() => {
    if (!ouverte) return;
    let annule = false;
    setClaude(null);
    (async () => {
      if (estTauri) {
        const s = await statutClaude(true);
        return { ok: s.disponible, texte: s.disponible ? `Claude Code prêt${s.version ? ` (${s.version})` : ""}` : s.message };
      }
      if (!supabase || local) return { ok: false, texte: "Claude depuis l'iPhone passe par ton Mac : connecte-toi à ton compte." };
      const e = await etatRelais(supabase, true);
      if (!e.present) return { ok: false, texte: "Ouvre Atelier Dressing sur ton Mac (même compte) pour utiliser ton forfait Claude ici." };
      return e.claude
        ? { ok: true, texte: `Claude prêt via ${e.appareil ?? "ton Mac"}` }
        : { ok: false, texte: `Claude Code n'est pas connecté sur ${e.appareil ?? "ton Mac"} : « claude auth login » dans son Terminal.` };
    })().then((c) => !annule && setClaude(c));
    return () => {
      annule = true;
    };
  }, [ouverte]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ollama répond-il ? Vérifié à l'ouverture et quand l'adresse change.
  useEffect(() => {
    if (!ouverte || r.modeIA === "claude") return;
    let annule = false;
    setOllama(null);
    ollamaDisponible(r.ollamaUrl).then((ok) => !annule && setOllama(ok));
    return () => {
      annule = true;
    };
  }, [ouverte, r.modeIA, r.ollamaUrl]);


  async function sauvegarder() {
    setTravail("Préparation de la sauvegarde…");
    try {
      const blob = await exporter(donnees.depot, donnees, (f, t) => setTravail(`Photos : ${f} / ${t}`));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `atelier-dressing-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast("Sauvegarde téléchargée");
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    } finally {
      setTravail(null);
    }
  }

  async function restaurer(f: File) {
    setTravail("Import…");
    try {
      const n = await importer(donnees.depot, f, (x, t) => setTravail(`Import : ${x} / ${t}`));
      await donnees.recharger();
      toast(`${n} pièce${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""}`);
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    } finally {
      setTravail(null);
    }
  }

  return (
    <Feuille ouverte={ouverte} titre="Réglages" onFermer={onFermer}>
      <div className="reglages">
        <section>
          <h3>Intelligence artificielle</h3>
          <div className="segments" role="radiogroup" aria-label="Moteur">
            {(
              [
                ["auto", "Auto", Sparkles],
                ["ollama", "Ollama", Cpu],
                ["claude", "Claude", Cloud],
              ] as const
            ).map(([v, l, Icone]) => (
              <button
                key={v}
                role="radio"
                aria-checked={r.modeIA === v}
                aria-selected={r.modeIA === v}
                className="segment"
                onClick={() => maj({ modeIA: v as ModeIA })}
              >
                <Icone size={16} aria-hidden /> {l}
              </button>
            ))}
          </div>
          <p className="note">
            {r.modeIA === "ollama"
              ? "Ollama sur ce Mac : hors ligne, gratuit, tes photos ne quittent pas l'ordinateur."
              : r.modeIA === "claude"
                ? "Claude avec ton abonnement, par la CLI Claude Code de ton Mac (pas de clé API). Sur l'iPhone, la demande passe par ton Mac ouvert."
                : "Claude s'il est disponible, sinon Ollama."}{" "}
            Le détourage se fait toujours sur l'appareil.
          </p>
          <p className={"etat-ia" + (claude?.ok ? " etat-ia--ok" : claude ? " etat-ia--ko" : "")} role="status">
            {claude == null ? "Recherche de Claude…" : claude.texte}
          </p>
          {r.modeIA !== "ollama" && (
            <>
              <div className="champ-groupe">
                <span>Modèle Claude</span>
                <div className="segments" role="radiogroup" aria-label="Modèle Claude">
                  {MODELES_CLAUDE.map((m) => (
                    <button
                      key={m.v}
                      role="radio"
                      aria-checked={r.modeleClaude === m.v}
                      aria-selected={r.modeleClaude === m.v}
                      className="segment"
                      onClick={() => maj({ modeleClaude: m.v })}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>
              <p className="note bouclier">
                <ShieldCheck size={14} aria-hidden /> Quand Claude répond, il reçoit : la photo de la pièce scannée ; pour les tenues, la liste de tes
                pièces (nom, couleurs, saisons, dernier port) et la météo ; pour ton mannequin, ta photo en pied. Rien d'autre.
              </p>
            </>
          )}
          {r.modeIA !== "claude" && (
            <>
              <p className={"etat-ia" + (ollama ? " etat-ia--ok" : ollama === false ? " etat-ia--ko" : "")} role="status">
                {ollama == null ? "Recherche d'Ollama…" : ollama ? "Ollama répond" : "Ollama ne répond pas"}
              </p>
              {ollama === false && (
                <p className="note">
                  Lance l'app Ollama (ou « ollama serve »), puis installe les modèles : « ollama pull {r.ollamaModeleVision} » pour les photos et « ollama pull{" "}
                  {r.ollamaModele} » pour les tenues.
                  {!estTauri && " Dans le navigateur, autorise aussi cette adresse avec la variable OLLAMA_ORIGINS."}
                </p>
              )}
              <div className="formulaire">
                <label className="champ-groupe">
                  <span>Adresse d'Ollama</span>
                  <input className="champ" value={r.ollamaUrl} onChange={(e) => maj({ ollamaUrl: e.target.value })} />
                </label>
                <div className="formulaire__ligne">
                  <label className="champ-groupe">
                    <span>Modèle photo</span>
                    <input className="champ" value={r.ollamaModeleVision} onChange={(e) => maj({ ollamaModeleVision: e.target.value })} />
                  </label>
                  <label className="champ-groupe">
                    <span>Modèle texte</span>
                    <input className="champ" value={r.ollamaModele} onChange={(e) => maj({ ollamaModele: e.target.value })} />
                  </label>
                </div>
              </div>
            </>
          )}
        </section>

        <section>
          <h3>Essayage réaliste et 3D</h3>
          <div className="segments" role="radiogroup" aria-label="Moteur d'essayage">
            {(
              [
                ["hf", "Hugging Face (gratuit)"],
                ["flux", "FLUX.2 (payant)"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                role="radio"
                aria-checked={r.moteurEssayage === v}
                aria-selected={r.moteurEssayage === v}
                className="segment"
                onClick={() => maj({ moteurEssayage: v })}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="note">
            {r.moteurEssayage === "flux"
              ? "FLUX.2 (Black Forest Labs) par le mode synchronisé : environ 3 centimes la photo, clé à poser dans Supabase."
              : "Leffa pose tes pièces une à une sur ta photo en pied. La 3D (TRELLIS.2) passe toujours par Hugging Face."}
          </p>
          <label className="champ-groupe">
            <span>Jeton Hugging Face</span>
            <input
              className="champ"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="hf_…"
              value={r.jetonHF}
              onChange={(e) => maj({ jetonHF: e.target.value.trim() })}
            />
          </label>
          <p className={"etat-ia" + (jetonValide(r.jetonHF) ? " etat-ia--ok" : r.jetonHF ? " etat-ia--ko" : "")} role="status">
            {jetonValide(r.jetonHF) ? "Jeton prêt" : r.jetonHF ? "Ce jeton ne ressemble pas à un jeton Hugging Face (hf_…)" : "Pas encore de jeton"}
          </p>
          <p className="note">
            Crée un compte gratuit sur Hugging Face, puis un jeton de type « Read » :{" "}
            <a href={PAGE_JETONS} target="_blank" rel="noreferrer">
              huggingface.co/settings/tokens
            </a>
            . Il reste sur cet appareil. Le compte gratuit donne quelques minutes de GPU par jour : environ une tenue essayée et mise en 3D par jour. Le
            compte PRO en donne huit fois plus.
          </p>
          <p className="note bouclier">
            <ShieldCheck size={14} aria-hidden /> Pour un essayage, ta photo en pied et les photos des pièces passent par les serveurs de Hugging Face le
            temps du calcul.
          </p>
        </section>

        <section>
          <h3>Météo</h3>
          <label className="reglage">
            <span>
              Météo du jour pour les tenues
              <span className="note">Utilise la position de l'appareil (Open-Meteo). Sinon, tu choisis la température en cabine.</span>
            </span>
            <input type="checkbox" className="interrupteur" checked={r.meteo} onChange={(e) => maj({ meteo: e.target.checked })} />
          </label>
        </section>

        <section>
          <h3>Apparence</h3>
          <div className="segments" role="radiogroup" aria-label="Thème">
            {(
              [
                ["system", "Système", Monitor],
                ["light", "Clair", Sun],
                ["dark", "Sombre", Moon],
              ] as const
            ).map(([v, l, Icone]) => (
              <button key={v} role="radio" aria-checked={theme === v} className="segment" aria-selected={theme === v} onClick={() => choisirTheme(v)}>
                <Icone size={14} aria-hidden /> {l}
              </button>
            ))}
          </div>
        </section>

        {iPhoneNonInstalle && (
          <section>
            <h3>Installer sur l'iPhone</h3>
            <ol className="etapes etapes--compactes">
              <li>Ouvre cette page dans Safari.</li>
              <li>Touche le bouton Partager, en bas de l'écran.</li>
              <li>Choisis « Sur l'écran d'accueil », puis « Ajouter ».</li>
            </ol>
          </section>
        )}

        <section>
          <h3>Données</h3>
          <div className="reglage">
            <span>
              Sauvegarder tout le dressing
              <span className="note">Un fichier avec tes pièces, tenues, journal, mannequin et toutes les photos.</span>
            </span>
            <button className="bouton bouton--discret" onClick={sauvegarder} disabled={!!travail}>
              <Download size={16} aria-hidden /> Exporter
            </button>
          </div>
          <div className="reglage">
            <span>
              Importer une sauvegarde
              <span className="note">
                {local && cloudConfigure
                  ? "Ajoute le contenu d'un fichier exporté. Pour passer en synchronisé : exporte ici, connecte-toi, puis importe."
                  : "Ajoute le contenu d'un fichier exporté (rien n'est supprimé)."}
              </span>
            </span>
            <input ref={fichier} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files?.[0] && restaurer(e.target.files[0]), (e.target.value = ""))} />
            <button className="bouton bouton--discret" onClick={() => fichier.current?.click()} disabled={!!travail}>
              <Upload size={16} aria-hidden /> Importer
            </button>
          </div>
          {travail && (
            <p className="note" role="status">
              <LoaderCircle className="tourne" size={14} aria-hidden /> {travail}
            </p>
          )}
        </section>

        <section>
          <h3>Compte</h3>
          {local ? (
            <div className="reglage">
              <span>
                Sur cet appareil
                <span className="note">Tes données et photos restent ici, sans compte.</span>
              </span>
              {cloudConfigure && (
                <button className="bouton bouton--discret" onClick={versConnexion}>
                  Se connecter
                </button>
              )}
            </div>
          ) : (
            <div className="reglage">
              <span>
                {email}
                <span className="note">Synchronisé entre ton Mac et ton iPhone.</span>
              </span>
              <button className="bouton bouton--discret" onClick={() => supabase?.auth.signOut()}>
                Se déconnecter
              </button>
            </div>
          )}
        </section>
      </div>
    </Feuille>
  );
}
