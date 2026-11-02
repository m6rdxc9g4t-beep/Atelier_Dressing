# Instructions pour Claude — `atelier_Dressing`

Avant toute modification, lis [`README.md`](README.md) et [`design/DESIGN.md`](design/DESIGN.md) (charte néon). Interface, libellés, messages, commentaires et réponses de l'IA : **en français**.

## Stack (la même que les autres apps de la suite)

| Besoin | Mise en œuvre |
|---|---|
| Frontend | React 19 + TypeScript + Vite (`frontend/`), PWA iPhone (Vercel), app Mac Tauri (`frontend/src-tauri/`) |
| Données | contrat `Depot` (`frontend/src/lib/depot.ts`) : `DepotLocal` (IndexedDB, sans compte) ou `DepotCloud` (Supabase + bucket `dressing`, temps réel) |
| Base | Supabase Postgres + RLS (`backend/supabase/migrations/`) ; types côté app dans `frontend/src/lib/types.ts` (mêmes noms de colonnes) |
| IA | `frontend/src/lib/ia.ts` : Ollama (local) / Claude via la fonction `ia-dressing` (cloud) / auto, bascule si Ollama ne répond pas en 3 s ; réponses toujours passées par `normaliser*` |
| Détourage | `frontend/src/lib/detourage.ts` (sans IA, sur l'appareil) |
| Mannequin | `frontend/src/lib/mannequin.ts` (géométrie, zones, calage) + `components/Mannequin.tsx` (SVG) |
| Tenues sans IA | `frontend/src/lib/suggestion.ts` (météo, saison, occasion, harmonie, rotation) |

## Règles

- TypeScript strict, pas de `any`. Les listes de catégories, saisons, occasions et longueurs existent en trois endroits : `lib/categories.ts`, les contraintes `check` SQL et `functions/ia-dressing/index.ts`. Les consignes et schémas de l'IA existent en double (`lib/ia.ts` et la fonction) : modifier les deux côtés.
- Toute nouvelle table : RLS activée, politiques par `user_id`, fonctions SQL en `security invoker` avec `search_path = ''`, ajout à la publication `supabase_realtime`, et la même chose dans `DepotLocal` et `DepotCloud`.
- Une photo remplacée prend une **nouvelle clé** (le cache d'URL et le cache IndexedDB sont indexés par clé).
- Ce que l'IA renvoie est toujours vérifié par l'utilisateur avant d'être enregistré (scanner : fiche à vérifier ; silhouette : réglages à enregistrer).
- Design : charte « néon monochrome » de la suite Atelier, signature **champagne** (`#E6C79C` en néon, `#9C7643` en clair) posée dans `tokens.css` (le kit ne connaît pas encore Dressing). `frontend/src/styles/atelier-brand/` est une copie exacte du kit de la suite : ne jamais l'éditer ici. `app.css` et `neon.css` reprennent la base commune d'atelier_Cuisine ; ce qui est propre au dressing va dans `dressing.css`. `<html data-atelier-app="dressing">`, thème `data-theme="dark"` + classe `dark` (défaut) ou `data-theme="light"`. Les pastilles de couleur des vêtements montrent la vraie couleur, jamais la signature. Cibles tactiles de 44 px.

## Commandes

```bash
cd frontend && npm install && npm run dev      # http://localhost:1430
cd frontend && npm test && npx tsc -b && npm run lint && npm run build
cd backend/tests && npm install && npm test     # migrations sur PGlite
```

Un push sur `main` qui touche `frontend/` recompile l'app Mac : appliquer d'abord les migrations Supabase (`supabase db push`) si le schéma a changé.
