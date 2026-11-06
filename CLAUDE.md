# Instructions pour Claude — `atelier_Dressing`

Avant toute modification, lis [`README.md`](README.md) et [`design/DESIGN.md`](design/DESIGN.md) (charte v2 « Linear » de la suite). Interface, libellés, messages, commentaires et réponses de l'IA : **en français**.

## Stack (la même que les autres apps de la suite)

| Besoin | Mise en œuvre |
|---|---|
| Frontend | React 19 + TypeScript + Vite (`frontend/`), PWA iPhone (Vercel), app Mac Tauri (`frontend/src-tauri/`) |
| Données | contrat `Depot` (`frontend/src/lib/depot.ts`) : `DepotLocal` (IndexedDB, sans compte) ou `DepotCloud` (Supabase + bucket `dressing`, temps réel) |
| Base | Supabase Postgres + RLS (`backend/supabase/migrations/`) ; types côté app dans `frontend/src/lib/types.ts` (mêmes noms de colonnes) |
| IA | `frontend/src/lib/ia.ts` : « Moteur : Auto · Ollama · Claude » (contrat `docs/SUITE.md` §5 d'Atelier_Tab). Claude = **CLI Claude Code du Mac, abonnement de l'utilisateur, jamais de clé API** : `src-tauri/src/claude.rs` (lancement isolé, testé avec `cargo test`) + `lib/claude.ts` ; sur l'iPhone, relais par le Mac (`lib/relais.ts`, tables `ia_demandes` / `ia_relais`). Réponses toujours passées par `normaliser*` |
| Détourage | `frontend/src/lib/detourage.ts` (sans IA, sur l'appareil) |
| Mannequin | `frontend/src/lib/mannequin.ts` (géométrie, zones, calage) + `components/Mannequin.tsx` (SVG) |
| Essayage et 3D (gratuits) | `frontend/src/lib/hf.ts` (client Gradio : Leffa `/leffa_predict_vt`, TRELLIS.2 `/preprocess_image` → `/image_to_3d` → `/extract_glb`, jeton Hugging Face de l'utilisateur, réglage local) + `essayerHF` / `creer3D` dans `essayage.ts` ; visionneuse GLB `components/Vue3D.tsx` (three.js, chargée à la demande) ; `essayages.modele_3d` (clé du GLB dans le bucket) |
| Tenues sans IA | `frontend/src/lib/suggestion.ts` (météo, saison, occasion, harmonie, rotation) |
| Essayage FLUX.2 (option payante) | `frontend/src/lib/essayage.ts` (consigne, photos) → fonction `essayage` → FLUX.2 (Black Forest Labs) ; résultats dans la table `essayages` |
| Photos de boutique | `lib/lien.ts` + fonction `importer-lien` ; photo de dos `vetements.image_dos` |
| Supabase | projet **partagé avec atelier_Cuisine** (`hcdiuxznceuixindcvhp`) : ne jamais toucher aux tables de Cuisine ; fonctions SQL préfixées `dressing_` |

## Règles

- TypeScript strict, pas de `any`. Les listes de catégories, saisons, occasions et longueurs existent en deux endroits : `lib/categories.ts` et les contraintes `check` SQL. Consignes et schémas de l'IA : `lib/ia.ts` seulement (Ollama et Claude les partagent).
- CLI Claude : arguments du contrat uniquement (`--safe-mode`, `--tools ""`, `--strict-mcp-config`…), aucune donnée en argument (prompt système = consignes ; photo et données sur l'entrée standard en stream-json), environnement en liste blanche, délai de 180 s.
- Toute nouvelle table de données : RLS activée, politiques par `user_id`, fonctions SQL en `security invoker` avec `search_path = ''`, ajout à la publication `supabase_realtime`, et la même chose dans `DepotLocal` et `DepotCloud` (sauf les tables de transport du relais, `ia_demandes` et `ia_relais`).
- Le mannequin pose les pièces à l'**échelle réelle** (`rectReel` dans `mannequin.ts`) : d'abord les repères de l'IA (`vetements.ajustement` : coutures d'épaules, ceinture, ourlet) calés sur les épaules et la taille du corps, sinon les repères mesurés sur la photo détourée, sinon la zone. Une photo retouchée efface `ajustement` (nouveau cadrage). Le réglage manuel (`calage`) s'applique par-dessus.
- La 3D vient de TRELLIS.2 à partir de la photo d'essayage (Leffa ou FLUX.2) : pas de 3D reconstruite à la main. Leffa ne pose qu'une pièce par passage (bas, puis haut, puis veste ; robe) ; les erreurs des démos passent par `messageHF` (quota traduit avec le délai). Ne jamais versionner les photos des boutiques ni de l'utilisateur dans le dépôt.
- Une photo remplacée prend une **nouvelle clé** (le cache d'URL et le cache IndexedDB sont indexés par clé).
- Ce que l'IA renvoie est toujours vérifié par l'utilisateur avant d'être enregistré (scanner : fiche à vérifier ; silhouette : réglages à enregistrer).
- Design : charte v2 « Linear » de la suite Atelier (`Atelier_Deploy/DESIGN.md`, `docs/SUITE.md` §1.7 d'Atelier_Projets) : structure neutre en gris froids, clair et sombre, plat au repos, traits de 1 px, police Inter embarquée, base 13 px sur ordinateur (15 px sur téléphone). Signature **vieux rose `#a16464`** (`<html data-atelier-app="dressing">`), seulement pour l'accent : bouton principal plein, sélection, focus, liens, icône. Pas de halo, de lueur, de grille, de `text-shadow` ni de barre de couleur latérale ; une ombre seulement pour ce qui flotte. `frontend/src/styles/atelier-brand/` (`atelier-brand.css`, `atelier-theme.js`, Inter) est une copie exacte du kit de la suite : ne jamais l'éditer ici (oxlint l'ignore). `tokens.css` branche les jetons de l'app sur `--atelier-*`, `app.css` porte la base et la coquille (barre latérale 232 px, barre haute 44 px), ce qui est propre au dressing va dans `dressing.css`. Thème : préférence commune à la suite (`window.atelierTheme`, script inséré dans `<head>` par `vite.config.ts`), `data-theme` + classe `dark`. Les photos des pièces mènent (fond neutre `--fond-photo`) ; les pastilles de couleur des vêtements montrent la vraie couleur, jamais la signature. Cibles tactiles de 44 px au doigt.

## Commandes

```bash
cd frontend && npm install && npm run dev      # http://localhost:1430
cd frontend && npm test && npx tsc -b && npm run lint && npm run build
cd frontend/src-tauri && cargo test             # CLI Claude isolée (sur un Mac ; ailleurs : module claude.rs seul)
cd backend/tests && npm install && npm test     # migrations sur PGlite
```

Un push sur `main` qui touche `frontend/` recompile l'app Mac : appliquer d'abord les migrations Supabase (`supabase db push`) si le schéma a changé.
