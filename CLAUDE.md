# Instructions pour Claude — `atelier_Dressing`

Avant toute modification, lis [`README.md`](README.md) et [`design/DESIGN.md`](design/DESIGN.md) (charte néon). Interface, libellés, messages, commentaires et réponses de l'IA : **en français**.

## Stack (la même que les autres apps de la suite)

| Besoin | Mise en œuvre |
|---|---|
| Frontend | React 19 + TypeScript + Vite (`frontend/`), PWA iPhone (Vercel), app Mac Tauri (`frontend/src-tauri/`) |
| Données | contrat `Depot` (`frontend/src/lib/depot.ts`) : `DepotLocal` (IndexedDB, sans compte) ou `DepotCloud` (Supabase + bucket `dressing`, temps réel) |
| Base | Supabase Postgres + RLS (`backend/supabase/migrations/`) ; types côté app dans `frontend/src/lib/types.ts` (mêmes noms de colonnes) |
| IA | `frontend/src/lib/ia.ts` : « Moteur : Auto · Ollama · Claude » (contrat `docs/SUITE.md` §5 d'Atelier_Tab). Claude = **CLI Claude Code du Mac, abonnement de l'utilisateur, jamais de clé API** : `src-tauri/src/claude.rs` (lancement isolé, testé avec `cargo test`) + `lib/claude.ts` ; sur l'iPhone, relais par le Mac (`lib/relais.ts`, tables `ia_demandes` / `ia_relais`). Réponses toujours passées par `normaliser*` |
| Détourage | `frontend/src/lib/detourage.ts` (sans IA, sur l'appareil) |
| Mannequin | `frontend/src/lib/mannequin.ts` (géométrie, zones, calage) + `components/Mannequin.tsx` (SVG) |
| Tenues sans IA | `frontend/src/lib/suggestion.ts` (météo, saison, occasion, harmonie, rotation) |
| Essayage réaliste | `frontend/src/lib/essayage.ts` (consigne, photos) → fonction `essayage` → FLUX.2 (Black Forest Labs) ; résultats dans la table `essayages` |
| Supabase | projet **partagé avec atelier_Cuisine** (`hcdiuxznceuixindcvhp`) : ne jamais toucher aux tables de Cuisine ; fonctions SQL préfixées `dressing_` |

## Règles

- TypeScript strict, pas de `any`. Les listes de catégories, saisons, occasions et longueurs existent en deux endroits : `lib/categories.ts` et les contraintes `check` SQL. Consignes et schémas de l'IA : `lib/ia.ts` seulement (Ollama et Claude les partagent).
- CLI Claude : arguments du contrat uniquement (`--safe-mode`, `--tools ""`, `--strict-mcp-config`…), aucune donnée en argument (prompt système = consignes ; photo et données sur l'entrée standard en stream-json), environnement en liste blanche, délai de 180 s.
- Toute nouvelle table de données : RLS activée, politiques par `user_id`, fonctions SQL en `security invoker` avec `search_path = ''`, ajout à la publication `supabase_realtime`, et la même chose dans `DepotLocal` et `DepotCloud` (sauf les tables de transport du relais, `ia_demandes` et `ia_relais`).
- Le mannequin pose les pièces à l'**échelle réelle** (`rectReel` dans `mannequin.ts`) : d'abord les repères de l'IA (`vetements.ajustement` : coutures d'épaules, ceinture, ourlet) calés sur les épaules et la taille du corps, sinon les repères mesurés sur la photo détourée, sinon la zone. Une photo retouchée efface `ajustement` (nouveau cadrage). Le réglage manuel (`calage`) s'applique par-dessus.
- Une photo remplacée prend une **nouvelle clé** (le cache d'URL et le cache IndexedDB sont indexés par clé).
- Ce que l'IA renvoie est toujours vérifié par l'utilisateur avant d'être enregistré (scanner : fiche à vérifier ; silhouette : réglages à enregistrer).
- Design : charte « néon monochrome » de la suite Atelier, signature **champagne** (`#E6C79C` en néon, `#9C7643` en clair) posée dans `tokens.css` (le kit ne connaît pas encore Dressing). `frontend/src/styles/atelier-brand/` est une copie exacte du kit de la suite : ne jamais l'éditer ici. `app.css` et `neon.css` reprennent la base commune d'atelier_Cuisine ; ce qui est propre au dressing va dans `dressing.css`. `<html data-atelier-app="dressing">`, thème `data-theme="dark"` + classe `dark` (défaut) ou `data-theme="light"`. Les pastilles de couleur des vêtements montrent la vraie couleur, jamais la signature. Cibles tactiles de 44 px.

## Commandes

```bash
cd frontend && npm install && npm run dev      # http://localhost:1430
cd frontend && npm test && npx tsc -b && npm run lint && npm run build
cd frontend/src-tauri && cargo test             # CLI Claude isolée (sur un Mac ; ailleurs : module claude.rs seul)
cd backend/tests && npm install && npm test     # migrations sur PGlite
```

Un push sur `main` qui touche `frontend/` recompile l'app Mac : appliquer d'abord les migrations Supabase (`supabase db push`) si le schéma a changé.
