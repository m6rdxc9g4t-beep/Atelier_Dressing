// atelier_Dressing — IA par Claude (mode « cloud »)
//
// Trois tâches, choisies par le champ « tache » :
//   vetement   : photo d'un vêtement → nom, catégorie, couleurs, matière, saisons…
//   tenues     : dressing résumé + contexte (météo, occasion) → jusqu'à 3 tenues
//   silhouette : photo en pied → proportions et couleurs du mannequin
//
// Les consignes et les schémas sont les mêmes que dans frontend/src/lib/ia.ts
// (utilisés avec Ollama en mode local) : modifier les deux côtés. L'app nettoie
// la réponse de la même façon, quel que soit le moteur.
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY  clé API Claude (obligatoire)
//   ANTHROPIC_MODEL    modèle à utiliser (facultatif, claude-sonnet-5-5 par défaut)
//
// L'appel exige un utilisateur connecté (JWT vérifié par Supabase).

const CATEGORIES = ["haut", "bas", "robe", "veste", "chaussures", "sac", "chapeau", "lunettes", "echarpe", "bijoux", "ceinture", "autre"];
const SAISONS = ["printemps", "ete", "automne", "hiver"];
const OCCASIONS = ["quotidien", "travail", "soiree", "sport", "ceremonie", "detente"];
const LONGUEURS = ["courte", "hanches", "cuisses", "genoux", "mollets", "chevilles"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA_VETEMENT = {
  type: "object",
  additionalProperties: false,
  required: ["nom", "categorie", "sous_type", "couleurs", "matiere", "motif", "saisons", "occasions", "style", "longueur", "chaleur", "marque"],
  properties: {
    nom: { type: "string", description: "Nom court, comme une étiquette de dressing" },
    categorie: { type: "string", enum: CATEGORIES },
    sous_type: { type: "string" },
    couleurs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "hex"],
        properties: { nom: { type: "string" }, hex: { type: "string", description: "#rrggbb" } },
      },
    },
    matiere: { type: "string" },
    motif: { type: "string" },
    saisons: { type: "array", items: { type: "string", enum: SAISONS } },
    occasions: { type: "array", items: { type: "string", enum: OCCASIONS } },
    style: { type: "string" },
    longueur: { type: "string", enum: [...LONGUEURS, ""] },
    chaleur: { type: "integer", description: "1 très léger … 5 très chaud" },
    marque: { type: "string" },
  },
};

const SCHEMA_TENUES = {
  type: "object",
  additionalProperties: false,
  required: ["tenues"],
  properties: {
    tenues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "pieces", "explication"],
        properties: {
          nom: { type: "string" },
          pieces: { type: "array", items: { type: "string" }, description: "Identifiants des pièces, recopiés à l'identique" },
          explication: { type: "string" },
        },
      },
    },
  },
};

const SCHEMA_SILHOUETTE = {
  type: "object",
  additionalProperties: false,
  required: ["morphologie", "epaules", "poitrine", "tour_taille", "hanches", "jambes", "carnation", "cheveux_couleur", "cheveux_longueur"],
  properties: {
    morphologie: { type: "string", enum: ["feminine", "masculine", "neutre"] },
    epaules: { type: "number" },
    poitrine: { type: "number" },
    tour_taille: { type: "number" },
    hanches: { type: "number" },
    jambes: { type: "number" },
    carnation: { type: "string" },
    cheveux_couleur: { type: "string" },
    cheveux_longueur: { type: "string", enum: ["rase", "court", "mi_long", "long"] },
  },
};

const CONSIGNES_VETEMENT = `Tu es l'assistant de l'application de garde-robe atelier_Dressing. On te montre la photo d'un vêtement ou d'un accessoire (souvent posé à plat ou sur un cintre). Réponds uniquement en JSON, en français.
- nom : court et parlant, comme sur une étiquette de dressing (« Chemise en lin blanche », « Jean droit brut », « Baskets cuir blanches »).
- categorie : haut (t-shirt, chemise, pull, sweat, top, débardeur), bas (pantalon, jean, short, jupe), robe (robe, combinaison), veste (veste, blazer, manteau, doudoune, trench), chaussures, sac, chapeau (casquette, bonnet), lunettes, echarpe (écharpe, foulard), bijoux (collier, montre, bracelet, boucles), ceinture, autre.
- sous_type : le type précis en minuscules (« chemise », « jupe midi », « baskets »).
- couleurs : 1 à 3 couleurs, de la plus présente à la moins présente, avec un nom simple (Noir, Blanc, Écru, Gris, Beige, Camel, Marron, Kaki, Vert, Bleu marine, Bleu, Denim, Rouge, Bordeaux, Rose, Orange, Jaune, Moutarde, Violet, Lilas, Doré, Argenté…) et son code hexadécimal #rrggbb fidèle à la photo.
- matiere : coton, lin, laine, cachemire, denim, cuir, synthétique, soie, maille… (chaîne vide si incertain).
- motif : uni, rayures, carreaux, fleurs, pois, imprimé, logo…
- saisons : les saisons où on la porte. occasions : quotidien, travail, soiree, sport, ceremonie, detente.
- style : en deux ou trois mots (« casual chic », « sportswear », « classique »).
- longueur (hauts, bas, robes, vestes seulement, sinon chaîne vide) : courte, hanches, cuisses, genoux, mollets, chevilles.
- chaleur : 1 très léger (débardeur en lin), 2 léger (t-shirt), 3 mi-saison (chemise, sweat fin), 4 chaud (pull en laine), 5 très chaud (doudoune).
- marque : seulement si elle est lisible sur la photo, sinon chaîne vide.`;

const CONSIGNES_TENUES = `Tu es le styliste personnel de l'application atelier_Dressing. On te donne le dressing (une pièce par ligne : identifiant, catégorie, nom, couleurs, chaleur de 1 à 5, saisons, occasions, jours depuis le dernier port) et le contexte (météo, occasion, envie). Propose jusqu'à 3 tenues complètes et différentes, en JSON, en français.
Règles :
- Utilise UNIQUEMENT les identifiants fournis, recopiés à l'identique.
- Une tenue = un haut + un bas, OU une robe ; plus des chaussures si possible ; une veste s'il fait moins de 17 °C ou s'il pleut ; un ou deux accessoires au plus.
- Respecte la météo (chaleur des pièces) et l'occasion. Accorde les couleurs : des neutres et une couleur forte au plus, ou un camaïeu.
- Fais ressortir des pièces peu portées quand c'est possible.
- nom : un titre court et joyeux (« Lin et sneakers », « Chic décontracté »). explication : une ou deux phrases qui disent pourquoi ça marche aujourd'hui.`;

const CONSIGNES_SILHOUETTE = `Tu aides à créer un mannequin numérique qui ressemble à la personne de la photo (en pied, de face). Réponds uniquement en JSON.
- morphologie : feminine, masculine ou neutre (silhouette générale, pas de jugement).
- epaules, poitrine, tour_taille, hanches : proportions relatives entre 0.85 et 1.2 (1 = moyenne pour cette morphologie).
- jambes : longueur relative des jambes entre 0.92 et 1.08.
- carnation : couleur de peau en #rrggbb. cheveux_couleur : en #rrggbb. cheveux_longueur : rase, court, mi_long ou long.
Reste bienveillant et neutre : ce sont des réglages de mannequin, pas une évaluation.`;

type Tache = "vetement" | "tenues" | "silhouette";

const TACHES: Record<Tache, { schema: object; consignes: string; max_tokens: number }> = {
  vetement: { schema: SCHEMA_VETEMENT, consignes: CONSIGNES_VETEMENT, max_tokens: 1500 },
  tenues: { schema: SCHEMA_TENUES, consignes: CONSIGNES_TENUES, max_tokens: 3000 },
  silhouette: { schema: SCHEMA_SILHOUETTE, consignes: CONSIGNES_SILHOUETTE, max_tokens: 800 },
};

interface Demande {
  tache: Tache;
  image?: { media_type: string; data: string };
  dressing?: string;
  contexte?: string;
  indice?: string;
}

type Contenu =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

const TAILLE_MAX = 7_000_000; // ~5 Mo une fois décodé

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return Response.json({ erreur: "Méthode non autorisée" }, { status: 405, headers: CORS });

  try {
    const cle = Deno.env.get("ANTHROPIC_API_KEY");
    if (!cle) {
      return Response.json(
        { erreur: "Le mode cloud n'est pas configuré : ajoute le secret ANTHROPIC_API_KEY dans Supabase." },
        { status: 503, headers: CORS },
      );
    }
    if (!req.headers.get("Authorization")) return Response.json({ erreur: "Connexion requise" }, { status: 401, headers: CORS });

    const d = (await req.json()) as Demande;
    const tache = TACHES[d.tache];
    if (!tache) return Response.json({ erreur: "Tâche inconnue" }, { status: 400, headers: CORS });

    const contenu: Contenu[] = [];
    if (d.tache === "tenues") {
      if (!d.dressing?.trim()) return Response.json({ erreur: "Le dressing est vide." }, { status: 400, headers: CORS });
      contenu.push({ type: "text", text: `Contexte : ${(d.contexte ?? "").slice(0, 1000)}\n\nDressing :\n${d.dressing.slice(0, 60_000)}` });
    } else {
      if (!d.image?.data || !/^image\/(jpeg|png|webp|gif)$/.test(d.image.media_type)) {
        return Response.json({ erreur: "Envoie une photo (JPEG, PNG ou WebP)." }, { status: 400, headers: CORS });
      }
      if (d.image.data.length > TAILLE_MAX) throw new Error("Photo trop lourde (5 Mo maximum)");
      contenu.push({ type: "image", source: { type: "base64", media_type: d.image.media_type, data: d.image.data } });
      contenu.push({
        type: "text",
        text:
          d.tache === "silhouette"
            ? "Voici la photo en pied."
            : `Voici la photo du vêtement.${d.indice ? ` Couleurs mesurées sur la photo : ${d.indice.slice(0, 200)}.` : ""}`,
      });
    }

    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
        max_tokens: tache.max_tokens,
        system: tache.consignes,
        messages: [{ role: "user", content: contenu }],
        output_config: { format: { type: "json_schema", schema: tache.schema } },
      }),
    });
    const resultat = await reponse.json();
    if (!reponse.ok) {
      console.error(resultat);
      throw new Error(resultat?.error?.message ?? `Erreur de l'API Claude (${reponse.status})`);
    }
    const bloc = (resultat.content as { type: string; text?: string }[]).find((c) => c.type === "text");
    if (!bloc?.text) throw new Error("Réponse vide de Claude");
    return Response.json({ resultat: JSON.parse(bloc.text), modele: resultat.model }, { headers: CORS });
  } catch (err) {
    console.error(err);
    return Response.json({ erreur: (err as Error).message }, { status: 500, headers: CORS });
  }
});
