import { useEffect, useState } from "react";
import { Link2, LoaderCircle, Search } from "lucide-react";
import { Feuille } from "./Feuille";
import { chercherPhotos, LienImpossible, telechargerPhoto } from "../lib/lien";

type Role = "face" | "dos";

/**
 * Colle le lien de la page du produit : ses photos s'affichent, tu touches la photo de face
 * puis celle de dos. Pour la 3D, le dos compte autant que la face.
 */
export function ImportLien({
  ouverte,
  roles = ["face", "dos"],
  onFermer,
  onImporter,
}: {
  ouverte: boolean;
  roles?: Role[];
  onFermer: () => void;
  onImporter: (r: { face?: Blob; dos?: Blob; titre: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [res, setRes] = useState<{ titre: string; images: string[] } | null>(null);
  const [choix, setChoix] = useState<Partial<Record<Role, string>>>({});

  useEffect(() => {
    if (ouverte) {
      setErreur(null);
      setChoix({});
    }
  }, [ouverte]);

  async function chercher() {
    setEnCours(true);
    setErreur(null);
    setRes(null);
    setChoix({});
    try {
      setRes(await chercherPhotos(url));
    } catch (e) {
      setErreur(e instanceof LienImpossible ? e.message : "La page n'a pas pu être lue.");
    } finally {
      setEnCours(false);
    }
  }

  function toucher(img: string) {
    setChoix((c) => {
      const deja = (Object.keys(c) as Role[]).find((r) => c[r] === img);
      if (deja) {
        const n = { ...c };
        delete n[deja];
        return n;
      }
      const libre = roles.find((r) => !c[r]);
      return libre ? { ...c, [libre]: img } : { ...c, [roles[roles.length - 1]]: img };
    });
  }

  async function importer() {
    setEnCours(true);
    setErreur(null);
    try {
      const [face, dos] = await Promise.all([choix.face ? telechargerPhoto(choix.face) : undefined, choix.dos ? telechargerPhoto(choix.dos) : undefined]);
      onImporter({ face, dos, titre: res?.titre ?? "" });
    } catch (e) {
      setErreur(e instanceof LienImpossible ? e.message : "Les photos n'ont pas pu être récupérées.");
    } finally {
      setEnCours(false);
    }
  }

  const prochain = roles.find((r) => !choix[r]);
  return (
    <Feuille
      ouverte={ouverte}
      titre="Depuis un lien de boutique"
      large
      onFermer={onFermer}
      pied={
        res && (
          <button className="bouton bouton--action" onClick={importer} disabled={enCours || !Object.keys(choix).length}>
            {enCours ? <LoaderCircle className="tourne" size={18} aria-hidden /> : <Link2 size={18} aria-hidden />} Importer{" "}
            {[choix.face && "la face", choix.dos && "le dos"].filter(Boolean).join(" et ")}
          </button>
        )
      }
    >
      <div className="import-lien">
        <form
          className="import-lien__form"
          onSubmit={(e) => {
            e.preventDefault();
            chercher();
          }}
        >
          <input
            className="champ"
            type="url"
            inputMode="url"
            placeholder="https://www.boutique.fr/produit…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Adresse de la page du produit"
            required
          />
          <button className="bouton bouton--discret" disabled={enCours || !url.trim()}>
            {enCours && !res ? <LoaderCircle className="tourne" size={16} aria-hidden /> : <Search size={16} aria-hidden />} Chercher
          </button>
        </form>
        {erreur && (
          <p className="message message--alerte" role="alert">
            {erreur}
          </p>
        )}
        {res && (
          <>
            <p className="note">
              {res.titre && <strong>{res.titre}. </strong>}
              {prochain ? `Touche la photo ${prochain === "face" ? "de face" : "de dos"}.` : "C'est prêt : importe, ou touche une photo pour la changer."}
            </p>
            <div className="import-lien__grille">
              {res.images.map((img) => {
                const role = (Object.keys(choix) as Role[]).find((r) => choix[r] === img);
                return (
                  <button key={img} type="button" className="import-lien__photo" aria-pressed={!!role} onClick={() => toucher(img)}>
                    <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    {role && <span className="import-lien__role">{role === "face" ? "Face" : "Dos"}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Feuille>
  );
}
