import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Layers, PersonStanding, ScanLine, Settings, Shirt, UserRound } from "lucide-react";
import { FournisseurToast } from "./components/Toast";
import type { Depot } from "./lib/depot";
import { DepotCloud } from "./lib/depot-cloud";
import { DepotLocal } from "./lib/depot-local";
import { FournisseurDonnees, useDonnees } from "./lib/donnees";
import { estTauri } from "./lib/plateforme";
import { cloudConfigure, supabase } from "./lib/supabase";
import { Cabine } from "./screens/Cabine";
import { Connexion, NouveauMotDePasse } from "./screens/Connexion";
import { Dressing } from "./screens/Dressing";
import { Moi } from "./screens/Moi";
import { Reglages } from "./screens/Reglages";
import { Scanner } from "./screens/Scanner";
import { Tenues } from "./screens/Tenues";

type Onglet = "cabine" | "dressing" | "scanner" | "tenues" | "moi";
const ONGLETS: Onglet[] = ["cabine", "dressing", "scanner", "tenues", "moi"];
const CLE_MODE = "dressing.mode";

const lireModeLocal = () => {
  try {
    return localStorage.getItem(CLE_MODE) === "local";
  } catch {
    return false;
  }
};

export default function App() {
  // Sans projet Supabase configuré, l'app vit sur l'appareil ; sinon on peut choisir.
  const [local, setLocal] = useState(() => !cloudConfigure || lireModeLocal());
  const [session, setSession] = useState<Session | null | undefined>(cloudConfigure ? undefined : null);
  const [recuperation, setRecuperation] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((evenement, s) => {
      if (evenement === "PASSWORD_RECOVERY") setRecuperation(true);
      setSession(s);
      if (s) {
        try {
          localStorage.removeItem(CLE_MODE);
        } catch {
          /* rien */
        }
        setLocal(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (estTauri) document.documentElement.classList.add("est-tauri");
  }, []);

  const userId = session?.user.id ?? null;
  const depot = useMemo<Depot | null>(() => {
    if (session && supabase && userId) return new DepotCloud(supabase, userId);
    if (local) return new DepotLocal();
    return null;
  }, [local, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const choisirLocal = (oui: boolean) => {
    try {
      if (oui) localStorage.setItem(CLE_MODE, "local");
      else localStorage.removeItem(CLE_MODE);
    } catch {
      /* rien */
    }
    setLocal(oui);
  };

  if (session === undefined && !local) return <div className="demarrage" aria-busy="true" />;

  return (
    <FournisseurToast>
      {recuperation && session ? (
        <NouveauMotDePasse onFini={() => setRecuperation(false)} />
      ) : depot ? (
        <FournisseurDonnees depot={depot} key={depot.mode + (userId ?? "")}>
          <Coque email={session?.user.email ?? null} versConnexion={() => choisirLocal(false)} />
        </FournisseurDonnees>
      ) : (
        <Connexion onSansCompte={() => choisirLocal(true)} />
      )}
    </FournisseurToast>
  );
}

function lireHash(): Onglet {
  const h = window.location.hash.replace("#", "");
  return ONGLETS.find((o) => o === h) ?? "cabine";
}

function Coque({ email, versConnexion }: { email: string | null; versConnexion: () => void }) {
  const { erreur, chargement, vetements } = useDonnees();
  const [onglet, setOnglet] = useState<Onglet>(lireHash);
  const [reglages, setReglages] = useState(false);

  useEffect(() => {
    const surHash = () => setOnglet(lireHash());
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, []);

  const aller = (o: Onglet) => {
    if (window.location.hash !== "#" + o) window.history.replaceState(null, "", "#" + o);
    setOnglet(o);
    document.getElementById("contenu")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  const actifs = vetements.filter((v) => !v.archive).length;
  const onglets: { id: Onglet; label: string; icone: typeof Shirt; compte?: number }[] = [
    { id: "cabine", label: "Cabine", icone: PersonStanding },
    { id: "dressing", label: "Dressing", icone: Shirt, compte: actifs || undefined },
    { id: "scanner", label: "Scanner", icone: ScanLine },
    { id: "tenues", label: "Tenues", icone: Layers },
    { id: "moi", label: "Moi", icone: UserRound },
  ];

  return (
    <div className="coque">
      <nav className="navigation" aria-label="Sections">
        <div className="navigation__marque" data-tauri-drag-region>
          {/* Marque commune de la suite Atelier (atelier-brand.css) */}
          <span className="atelier-brand">
            <span className="atelier-brand__tile" aria-hidden="true">
              <Shirt />
            </span>
            <span className="atelier-brand__name">
              <span className="atelier-brand__prefix">atelier_</span>Dressing
            </span>
          </span>
        </div>
        <ul className="navigation__liste">
          {onglets.map((o) => (
            <li key={o.id}>
              <button
                className={"onglet" + (o.id === "scanner" ? " onglet--scanner" : "")}
                aria-current={onglet === o.id ? "page" : undefined}
                onClick={() => aller(o.id)}
              >
                <o.icone size={22} aria-hidden strokeWidth={onglet === o.id ? 2.4 : 1.8} />
                <span className="onglet__label">{o.label}</span>
                {!!o.compte && (
                  <span className="onglet__compte onglet__compte--neutre">
                    {o.compte}
                    <span className="visuellement-cache"> pièces</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <button className="onglet navigation__reglages" onClick={() => setReglages(true)}>
          <Settings size={22} aria-hidden strokeWidth={1.8} />
          <span className="onglet__label">Réglages</span>
        </button>
      </nav>

      <button className="bouton-icone reglages-mobile" onClick={() => setReglages(true)} aria-label="Réglages">
        <Settings size={22} />
      </button>

      <main id="contenu" className="contenu">
        <div className="barre-glisser" data-tauri-drag-region aria-hidden />
        {erreur && (
          <p className="message message--erreur bandeau">
            Synchronisation impossible pour le moment. Les modifications reprendront dès le retour du réseau.
          </p>
        )}
        {chargement ? (
          <div className="demarrage demarrage--contenu" aria-busy="true" />
        ) : (
          <>
            {onglet === "cabine" && <Cabine versScanner={() => aller("scanner")} />}
            {onglet === "dressing" && <Dressing versScanner={() => aller("scanner")} versCabine={() => aller("cabine")} />}
            {onglet === "scanner" && <Scanner versDressing={() => aller("dressing")} />}
            {onglet === "tenues" && <Tenues versCabine={() => aller("cabine")} />}
            {onglet === "moi" && <Moi />}
          </>
        )}
      </main>

      <Reglages
        ouverte={reglages}
        onFermer={() => setReglages(false)}
        email={email}
        versConnexion={() => {
          setReglages(false);
          versConnexion();
        }}
      />
    </div>
  );
}
