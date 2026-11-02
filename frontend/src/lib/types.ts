// Modèle de données d'atelier_Dressing, commun aux deux dépôts (local et Supabase).
// Les noms de colonnes sont ceux des tables Supabase (backend/supabase/migrations).

export type Categorie =
  | "haut"
  | "bas"
  | "robe"
  | "veste"
  | "chaussures"
  | "sac"
  | "chapeau"
  | "lunettes"
  | "echarpe"
  | "bijoux"
  | "ceinture"
  | "autre";

export type Saison = "printemps" | "ete" | "automne" | "hiver";

export type Occasion = "quotidien" | "travail" | "soiree" | "sport" | "ceremonie" | "detente";

/** Jusqu'où descend la pièce sur le mannequin. */
export type Longueur = "courte" | "hanches" | "cuisses" | "genoux" | "mollets" | "chevilles";

export interface Couleur {
  nom: string;
  hex: string;
}

/** Réglage fin de la position d'une pièce sur le mannequin (en part de la zone). */
export interface Calage {
  echelle: number; // 1 = taille automatique
  dx: number; // décalage horizontal, en part de la largeur de zone (-0.5 … 0.5)
  dy: number; // décalage vertical, en part de la hauteur de zone
}

export const CALAGE_NEUTRE: Calage = { echelle: 1, dx: 0, dy: 0 };

/** Un segment horizontal sur la photo de la pièce (fractions de la photo, 0 à 1). */
export interface Segment01 {
  y: number;
  gauche: number;
  droite: number;
}

/**
 * Repères posés par l'IA sur la photo de la pièce, pour l'ajuster sur le corps :
 * coutures d'épaules (hauts, vestes, robes), ceinture et ourlet (bas).
 */
export interface Ajustement {
  epaules?: Segment01;
  ceinture?: Segment01;
  ourlet?: number;
}

export interface Vetement {
  id: string;
  nom: string;
  categorie: Categorie;
  sous_type: string;
  couleurs: Couleur[];
  matiere: string;
  motif: string;
  saisons: Saison[];
  occasions: Occasion[];
  style: string;
  longueur: Longueur | null;
  chaleur: number; // 1 (très léger) … 5 (très chaud)
  marque: string;
  taille: string;
  prix: number | null;
  achete_le: string | null;
  notes: string;
  favori: boolean;
  archive: boolean;
  image: string | null; // clé de la photo détourée (PNG transparent)
  image_originale: string | null; // clé de la photo d'origine
  calage: Calage;
  ajustement: Ajustement | null;
  cree_le: string;
  maj_le: string;
}

export interface Tenue {
  id: string;
  nom: string;
  pieces: string[]; // identifiants de vêtements
  occasion: Occasion | null;
  saisons: Saison[];
  note: string;
  favori: boolean;
  cree_le: string;
  maj_le: string;
}

/** Journal : ce qui a été porté, un jour donné. */
export interface Port {
  id: string;
  porte_le: string; // AAAA-MM-JJ
  tenue_id: string | null;
  pieces: string[];
  note: string;
  cree_le: string;
}

export type Morphologie = "feminine" | "masculine" | "neutre";
export type LongueurCheveux = "rase" | "court" | "mi_long" | "long";

/** Le mannequin qui te ressemble. */
export interface Avatar {
  morphologie: Morphologie;
  taille_cm: number;
  epaules: number; // 0.8 … 1.25 (1 = moyenne de la morphologie)
  poitrine: number;
  tour_taille: number;
  hanches: number;
  jambes: number; // 0.9 … 1.1 (longueur relative des jambes)
  carnation: string; // hex
  cheveux_couleur: string; // hex
  cheveux_longueur: LongueurCheveux;
  visage: string | null; // clé de la photo du visage (recadrée)
  photo_pied: string | null; // clé de ta photo en pied (essayage réaliste)
}

export interface Profil {
  prenom: string;
  avatar: Avatar;
  maj_le: string;
}

export const AVATAR_DEFAUT: Avatar = {
  morphologie: "neutre",
  taille_cm: 172,
  epaules: 1,
  poitrine: 1,
  tour_taille: 1,
  hanches: 1,
  jambes: 1,
  carnation: "#d9a982",
  cheveux_couleur: "#3b2a20",
  cheveux_longueur: "court",
  visage: null,
  photo_pied: null,
};

/** Photo générée de toi portant des pièces du dressing. */
export interface Essayage {
  id: string;
  pieces: string[];
  image: string; // clé de la photo générée
  moteur: string;
  cree_le: string;
}

export interface Garderobe {
  vetements: Vetement[];
  tenues: Tenue[];
  ports: Port[];
  essayages: Essayage[];
  profil: Profil;
}

export const nouvelId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

export const maintenant = (): string => new Date().toISOString();

export function nouveauVetement(partiel: Partial<Vetement> = {}): Vetement {
  const t = maintenant();
  return {
    id: nouvelId(),
    nom: "",
    categorie: "haut",
    sous_type: "",
    couleurs: [],
    matiere: "",
    motif: "uni",
    saisons: [],
    occasions: [],
    style: "",
    longueur: null,
    chaleur: 2,
    marque: "",
    taille: "",
    prix: null,
    achete_le: null,
    notes: "",
    favori: false,
    archive: false,
    image: null,
    image_originale: null,
    calage: { ...CALAGE_NEUTRE },
    ajustement: null,
    cree_le: t,
    maj_le: t,
    ...partiel,
  };
}
