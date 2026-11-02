# Backend — Supabase

Le backend du mode « Synchronisé ». Il vit dans le projet Supabase **Atelier_Cuisine** (`hcdiuxznceuixindcvhp`, Paris), à côté des tables de Cuisine : mêmes comptes, tables en français, fonctions SQL préfixées `dressing_`. Le mode « Sur cet appareil » n'en a pas besoin.

## Ce qu'il fait

| Élément | Rôle |
|---|---|
| `vetements` | chaque pièce : nom, catégorie (12), type, couleurs (`[{nom, hex}]`), matière, motif, saisons, occasions, style, longueur, chaleur (1 à 5), marque, taille, prix, date d'achat, notes, favori, archivée, clés des photos (détourée, d'origine, de dos `image_dos`), calage sur le mannequin (`{echelle, dx, dy}`) |
| `tenues` | tenues enregistrées : nom, pièces (`uuid[]`), occasion, saisons, note, favori |
| `ports` | journal : ce qui a été porté, quel jour, avec la tenue d'origine si elle existe |
| `profils` | un par compte : prénom et réglages du mannequin (`avatar` en JSON) |
| `vetements_stats` (vue) | nombre de ports, dernière sortie et coût par port de chaque pièce |
| déclencheur `retirer_des_tenues` | une pièce supprimée sort des tenues ; le journal garde la trace |
| bucket `dressing` | photos privées (WebP / PNG détourées, JPEG d'origine, visage), 10 Mo maximum, rangées par compte : `<user_id>/<clé>` |
| `essayages` | photos d'essayage réaliste : pièces essayées, clé de l'image, modèle utilisé |
| fonction Edge `essayage` | FLUX.2 (Black Forest Labs) : ta photo en pied + les photos des pièces → une photo de toi qui les porte. Secrets `BFL_API_KEY` (obligatoire) et `BFL_MODEL` (facultatif). |
| fonction Edge `importer-lien` | lit une fiche produit de boutique (adresse donnée par l'utilisateur) et rapporte ses photos (`og:image`, JSON-LD, galerie), puis sert de relais pour les télécharger (pas de CORS). Compte connecté obligatoire, adresses publiques en https seulement, images de 10 Mo maximum. |
| `ia_demandes`, `ia_relais` | relais Claude : l'iPhone dépose une demande d'IA, l'app Mac ouverte sur le même compte la passe à Claude par sa CLI (ton abonnement) et écrit la réponse ; `ia_relais` dit quel Mac est ouvert |

**Sécurité :** RLS sur toutes les tables et sur les photos ; chaque compte ne voit que ses données. Fonctions SQL en `security invoker` avec `search_path = ''`, vue en `security_invoker`. Claude ne passe par aucune clé API : la CLI Claude Code du Mac utilise l'abonnement de l'utilisateur. La fonction `ia-dressing` (Claude par clé API) des premières versions n'est plus utilisée et peut être supprimée du tableau de bord.

**Synchro :** vêtements, tenues, journal et profil sont publiés en temps réel ; les photos sont téléchargées une fois puis gardées en cache dans IndexedDB.

## Fichiers

```
supabase/
  config.toml
  migrations/20261102000000_dressing.sql          tables, vue, déclencheurs, RLS, temps réel
  migrations/20261102000100_stockage_photos.sql   bucket « dressing » et ses règles
  migrations/20261102000200_essayages.sql         photos d'essayage réaliste
  migrations/20261102000300_relais_claude.sql     relais Claude iPhone → Mac
  migrations/20261102000400_ajustement.sql        repères d'ajustement des pièces
  migrations/20261102000500_photo_dos.sql         photo de dos des pièces (vue 3D)
  functions/essayage/index.ts                     FLUX.2 : essayage réaliste
  functions/importer-lien/index.ts                photos d'une fiche produit de boutique
tests/
  migrations.test.mjs                             migrations rejouées sur PGlite + tests RLS
```

## Déployer

```bash
supabase link --project-ref hcdiuxznceuixindcvhp
supabase db push
supabase secrets set BFL_API_KEY=...                # essayage réaliste
supabase functions deploy essayage
supabase functions deploy importer-lien
```

## Tester

```bash
cd tests && npm install && npm test
```
