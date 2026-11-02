import { useEffect, useRef, useState } from "react";
import { Cloud, Cpu, Download, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { useDonnees, useReglages } from "../lib/donnees";
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
  const toast = useToast();
  const donnees = useDonnees();
  const [ollama, setOllama] = useState<boolean | null>(null);
  const [travail, setTravail] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  // Ollama répond-il ? Vérifié à l'ouverture et quand l'adresse change.
  useEffect(() => {
    if (!ouverte || r.modeIA === "cloud") return;
    let annule = false;
    setOllama(null);
    ollamaDisponible(r.ollamaUrl).then((ok) => !annule && setOllama(ok));
    return () => {
      annule = true;
    };
  }, [ouverte, r.modeIA, r.ollamaUrl]);

  const iPhoneNonInstalle = estIOS && !estInstallee && !estTauri;
  const local = donnees.depot.mode === "local";

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
          <div className="segments" role="radiogroup" aria-label="Moteur IA">
            {(
              [
                ["auto", "Auto", Sparkles],
                ["local", "Local", Cpu],
                ["cloud", "Cloud", Cloud],
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
            {r.modeIA === "local"
              ? "Ollama sur ce Mac : hors ligne, gratuit, tes photos ne quittent pas l'ordinateur."
              : r.modeIA === "cloud"
                ? "Claude, via la fonction sécurisée de l'app : plus précis, fonctionne partout, iPhone compris (compte synchronisé requis)."
                : "Ollama s'il répond en moins de 3 secondes, sinon Claude."}{" "}
            L'IA reconnaît les pièces scannées, compose des tenues et estime ta silhouette. Le détourage, lui, se fait toujours sur l'appareil.
          </p>
          {r.modeIA !== "cloud" && (
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
          {r.modeIA !== "local" && !cloudConfigure && (
            <p className="note">Le mode Cloud n'est pas encore branché : il faut le projet Supabase de l'app (voir le README).</p>
          )}
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
                ["dark", "Néon"],
                ["light", "Clair"],
                ["auto", "Selon le système"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={r.theme === v} className="segment" aria-selected={r.theme === v} onClick={() => maj({ theme: v })}>
                {l}
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
