import type { ReactNode } from "react";
import { Heart } from "lucide-react";
import { useImage } from "../lib/donnees";
import type { Couleur, Vetement } from "../lib/types";

/** Photo stockée (détourée) sur un damier discret. */
export function Photo({ cle, alt, damier, className }: { cle: string | null; alt: string; damier?: boolean; className?: string }) {
  const url = useImage(cle);
  return (
    <div className={"photo" + (damier ? " photo--damier" : "") + (className ? " " + className : "")}>
      {url ? <img src={url} alt={alt} draggable={false} /> : <span className="photo__vide" aria-hidden />}
    </div>
  );
}

export function Pastilles({ couleurs, max = 3 }: { couleurs: Couleur[]; max?: number }) {
  if (!couleurs.length) return null;
  return (
    <span className="pastilles-couleur" aria-label={"Couleurs : " + couleurs.map((c) => c.nom).join(", ")}>
      {couleurs.slice(0, max).map((c, i) => (
        <span key={i} className="pastille-couleur" style={{ background: c.hex }} title={c.nom} />
      ))}
    </span>
  );
}

/** Carte d'une pièce dans la grille du dressing. */
export function Vignette({
  v,
  onClick,
  active,
  sous,
  compacte,
}: {
  v: Vetement;
  onClick: () => void;
  active?: boolean;
  sous?: ReactNode;
  compacte?: boolean;
}) {
  return (
    <button
      type="button"
      className={"vignette" + (compacte ? " vignette--compacte" : "") + (v.archive ? " vignette--archive" : "")}
      aria-pressed={active}
      onClick={onClick}
    >
      <Photo cle={v.image ?? v.image_originale} alt="" />
      {v.favori && !compacte && <Heart className="vignette__favori" size={16} aria-label="Favori" fill="currentColor" />}
      {!compacte && (
        <span className="vignette__texte">
          <span className="vignette__nom">{v.nom || v.sous_type || "Sans nom"}</span>
          <span className="vignette__sous">
            <Pastilles couleurs={v.couleurs} />
            {sous}
          </span>
        </span>
      )}
      {compacte && <span className="visuellement-cache">{v.nom || v.sous_type}</span>}
    </button>
  );
}

/** Puces à choix multiple (saisons, occasions…). */
export function ChoixMultiple<T extends string>({
  valeurs,
  options,
  libelles,
  onChange,
  etiquette,
}: {
  valeurs: T[];
  options: readonly T[];
  libelles: Record<T, string>;
  onChange: (v: T[]) => void;
  etiquette: string;
}) {
  return (
    <div className="puces" role="group" aria-label={etiquette}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="puce"
          aria-pressed={valeurs.includes(o)}
          onClick={() => onChange(valeurs.includes(o) ? valeurs.filter((x) => x !== o) : [...valeurs, o])}
        >
          {libelles[o]}
        </button>
      ))}
    </div>
  );
}

/** Choix unique en segments. */
export function Segments<T extends string | number>({
  valeur,
  options,
  onChange,
  etiquette,
}: {
  valeur: T;
  options: { v: T; l: ReactNode }[];
  onChange: (v: T) => void;
  etiquette: string;
}) {
  return (
    <div className="segments" role="radiogroup" aria-label={etiquette}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={valeur === o.v}
          aria-selected={valeur === o.v}
          className="segment"
          onClick={() => onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Curseur({
  libelle,
  valeur,
  min,
  max,
  pas,
  onChange,
  gauche,
  droite,
  affichage,
}: {
  libelle: string;
  valeur: number;
  min: number;
  max: number;
  pas: number;
  onChange: (v: number) => void;
  gauche?: string;
  droite?: string;
  affichage?: string;
}) {
  return (
    <label className="curseur">
      <span className="curseur__tete">
        <span>{libelle}</span>
        {affichage && <output>{affichage}</output>}
      </span>
      <input type="range" min={min} max={max} step={pas} value={valeur} onChange={(e) => onChange(Number(e.target.value))} />
      {(gauche || droite) && (
        <span className="curseur__bornes" aria-hidden>
          <span>{gauche}</span>
          <span>{droite}</span>
        </span>
      )}
    </label>
  );
}

export function Vide({ icone, titre, texte, action }: { icone: ReactNode; titre: string; texte: string; action?: ReactNode }) {
  return (
    <div className="vide">
      <span className="vide__icone" aria-hidden>
        {icone}
      </span>
      <p className="vide__titre">{titre}</p>
      <p>{texte}</p>
      {action}
    </div>
  );
}
