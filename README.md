# Stats Ultimate · Les Plouf

Saisie rapide des stats pendant les matchs d'ultimate, analyse après, prévision météo pour l'entraînement.
Application web installable (PWA), **local d'abord** : tout est stocké dans le navigateur (localStorage) et
fonctionne hors-ligne au bord du terrain. Avec un compte, les données sont aussi synchronisées dans
**Supabase** (une copie par compte, retrouvée sur tous ses appareils). TypeScript + Vite ; seule dépendance
d'exécution : `@supabase/supabase-js`, chargée à la demande.

## Démarrer

```bash
npm install
npm run dev        # développement : http://localhost:5173
npm test           # tests unitaires (vitest)
npm run build      # vérifie les types puis génère dist/ (avec le service worker hors-ligne)
npm run preview    # teste le build
```

Pour installer sur téléphone, `dist/` doit être servi en **HTTPS** (GitHub Pages, Netlify, Cloudflare Pages…).
Le `base: './'` de Vite permet de le poser dans n'importe quel sous-dossier. Une fois ouvert en ligne une fois,
l'appli fonctionne sans réseau.

## Compte et synchronisation (Supabase)

- **Écran d'accueil** : se connecter, créer un compte (e-mail + mot de passe), mot de passe oublié, ou
  « Continuer sans compte » (données sur ce navigateur uniquement ; connexion possible plus tard dans Réglages).
- **Données personnelles** : table `app_states` (une ligne JSON par utilisateur), protégée par des règles RLS :
  chacun ne lit et n'écrit que sa ligne ; les visiteurs non connectés n'ont aucun accès.
- **Synchro** : chaque modification est enregistrée localement, puis envoyée 1,5 s plus tard (ou au retour du
  réseau). Au retour sur l'appli, et toutes les 2 minutes, les modifications faites sur un autre appareil sont
  récupérées. Si les deux côtés ont changé, l'appli demande quelle version garder (avec option de sauvegarde
  avant). La fonction `save_app_state` refuse d'écraser une version plus récente (numéro de révision).
- **Déconnexion** : envoie les dernières modifications, puis retire les données de l'appareil (elles restent
  en ligne). Export / import JSON toujours disponibles dans Réglages.
- **Configuration** : aucune clé n'est dans le dépôt. En local, copie `.env.example` en `.env.local` (ignoré
  par git) avec l'URL du projet et la clé *publishable*. Pour le déploiement, ces deux valeurs sont des
  secrets GitHub (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Sans elles, l'appli est 100 % locale.
  La clé *publishable* est, par conception, envoyée au navigateur une fois l'appli en ligne : c'est la sécurité
  RLS de la base qui protège les données. La clé *secret* / service_role ne doit jamais être utilisée ici.

### Réglages à faire dans le tableau de bord Supabase (projet `stats-ultimate`)

Authentication → URL Configuration :
- **Site URL** : l'adresse GitHub Pages, ex. `https://<utilisateur>.github.io/<depot>/`
- **Redirect URLs** : ajouter la même adresse et `http://localhost:5173/` (liens de confirmation et de
  réinitialisation du mot de passe).

Le service d'e-mails intégré de Supabase est limité (quelques e-mails par heure) : suffisant pour une équipe ;
au-delà, brancher un SMTP (Authentication → Emails → SMTP Settings).

## Sécurité et informations légales

- Audit, mesures en place et réglages restant à faire : voir [SECURITY.md](SECURITY.md).
- Pages Mentions légales, Confidentialité et Conditions d'utilisation : `#/mentions-legales`,
  `#/confidentialite`, `#/conditions` (accessibles sans compte). Contenu dans `src/ui/views/legal.ts`.
- Base : migrations dans `supabase/migrations/` (RLS, anti-flood, suppression de compte).

## Déploiement sur GitHub Pages

1. Crée un dépôt GitHub et pousse le projet sur la branche `main`.
2. Dépôt → Settings → Pages → Source : **GitHub Actions**, et Settings → Secrets and variables → Actions :
   ajoute les secrets `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Chaque push sur `main` lance `.github/workflows/deploy.yml` : `npm ci`, tests, build, publication de `dist/`.
   L'adresse s'affiche dans l'onglet Actions (`https://<utilisateur>.github.io/<depot>/`).
4. Reporte cette adresse dans Supabase (voir ci-dessus).

## Saisie d'un match (écran « Matchs » → « Nouveau match »)

1. On coche les joueurs présents.
2. À chaque point : on touche les joueurs de la ligne, puis « Lancer le point ».
3. **But = 2 touches** : le passeur, puis le marqueur (« Sans passeur » si besoin).
4. **D / lancer raté / drop = 1 touche** sur les boutons sous le nom du joueur. Le pull s'arme avec le bouton « Pull ».
5. « But adverse » ferme le point. Le bouton ↶ en haut annule la dernière action (jusqu'à 60 niveaux).
6. Après coup : détail du match → « Corriger » sur n'importe quel point (marqueur, passeur, ligne, événements, résultat, suppression).

## Tournois (écran « Tournois »)

Feuilles de match tenues par la table de marque, sans joueurs : seules les équipes comptent.

1. Crée le tournoi : nom, date, équipes engagées et **règles par défaut** (partie en N points, 2 points d’écart
   avec plafond optionnel, temps de jeu, cap +1 / arrêt net / sans limite, nombre et durée des temps morts).
2. « Nouveau match » : équipe A, équipe B, **table de marque**, intitulé / terrain / heure, règles du match (modifiables).
3. Pendant le match : « Lancer le chrono », « + Point » pour chaque équipe, « Temps mort » (compte à rebours,
   quota par équipe). À la fin du temps, l’appli sonne et applique le cap ; elle indique quand le match est gagné.
   ↶ annule la dernière action, « Corriger le chrono » remet le temps à une valeur précise.
4. « Terminer le match » : la feuille devient modifiable (équipe et temps de chaque point, ajout / suppression,
   temps morts, durée, notes) et partageable en texte. Le bilan des équipes se met à jour.
5. **PDF** : « Feuille PDF » sur chaque match (A4 : infos, score, déroulé des points, temps morts, notes,
   cases de signature ; avant le match, feuille vierge à remplir) et « PDF de toutes les feuilles » sur le
   tournoi (récapitulatif + bilan + une feuille par match). Généré dans l’appli, hors-ligne : partage
   natif sur téléphone, téléchargement sur ordinateur.

## Définitions des stats

- **Plus-minus** = buts + passes décisives + défenses − disques perdus (lancers ratés + drops).
- **± Éq.** = points marqués − encaissés par l'équipe pendant que le joueur est sur le terrain.
- **Points tenus** : points commencés en attaque et marqués. **Breaks** : points commencés en défense (pull) et marqués.
- Les stats ne sont jamais stockées : elles sont recalculées depuis les événements, donc corriger un point met tout à jour.

## Organisation du code

```
src/types.ts, schema.ts   modèle de données, validation/migration (import, stockage)
src/store.ts              état + sauvegarde localStorage (modifications atomiques)
src/cloud/…               client Supabase, session (connexion), synchronisation
src/match.ts              règles de saisie d'un match (fonctions pures + erreurs lisibles)
src/tournament.ts         tournois : chrono, score, cap, temps morts, bilan (fonctions pures)
src/pdf.ts, sheetPdf.ts   mini générateur PDF (sans dépendance) et mise en page des feuilles
src/stats.ts              calculs de stats (joueur, équipe, lignes, saisons)
src/exporters.ts          CSV, sauvegarde JSON, résumé de match
src/weather.ts            Open-Meteo + verdict jouable / limite / non jouable
src/sportEasy.ts          import des participants (CSV)
src/ui/…                  écrans (vues), composants, routeur par hash
build/sw-plugin.ts        génère sw.js au build avec la liste des fichiers à mettre en cache
```

## Points d'attention

- **Sans compte, données = ce navigateur.** Pense à « Télécharger la sauvegarde » (Réglages) régulièrement ; l'appli te le rappelle.
- **Import Sport Easy** : format détecté de façon tolérante (Prénom/Nom/Nom complet + colonne de statut), à valider
  sur un vrai export.
- **Météo** : coordonnées de La Chevrolière par défaut (modifiables dans Réglages), créneau 19h–21h par défaut.
