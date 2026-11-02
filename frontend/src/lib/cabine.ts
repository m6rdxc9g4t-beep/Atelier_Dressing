// Ce que porte le mannequin en ce moment, partagé entre les onglets (on peut
// passer du Dressing ou des Tenues à la Cabine sans perdre la tenue en cours).

import { useSyncExternalStore } from "react";
import { incompatibles } from "./categories";
import type { Categorie, Vetement } from "./types";

export interface PropositionAffichee {
  nom: string;
  pieces: string[];
  explication: string;
  source: string; // « Claude (cloud) », « Ollama (local) », « Sans IA »
}

interface EtatCabine {
  pieces: string[];
  propositions: PropositionAffichee[];
  propositionActive: number | null;
}

const CLE = "dressing.cabine";
let etat: EtatCabine = (() => {
  try {
    return { propositions: [], propositionActive: null, ...JSON.parse(sessionStorage.getItem(CLE) ?? "{}") };
  } catch {
    return { pieces: [], propositions: [], propositionActive: null };
  }
})();
if (!Array.isArray(etat.pieces)) etat.pieces = [];
const abonnes = new Set<() => void>();

function publier(nouvel: Partial<EtatCabine>) {
  etat = { ...etat, ...nouvel };
  try {
    sessionStorage.setItem(CLE, JSON.stringify(etat));
  } catch {
    /* rien */
  }
  abonnes.forEach((f) => f());
}

export function useCabine(): EtatCabine {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat,
  );
}

/** Habille le mannequin avec une liste de pièces (remplace tout). */
export function habiller(pieces: string[], propositionActive: number | null = null) {
  publier({ pieces: [...new Set(pieces)], propositionActive });
}

/** Met (ou retire) une pièce : remplace la pièce de même catégorie et les incompatibles. */
export function basculerPiece(v: Vetement, vetements: Vetement[]) {
  if (etat.pieces.includes(v.id)) {
    publier({ pieces: etat.pieces.filter((id) => id !== v.id), propositionActive: null });
    return;
  }
  const parId = new Map(vetements.map((x) => [x.id, x]));
  const exclues = new Set<Categorie>([...incompatibles(v.categorie), ...(v.categorie === "bijoux" ? [] : [v.categorie])]);
  const gardees = etat.pieces.filter((id) => {
    const p = parId.get(id);
    return p && !exclues.has(p.categorie);
  });
  publier({ pieces: [...gardees, v.id], propositionActive: null });
}

export function deshabiller() {
  publier({ pieces: [], propositionActive: null });
}

export function montrerPropositions(propositions: PropositionAffichee[]) {
  publier({ propositions, propositionActive: propositions.length ? 0 : null, pieces: propositions[0]?.pieces ?? etat.pieces });
}

export function choisirProposition(i: number) {
  const p = etat.propositions[i];
  if (p) publier({ pieces: p.pieces, propositionActive: i });
}

export function oublierPropositions() {
  publier({ propositions: [], propositionActive: null });
}
