import { useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, LoaderCircle, Mail, Shirt } from "lucide-react";
import { URL_APP } from "../lib/plateforme";
import { messageErreur, supabase as client } from "../lib/supabase";

// Cet écran n'existe qu'en mode synchronisé : le client Supabase est alors configuré.
const supabase = client!;

type Mode = "connexion" | "inscription" | "oubli";

/** Mise en page commune aux écrans de connexion : marque, titre, accroche, formulaire posé à plat (comme le portail). */
function CadreConnexion({ titre, accroche, children }: { titre: string; accroche: string; children: ReactNode }) {
  return (
    <main className="connexion" data-tauri-drag-region>
      <div className="connexion__colonne">
        {/* Marque commune de la suite Atelier (atelier-brand.css) */}
        <span className="atelier-brand">
          <span className="atelier-brand__tile" aria-hidden="true">
            <Shirt />
          </span>
          <span className="atelier-brand__name">
            <span className="atelier-brand__prefix">Atelier </span>Dressing
          </span>
        </span>
        <h1 className="connexion__titre">{titre}</h1>
        <p className="connexion__accroche">{accroche}</p>
        {children}
      </div>
    </main>
  );
}

function MessageErreur({ texte }: { texte: string }) {
  return (
    <p className="connexion__erreur" role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{texte}</span>
    </p>
  );
}

function BoutonEnvoi({ enCours, libelle, libelleEnCours }: { enCours: boolean; libelle: string; libelleEnCours: string }) {
  return (
    <button className="bouton bouton--action bouton--plein connexion__bouton" disabled={enCours}>
      {enCours && <LoaderCircle className="connexion__chargement" aria-hidden="true" />}
      {enCours ? libelleEnCours : libelle}
    </button>
  );
}

export function Connexion({ onSansCompte }: { onSansCompte: () => void }) {
  const [mode, setMode] = useState<Mode>("connexion");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState<{ titre: string; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Réinitialisation par code : le lien de l'e-mail s'ouvre dans Safari, pas dans l'app
  // installée (stockage séparé sur iOS), alors on tape le code reçu directement ici.
  const [attenteCode, setAttenteCode] = useState(false);
  const [code, setCode] = useState("");

  function changerMode(m: Mode) {
    setMode(m);
    setErreur(null);
    setEnvoye(null);
    setAttenteCode(false);
    setCode("");
  }

  async function validerCode(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    // En cas de succès, Supabase émet PASSWORD_RECOVERY : App affiche alors « Un nouveau mot de passe ».
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" });
    setEnCours(false);
    if (error) setErreur(messageErreur(error));
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      if (mode === "connexion") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
        if (error) throw error;
      } else if (mode === "inscription") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: mdp,
          options: URL_APP ? { emailRedirectTo: URL_APP } : undefined,
        });
        if (error) throw error;
        if (!data.session) {
          setEnvoye({
            titre: "Confirme ton adresse",
            texte: `C'est presque fini ! Ouvre le lien reçu à ${email}, puis reviens te connecter avec ton mot de passe.`,
          });
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: URL_APP || undefined,
        });
        if (error) throw error;
        setAttenteCode(true);
      }
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  const bascule = (libelle: ReactNode, cible: Mode) => (
    <button type="button" className="connexion__bascule" onClick={() => changerMode(cible)}>
      {libelle}
    </button>
  );

  const accroche = "Ton dressing en photos, ton mannequin et tes tenues, synchronisés entre ton Mac et ton iPhone.";

  if (attenteCode) {
    return (
      <CadreConnexion titre="Regarde ta boîte mail" accroche={accroche}>
        <form className="connexion__form" onSubmit={validerCode}>
          <div className="connexion__envoye" role="status">
            <Mail aria-hidden="true" />
            <p className="connexion__envoye-titre">C'est envoyé !</p>
            <p>Recopie ici le code reçu à {email}, puis choisis ton nouveau mot de passe.</p>
          </div>
          <label className="champ-groupe">
            <span>Code reçu par e-mail</span>
            <input
              className="champ connexion__code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              placeholder="123456"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          {erreur && <MessageErreur texte={erreur} />}
          <BoutonEnvoi enCours={enCours} libelle="Valider le code" libelleEnCours="Vérification…" />
          {bascule("Revenir à la connexion", "connexion")}
        </form>
      </CadreConnexion>
    );
  }

  if (envoye) {
    return (
      <CadreConnexion titre="Ton dressing, sur toi" accroche={accroche}>
        <div className="connexion__envoye" role="status">
          <Mail aria-hidden="true" />
          <p className="connexion__envoye-titre">{envoye.titre}</p>
          <p>{envoye.texte}</p>
        </div>
        <button type="button" className="connexion__bascule" onClick={() => changerMode("connexion")}>
          Revenir à la connexion
        </button>
      </CadreConnexion>
    );
  }

  return (
    <CadreConnexion
      titre={mode === "inscription" ? "Ton dressing, ton compte" : "Ton dressing, sur toi"}
      accroche={accroche}
    >
      <form className="connexion__form" onSubmit={envoyer}>
        <label className="champ-groupe">
          <span>Ton adresse e-mail</span>
          <input
            className="champ"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="toi@exemple.fr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== "oubli" && (
          <label className="champ-groupe">
            <span>{mode === "inscription" ? "Choisis ton mot de passe" : "Ton mot de passe"}</span>
            <input
              className="champ"
              type="password"
              autoComplete={mode === "inscription" ? "new-password" : "current-password"}
              minLength={6}
              required
              value={mdp}
              onChange={(e) => setMdp(e.target.value)}
            />
            {mode === "inscription" && <small className="connexion__aide">6 caractères minimum.</small>}
          </label>
        )}
        {erreur && <MessageErreur texte={erreur} />}

        {mode === "connexion" && (
          <>
            <BoutonEnvoi enCours={enCours} libelle="Se connecter" libelleEnCours="Connexion…" />
            {bascule(
              <>
                Mot de passe oublié ? Recevoir un code <span className="sans-coupure">par e-mail</span>
              </>,
              "oubli",
            )}
            {bascule("Pas encore de compte ? Créer ton mot de passe", "inscription")}
            <button type="button" className="connexion__bascule" onClick={onSansCompte}>
              Continuer sans compte, sur cet appareil
            </button>
          </>
        )}
        {mode === "inscription" && (
          <>
            <BoutonEnvoi enCours={enCours} libelle="Créer mon compte" libelleEnCours="Création du compte…" />
            {bascule("J'ai déjà un compte : me connecter", "connexion")}
          </>
        )}
        {mode === "oubli" && (
          <>
            <BoutonEnvoi enCours={enCours} libelle="Recevoir un code par e-mail" libelleEnCours="Envoi du code…" />
            {bascule("Me connecter avec mon mot de passe", "connexion")}
          </>
        )}
      </form>
    </CadreConnexion>
  );
}

/** Choix d'un nouveau mot de passe après un code (ou un lien) de réinitialisation. */
export function NouveauMotDePasse({ onFini }: { onFini: () => void }) {
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const { error } = await supabase.auth.updateUser({ password: mdp });
    setEnCours(false);
    if (error) setErreur(messageErreur(error));
    else onFini();
  }

  return (
    <CadreConnexion
      titre="Un nouveau mot de passe"
      accroche="Choisis-le maintenant : il servira sur ton Mac comme sur ton iPhone."
    >
      <form className="connexion__form" onSubmit={valider}>
        <label className="champ-groupe">
          <span>Ton nouveau mot de passe</span>
          <input
            className="champ"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
          />
          <small className="connexion__aide">6 caractères minimum.</small>
        </label>
        {erreur && <MessageErreur texte={erreur} />}
        <BoutonEnvoi enCours={enCours} libelle="Enregistrer le mot de passe" libelleEnCours="Enregistrement…" />
      </form>
    </CadreConnexion>
  );
}
