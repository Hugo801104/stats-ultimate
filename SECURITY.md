# Sécurité — Stats Ultimate · Les Plouf

## Signaler une faille

Écris à **hugo.jasmin1104@gmail.com** (objet : « Sécurité Stats Ultimate »), sans publier les détails
avant correction. Réponse sous 7 jours. Merci de ne pas accéder aux données d’autres personnes ni de
surcharger le service pendant tes tests.

---

## Audit de sécurité — 31 octobre 2026

Périmètre : application web (GitHub Pages), base et authentification Supabase (projet `stats-ultimate`,
région Paris), dépôt GitHub et chaîne de déploiement.

### Synthèse

| Domaine | État | Points clés |
|---|---|---|
| Mots de passe et comptes | ✅ Solide, 3 réglages à faire | Hachage bcrypt par Supabase, jamais lisibles ; flux PKCE ; e-mail confirmé |
| Données en base | ✅ Solide | Cloisonnement par compte (RLS), aucun accès anonyme, droits minimaux, anti-flood |
| Application (navigateur) | ✅ Solide | Politique CSP, anti-iframe, aucun HTML injecté, aucun script tiers |
| Disponibilité | ⚠️ Correct | Site statique sur CDN + appli hors-ligne ; limites de l’offre gratuite Supabase |
| Dépôt et déploiement | ✅ Solide, 2 réglages à faire | Aucune clé dans le code, détection de secrets, Dependabot, 0 vulnérabilité |
| RGPD / mentions légales | ✅ Conforme | Mentions, confidentialité, CGU, consentement, export et suppression du compte |

### 1. Mots de passe et comptes

- **Les mots de passe ne sont jamais stockés en clair.** Supabase Auth les hache avec bcrypt
  (vérifié : empreintes `$2a$`) dans le schéma `auth`, qui n’est pas exposé par l’API. Ni l’éditeur ni un
  attaquant ayant une clé publique ne peut les lire.
- Connexion par **PKCE** ; liens e-mail à usage unique ; jetons de session courts, renouvelés automatiquement.
- **Création de compte protégée contre l’énumération** (Supabase ne révèle pas si un e-mail existe).
- Limites de débit natives de Supabase sur la connexion, l’inscription et l’envoi d’e-mails.
- Côté appli : 8 caractères minimum, confirmation du mot de passe, acceptation des CGU.

**À régler dans le tableau de bord Supabase (non modifiable par code) :**
1. Authentication → Policies (Password) : longueur minimale **8** et exiger lettres + chiffres
   (aujourd’hui la règle de 8 caractères n’est appliquée que par l’appli ; le serveur accepte 6).
2. Authentication → Attack Protection : activer un **CAPTCHA** (Cloudflare Turnstile, gratuit) contre la
   création de comptes par des robots — nécessite d’ajouter le widget dans l’écran d’inscription.
3. Protection contre les mots de passe divulgués (HaveIBeenPwned) : réservée à l’offre payante Pro.

### 2. Données en base

- **RLS activé** sur `app_states` : 4 règles, chaque compte ne lit/écrit/supprime que sa propre ligne.
- **Aucun accès anonyme** : droits retirés au rôle `anon` (table et fonctions).
- **Droits minimaux** : `TRUNCATE` (qui ignore RLS), `TRIGGER`, `REFERENCES` retirés.
- **Écritures contrôlées** : `save_app_state` refuse d’écraser une version plus récente (révision) ;
  taille limitée à 5 Mo par compte ; **au plus 1 écriture par seconde** et par compte (HTTP 429).
- **Droit à l’effacement** : `delete_my_account()` supprime uniquement le compte appelant et, en
  cascade, ses données. L’alerte « SECURITY DEFINER exécutable » du conseiller Supabase est attendue.
- Fonctions avec `search_path` vide (protège contre le détournement de schéma).

Tests réalisés (dans des transactions annulées, sans toucher aux vrais comptes) :
isolation entre deux comptes ✅ · lecture/écriture anonymes refusées ✅ · ancienne révision refusée ✅ ·
2e écriture immédiate refusée ✅ · `TRUNCATE` refusé ✅ · suppression limitée au compte appelant ✅.

### 3. Application (navigateur)

- **Politique de sécurité du contenu (CSP)** : seuls les scripts du site s’exécutent ; connexions
  autorisées uniquement vers le site, le projet Supabase et l’API météo. Testé : une requête vers un autre
  domaine est bloquée → un script injecté ne pourrait pas exfiltrer la session.
- **Anti-clickjacking** : l’appli refuse de s’afficher dans une iframe (GitHub Pages ne permet pas
  l’en-tête `frame-ancestors`).
- **Pas d’injection HTML** : tout le texte est inséré via `textContent` ; la seule utilisation
  d’`innerHTML` concerne des icônes statiques du code.
- Fichiers importés (sauvegarde JSON, CSV) validés et nettoyés avant usage.
- Aucun script tiers, aucun CDN, aucune mesure d’audience, aucun cookie. HTTPS imposé.
- La clé Supabase *publishable* est visible dans l’appli en ligne : c’est prévu par Supabase, elle ne
  donne aucun droit sans connexion (RLS). La clé *secret* n’est jamais utilisée.

### 4. Disponibilité (« que le site ne tombe pas »)

- Le site est **statique**, servi par le réseau de diffusion de GitHub (absorbe les pics et les attaques
  par saturation) ; aucun serveur applicatif à faire tomber.
- **Local d’abord** : l’appli fonctionne entièrement hors-ligne et même si Supabase est indisponible ;
  la synchro reprend toute seule.
- Limites de l’offre gratuite Supabase : 500 Mo de base, 50 000 utilisateurs actifs/mois — très
  au-delà des besoins. **Un projet gratuit inactif 7 jours est mis en pause** : il faut alors le
  relancer depuis le tableau de bord (l’appli continue de marcher en local en attendant).
- Pas de sauvegarde téléchargeable de la base sur l’offre gratuite : chaque utilisateur peut exporter
  ses données (Réglages → sauvegarde JSON).

### 5. Dépôt et déploiement

- Aucune clé dans le dépôt (valeurs dans `.env.local` ignoré et dans les secrets GitHub Actions).
- Détection de secrets + blocage à l’envoi (push protection) actifs.
- Alertes et mises à jour de sécurité Dependabot actives ; mises à jour hebdomadaires configurées.
- `npm audit` : **0 vulnérabilité** (outils de développement mis à jour : Vite 8, Vitest 5).
- Le workflow n’a que les droits nécessaires ; il lance les tests avant chaque publication.

**À faire sur GitHub / comptes :**
1. Activer la **double authentification (2FA)** sur les comptes GitHub et Supabase — la mesure la plus
   importante : qui prend ces comptes prend le site et la base.
2. Protéger la branche `main` (interdire suppression et réécriture forcée de l’historique).

### 6. RGPD et obligations légales

- Mentions légales (LCEN), politique de confidentialité (RGPD art. 13) et conditions d’utilisation,
  accessibles sans compte depuis l’écran d’accueil et depuis les Réglages.
- Consentement aux CGU à l’inscription ; mention des moins de 15 ans.
- Droits exerçables dans l’appli : export (portabilité), modification, suppression du compte.
- Aucun cookie ni traceur : pas de bandeau de consentement nécessaire (stockage strictement nécessaire).
- Données hébergées dans l’UE (Paris).
