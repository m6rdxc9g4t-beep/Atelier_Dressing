import { Heart, Plus, X } from "lucide-react";
import {
  CATEGORIES,
  CATEGORIES_AVEC_LONGUEUR,
  LIBELLE_CHALEUR,
  LIBELLE_LONGUEUR,
  LIBELLE_OCCASION,
  LIBELLE_PIECE,
  LIBELLE_SAISON,
  LONGUEURS,
  OCCASIONS,
  SAISONS,
  longueurParDefaut,
} from "../lib/categories";
import { nomCouleur, PALETTE } from "../lib/couleurs";
import type { Categorie, Longueur, Vetement } from "../lib/types";
import { ChoixMultiple, Segments } from "./Elements";

/** Fiche d'une pièce : tout ce que l'IA a reconnu, à vérifier et compléter. */
export function FicheVetement({ v, onChange }: { v: Vetement; onChange: (v: Vetement) => void }) {
  const maj = (p: Partial<Vetement>) => onChange({ ...v, ...p });
  const avecLongueur = CATEGORIES_AVEC_LONGUEUR.includes(v.categorie);

  return (
    <div className="formulaire fiche">
      <label className="champ-groupe">
        <span>Nom</span>
        <input
          className="champ"
          value={v.nom}
          placeholder="Chemise en lin blanche"
          onChange={(e) => maj({ nom: e.target.value })}
        />
      </label>

      <div className="champ-groupe">
        <span id="cat-label">Catégorie</span>
        <div className="puces puces--defile" role="radiogroup" aria-labelledby="cat-label">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              className="puce"
              aria-checked={v.categorie === c}
              aria-pressed={v.categorie === c}
              onClick={() =>
                maj({
                  categorie: c as Categorie,
                  longueur: CATEGORIES_AVEC_LONGUEUR.includes(c) ? (v.longueur ?? longueurParDefaut(c, v.sous_type)) : null,
                })
              }
            >
              {LIBELLE_PIECE[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="formulaire__ligne">
        <label className="champ-groupe">
          <span>Type</span>
          <input className="champ" value={v.sous_type} placeholder="chemise, jupe midi…" onChange={(e) => maj({ sous_type: e.target.value })} />
        </label>
        {avecLongueur && (
          <label className="champ-groupe">
            <span>Longueur</span>
            <select
              className="champ"
              value={v.longueur ?? ""}
              onChange={(e) => maj({ longueur: (e.target.value || null) as Longueur | null })}
            >
              <option value="">Automatique</option>
              {LONGUEURS.map((l) => (
                <option key={l} value={l}>
                  {LIBELLE_LONGUEUR[l]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="champ-groupe">
        <span>Couleurs</span>
        <div className="couleurs-edition">
          {v.couleurs.map((c, i) => (
            <span key={i} className="couleur-edition">
              <label className="couleur-edition__pastille" style={{ background: c.hex }}>
                <input
                  type="color"
                  value={c.hex}
                  aria-label={`Couleur ${i + 1} : ${c.nom}`}
                  onChange={(e) => {
                    const couleurs = [...v.couleurs];
                    couleurs[i] = { hex: e.target.value, nom: nomCouleur(e.target.value) };
                    maj({ couleurs });
                  }}
                />
              </label>
              <span className="couleur-edition__nom">{c.nom}</span>
              <button
                type="button"
                className="bouton-icone bouton-icone--mini"
                aria-label={`Retirer ${c.nom}`}
                onClick={() => maj({ couleurs: v.couleurs.filter((_, j) => j !== i) })}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {v.couleurs.length < 3 && (
            <details className="couleur-ajout">
              <summary className="bouton bouton--discret">
                <Plus size={16} aria-hidden /> Couleur
              </summary>
              <div className="couleur-ajout__palette">
                {PALETTE.map((c) => (
                  <button
                    key={c.nom}
                    type="button"
                    className="pastille-couleur pastille-couleur--grande"
                    style={{ background: c.hex }}
                    title={c.nom}
                    aria-label={c.nom}
                    onClick={(e) => {
                      maj({ couleurs: [...v.couleurs, c] });
                      (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                    }}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="formulaire__ligne">
        <label className="champ-groupe">
          <span>Matière</span>
          <input className="champ" value={v.matiere} placeholder="coton, laine…" onChange={(e) => maj({ matiere: e.target.value })} />
        </label>
        <label className="champ-groupe">
          <span>Motif</span>
          <input className="champ" value={v.motif} placeholder="uni, rayures…" onChange={(e) => maj({ motif: e.target.value })} />
        </label>
      </div>

      <div className="champ-groupe">
        <span>Chaleur : {LIBELLE_CHALEUR[v.chaleur]}</span>
        <Segments
          etiquette="Chaleur"
          valeur={v.chaleur}
          options={[1, 2, 3, 4, 5].map((n) => ({ v: n, l: "●".repeat(n) }))}
          onChange={(n) => maj({ chaleur: n })}
        />
      </div>

      <div className="champ-groupe">
        <span>Saisons</span>
        <ChoixMultiple etiquette="Saisons" valeurs={v.saisons} options={SAISONS} libelles={LIBELLE_SAISON} onChange={(saisons) => maj({ saisons })} />
      </div>
      <div className="champ-groupe">
        <span>Occasions</span>
        <ChoixMultiple
          etiquette="Occasions"
          valeurs={v.occasions}
          options={OCCASIONS}
          libelles={LIBELLE_OCCASION}
          onChange={(occasions) => maj({ occasions })}
        />
      </div>

      <div className="formulaire__ligne">
        <label className="champ-groupe">
          <span>Style</span>
          <input className="champ" value={v.style} placeholder="casual chic" onChange={(e) => maj({ style: e.target.value })} />
        </label>
        <label className="champ-groupe">
          <span>Marque</span>
          <input className="champ" value={v.marque} onChange={(e) => maj({ marque: e.target.value })} />
        </label>
      </div>

      <div className="formulaire__ligne formulaire__ligne--trois">
        <label className="champ-groupe">
          <span>Taille</span>
          <input className="champ" value={v.taille} placeholder="M, 38…" onChange={(e) => maj({ taille: e.target.value })} />
        </label>
        <label className="champ-groupe">
          <span>Prix (€)</span>
          <input
            className="champ"
            inputMode="decimal"
            value={v.prix ?? ""}
            onChange={(e) => {
              const n = parseFloat(e.target.value.replace(",", "."));
              maj({ prix: e.target.value.trim() === "" || !Number.isFinite(n) ? null : n });
            }}
          />
        </label>
        <label className="champ-groupe">
          <span>Acheté le</span>
          <input className="champ" type="date" value={v.achete_le ?? ""} onChange={(e) => maj({ achete_le: e.target.value || null })} />
        </label>
      </div>

      <label className="champ-groupe">
        <span>Notes</span>
        <textarea className="champ" rows={2} value={v.notes} placeholder="Lavage à 30°, à faire retoucher…" onChange={(e) => maj({ notes: e.target.value })} />
      </label>

      <button type="button" className="puce puce--favori" aria-pressed={v.favori} onClick={() => maj({ favori: !v.favori })}>
        <Heart size={16} aria-hidden fill={v.favori ? "currentColor" : "none"} /> {v.favori ? "Dans mes favoris" : "Ajouter aux favoris"}
      </button>
    </div>
  );
}
