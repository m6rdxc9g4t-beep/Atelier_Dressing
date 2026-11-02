# atelier_Dressing

Ton dressing en photos et un mannequin qui te ressemble. Tu photographies chaque vêtement et accessoire : l'app le **détoure**, l'**IA le reconnaît** (catégorie, couleurs, matière, saisons, occasions, chaleur), puis tu l'essaies **sur ton mannequin** pour composer tes tenues. Une seule app, sur **Mac** (app à double-cliquer) et sur **iPhone** (app sur l'écran d'accueil), dans la charte « néon monochrome » de la suite Atelier : toute l'app en **champagne**.

![Cabine sur Mac](design/captures/mac-1-cabine.png)

## Ce que fait l'app

| Onglet | |
|---|---|
| **Cabine** | Ton mannequin, habillé des photos détourées de **tes** pièces, posées à l'échelle réelle (épaules du vêtement sur tes épaules, ceinture sur ta taille). **Essayage réaliste** : une vraie photo de toi qui porte ces pièces, générée à partir de ta photo en pied (voir plus bas). Touche une pièce sur le portant pour l'enfiler (une robe remplace le haut et le bas). **Proposer une tenue** : le styliste IA compose jusqu'à 3 tenues selon la météo du jour, l'occasion (travail, soirée, sport…) et ce que tu n'as pas porté depuis longtemps. **Au hasard** fait un tirage instantané sans IA. **Ajuster** : fais glisser une pièce sur le mannequin (molette ou curseur pour la taille) ; le réglage est gardé pour toutes tes tenues. **Enregistrer la tenue**, **Je la porte aujourd'hui**. |
| **Dressing** | Toutes tes pièces, détourées, par catégorie (hauts, bas, robes, vestes, chaussures, sacs, chapeaux, lunettes, écharpes, bijoux, ceintures). Recherche (« lin », « bleu marine », une marque), filtres saison / favoris / archivées, tri par pièces les moins portées. La fiche montre la pièce sur ton mannequin, combien de fois tu l'as portée et son **coût par port**. Retouche du détourage à partir de la photo d'origine. |
| **Scanner** | **Prendre une photo** (appareil de l'iPhone) ou **importer plusieurs photos** d'un coup (glisser-déposer sur Mac). Détourage automatique sur l'appareil, réglable (tolérance du fond, ou photo entière). L'IA remplit la fiche pendant ce temps ; tu vérifies, l'aperçu sur ton mannequin se met à jour, puis **Ajouter au dressing**. |
| **Tenues** | Tes tenues enregistrées (avec leur photo réaliste si tu l'as faite), tes **photos d'essayage**, le **journal** de ce que tu as porté, et un **bilan** : pièces portées ces 90 derniers jours, valeur du dressing, coût moyen par port, pièces à ressortir du placard, pièces préférées. |
| **Moi** | **Ta photo en pied** (pour l'essayage réaliste) et le mannequin qui te ressemble : silhouette (féminine, neutre, masculine), taille, épaules, poitrine, tour de taille, hanches, longueur des jambes, carnation, cheveux, et ta photo dans l'ovale du visage. **Créer à partir d'une photo** : l'IA estime tout ça sur une photo de toi en pied (la photo n'est pas gardée). |

![iPhone](design/captures/iphone-1-cabine.png) ![Dressing](design/captures/iphone-2-dressing.png) ![Vérifier une pièce](design/captures/iphone-3b-verifier.png)

## Deux façons de l'utiliser

| | **Sur cet appareil** (par défaut) | **Synchronisé** |
|---|---|---|
| Données et photos | IndexedDB de l'appareil (navigateur, iPhone ou app Mac) | Supabase (projet partagé avec atelier_Cuisine) : Postgres + RLS + bucket privé `dressing` |
| Compte | aucun | e-mail et mot de passe, le même que pour Cuisine |
| Mac ↔ iPhone | non (sauvegarde / import d'un fichier) | en temps réel |
| IA | Ollama, ou Claude par la CLI de l'app Mac | Ollama ou Claude ; sur l'iPhone, Claude passe par ton Mac |
| Essayage réaliste | non | oui (FLUX.2) |

L'écran de connexion propose aussi **Continuer sans compte**. **Réglages → Données** exporte tout (pièces, tenues, journal, mannequin et photos) dans un fichier JSON, et l'importe ailleurs : c'est aussi le chemin pour passer du mode local au mode synchronisé.

## L'IA : Ollama ou Claude avec ton forfait

Comme les autres apps de la suite (contrat `docs/SUITE.md` §5 d'Atelier_Tab), **Réglages → Intelligence artificielle** : **Moteur : Auto · Ollama · Claude**.

- **Claude** : la **CLI Claude Code** de ton Mac, avec **ton abonnement Claude** (Pro ou Max), sans clé API. Modèle Sonnet (par défaut), Opus ou Haiku. Une fois pour toutes sur le Mac :
  ```bash
  curl -fsSL https://claude.ai/install.sh | bash   # si Claude Code n'est pas encore installé
  claude auth login                                 # connexion avec ton compte Claude
  ```
  L'app Mac lance `claude -p` isolée (aucun outil, aucun fichier, environnement en liste blanche, délai de 180 s) ; la photo et les données passent par l'entrée standard, jamais en argument. Réglages affiche « Claude Code prêt » quand tout est bon.
- **Sur l'iPhone** (ou dans un navigateur), la CLI ne peut pas tourner : la demande passe par **ton Mac**. Laisse l'app Mac ouverte et connectée au même compte ; l'iPhone dépose la demande, le Mac la passe à Claude avec ton forfait et renvoie la réponse (quelques secondes de plus). Réglages sur l'iPhone indique si ton Mac est prêt.
- **Ollama** : sur le Mac, hors ligne et gratuit ; tes photos ne quittent pas l'ordinateur.
  ```bash
  ollama pull llama3.2-vision   # reconnaître les pièces, estimer ta silhouette
  ollama pull llama3.2          # composer les tenues
  ```
  Depuis un navigateur, lance Ollama avec `OLLAMA_ORIGINS` autorisant l'adresse de l'app.
- **Auto** (par défaut) : Claude s'il est disponible, sinon Ollama. La réponse dit toujours le moteur utilisé.

Quand Claude répond, il reçoit : la photo de la pièce scannée ; pour les tenues, la liste de tes pièces (nom, couleurs, saisons, dernier port) et la météo ; pour ton mannequin, ta photo en pied. Rien d'autre.

Sans aucune IA, tout reste utilisable : le détourage et les couleurs se font sur l'appareil, la fiche se remplit à la main, et les tenues sont composées par des règles (météo, saison, occasion, harmonie des couleurs, rotation).

### Ajustement sur ton corps

À la reconnaissance, l'IA pose aussi des **repères** sur la photo de la pièce : coutures d'épaules (hauts, vestes, robes), ceinture et ourlet (bas). L'app cale ces points sur les épaules et la taille de ton mannequin, puis fait tomber le bas à sa longueur. Sans repères (Ollama, ou repères peu plausibles), l'app les mesure elle-même sur la photo détourée (ligne d'épaules, buste, ceinture). Dans la fiche d'une pièce, **Réajuster sur moi** redemande les repères à l'IA ; en Cabine, **Ajuster** permet de corriger au doigt.

## Essayage réaliste : toi, avec tes vrais vêtements

Le mannequin est un **collage** instantané et hors ligne : les photos détourées de tes pièces sur une silhouette à tes proportions. Pour te voir **vraiment** habillé, la Cabine a un bouton **Essayage réaliste** :

1. Dans **Moi**, ajoute une photo de toi en pied (de face, debout, bras un peu écartés, fond simple).
2. Habille le mannequin en Cabine, puis touche **Essayage réaliste**.
3. Ta photo et celles des pièces partent vers **FLUX.2** (Black Forest Labs) par la fonction Edge `essayage`. Environ 20 à 40 secondes plus tard, tu as une photo de toi portant ces pièces exactes (couleurs, coupe, col, boutons, logos), avec ton visage, ta silhouette et ton décor. Elle est gardée dans **Tenues → Photos** et s'affiche sur la carte de la tenue.

Ni Ollama ni Claude ne génèrent d'images (ton forfait Claude ne peut donc pas servir ici), d'où ce troisième service. Il demande le mode synchronisé et une clé Black Forest Labs (environ 3 centimes par photo avec `flux-2-pro`, moins avec `flux-2-klein-4b`) :

1. Crée un compte sur [dashboard.bfl.ai](https://dashboard.bfl.ai), ajoute quelques crédits et crée une clé API.
2. Supabase (projet Atelier_Cuisine) → **Edge Functions → Secrets** : ajoute `BFL_API_KEY`. Facultatif : `BFL_MODEL` (`flux-2-pro` par défaut, `flux-2-max` pour la meilleure qualité, `flux-2-klein-4b` pour le moins cher).

Ta photo en pied ne quitte ton dressing qu'au moment d'un essayage.

## Installer

### Sur Mac

1. Va dans [Releases → Atelier Dressing pour Mac](../../releases/tag/mac-latest) et télécharge **Atelier-Dressing.dmg**.
2. Ouvre le .dmg et glisse **Atelier Dressing** dans **Applications**.
3. Premier lancement : l'app n'est pas signée par un compte développeur Apple, donc macOS la bloque. Double-clique dessus une fois, puis va dans **Réglages Système → Confidentialité et sécurité** et clique **Ouvrir quand même**. Alternative : `xattr -cr "/Applications/Atelier Dressing.app"`.

L'app Mac est recompilée par GitHub Actions à chaque modification de `frontend/` sur `main` (workflow « App Mac »).

### Sur iPhone

1. Ouvre **https://atelier-dressing.vercel.app** dans **Safari**.
2. Touche **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Ouvre l'app depuis son icône et connecte-toi avec ton compte Cuisine (le même e-mail et mot de passe). **Scanner → Prendre une photo** ouvre directement l'appareil photo.

L'app web est hébergée sur Vercel (équipe FiKozZ, projet `atelier-dressing`, dossier racine `frontend`).

## Architecture

```
┌───────────────────────────────┐      ┌──────────────────────────────────────────┐
│ frontend/  (React)            │      │ backend/  (Supabase)                     │
│                               │      │                                          │
│  App Mac  ── Tauri .dmg       ├──┐   │  Postgres + RLS : vetements, tenues,     │
│  iPhone   ── PWA Vercel       ├──┼──▶│    ports (journal), profils (mannequin)  │
│  Navigateur                   ├──┘   │  Storage : bucket privé « dressing »     │
│                               │      │  Auth · Realtime (synchro Mac ↔ iPhone)  │
│  Détourage, couleurs,         │      │  ia_demandes / ia_relais (relais Claude) │
│  mannequin : sur l'appareil   │      │                                          │
│  Mode local : IndexedDB       │      └──────────────────────────────────────────┘
│  IA : Ollama (Mac) ───────────┼──▶ http://localhost:11434
│    ou Claude : CLI du Mac ────┼──▶ claude -p (ton abonnement)
│    iPhone → ia_demandes ──────┼──▶ relais par l'app Mac
└───────────────────────────────┘
design/  charte néon champagne, icône, captures
```

| Dossier | Contenu |
|---|---|
| [`frontend/`](frontend/) | React 19 + TypeScript + Vite. PWA (service worker, manifeste). `src-tauri/` enveloppe le même code en app Mac native. La logique testée est dans `src/lib/` : détourage, géométrie du mannequin, suggestions de tenues, couleurs, normalisation des réponses de l'IA, dépôt local. |
| [`backend/`](backend/) | Migrations SQL, fonction Edge `essayage`, tests des migrations sur PGlite. Voir [backend/README.md](backend/README.md). |
| [`design/`](design/) | Charte, icône, captures. Voir [design/DESIGN.md](design/DESIGN.md). |

## Développer

```bash
cd frontend
npm install
npm run dev          # http://localhost:1430 (mode « Sur cet appareil » sans .env.local)
npm test             # détourage, mannequin, ajustement, suggestions, couleurs, IA, CLI Claude, dépôt local
cd src-tauri && cargo test   # lancement isolé de la CLI Claude (fausse CLI)
npm run tauri dev    # app Mac en développement (sur un Mac, avec Rust)
npm run mac          # compile le .dmg localement (sur un Mac)

cd ../backend/tests
npm install && npm test   # rejoue les migrations sur PGlite : RLS, déclencheurs, stockage
```

## Le mode synchronisé

Il est déjà branché : atelier_Dressing utilise le projet Supabase **Atelier_Cuisine** (`hcdiuxznceuixindcvhp`, Paris), dans ses propres tables (`vetements`, `tenues`, `ports`, `profils`, `essayages`) et son bucket `dressing`. Le compte de connexion est le même que pour Cuisine. Migrations appliquées et fonction `essayage` déployée le 2 novembre 2026. Aucune clé Claude n'est nécessaire : Claude passe par la CLI de ton Mac.

Pour redéployer après une modification du backend :

```bash
cd backend
supabase link --project-ref hcdiuxznceuixindcvhp
supabase db push
supabase functions deploy essayage
```

Dans Supabase, **Authentication → URL Configuration**, ajoute l'adresse de l'app web de Dressing dans **Redirect URLs** (les liens des e-mails de confirmation y ramènent).
