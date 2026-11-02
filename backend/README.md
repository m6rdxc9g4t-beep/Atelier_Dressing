# Backend — Supabase

Le backend du mode « Synchronisé » : un projet Supabase (Postgres + authentification + stockage + temps réel + fonction Edge). Le mode « Sur cet appareil » n'en a pas besoin.

## Ce qu'il fait

| Élément | Rôle |
|---|---|
| `vetements` | chaque pièce : nom, catégorie (12), type, couleurs (`[{nom, hex}]`), matière, motif, saisons, occasions, style, longueur, chaleur (1 à 5), marque, taille, prix, date d'achat, notes, favori, archivée, clés des photos (détourée et d'origine), calage sur le mannequin (`{echelle, dx, dy}`) |
| `tenues` | tenues enregistrées : nom, pièces (`uuid[]`), occasion, saisons, note, favori |
| `ports` | journal : ce qui a été porté, quel jour, avec la tenue d'origine si elle existe |
| `profils` | un par compte : prénom et réglages du mannequin (`avatar` en JSON) |
| `vetements_stats` (vue) | nombre de ports, dernière sortie et coût par port de chaque pièce |
| déclencheur `retirer_des_tenues` | une pièce supprimée sort des tenues ; le journal garde la trace |
| bucket `dressing` | photos privées (WebP / PNG détourées, JPEG d'origine, visage), 10 Mo maximum, rangées par compte : `<user_id>/<clé>` |
| fonction Edge `ia-dressing` | Claude : `vetement` (photo → fiche), `tenues` (dressing résumé + météo / occasion → 3 tenues), `silhouette` (photo en pied → proportions du mannequin). Exige un utilisateur connecté. |

**Sécurité :** RLS sur toutes les tables et sur les photos ; chaque compte ne voit que ses données. Fonctions SQL en `security invoker` avec `search_path = ''`, vue en `security_invoker`. La clé API Claude est un secret de la fonction, jamais dans l'app.

**Synchro :** vêtements, tenues, journal et profil sont publiés en temps réel ; les photos sont téléchargées une fois puis gardées en cache dans IndexedDB.

## Fichiers

```
supabase/
  config.toml
  migrations/20261102000000_dressing.sql          tables, vue, déclencheurs, RLS, temps réel
  migrations/20261102000100_stockage_photos.sql   bucket « dressing » et ses règles
  functions/ia-dressing/index.ts                  IA Claude (mêmes consignes que frontend/src/lib/ia.ts)
tests/
  migrations.test.mjs                             migrations rejouées sur PGlite + tests RLS
```

## Déployer

```bash
supabase link --project-ref <ref>
supabase db push
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # ANTHROPIC_MODEL facultatif
supabase functions deploy ia-dressing
```

## Tester

```bash
cd tests && npm install && npm test
```
