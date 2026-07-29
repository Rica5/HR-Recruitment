# Solumada Recrutement App — Documentation Technique

Application web de gestion du recrutement avec analyse IA des candidatures via n8n/Claude, servant deux sociétés (Solumada / Optimum) sur un déploiement unique.

---

## Stack Technique

| Couche | Technologie |
|--------|------------|
| Backend | Node.js + Express 4.18 |
| Base de données | MongoDB Atlas (Mongoose 8) |
| Auth | JWT (7 jours) + bcryptjs (salt 12) |
| Upload fichiers | Multer — stockage disque `/uploads/` (ou `UPLOAD_DIR`) |
| Email | API HTTP maison (`https://mailer.solumada.mg/send`, via axios) — **pas** Nodemailer/SMTP malgré la dépendance `nodemailer` toujours présente dans `package.json` (inutilisée) |
| Sécurité HTTP | `helmet` (CSP), `compression`, `cors` (`ALLOWED_ORIGINS`), rate limiting in-memory maison |
| Automatisation IA | n8n Cloud + Claude (5 workflows webhook — voir "Flux Clés") |
| RDV entretiens | Cal.com (API v2) — voir section dédiée |
| Frontend | SPA vanilla JS — zéro framework, zéro bundler, i18n maison (FR/EN) |
| CSS | CSS custom avec variables, deux thèmes liés à la société |
| Tests | Jest + Supertest + mongodb-memory-server (`tests/app.test.js`) |

Démarrage : `npm run dev` (nodemon) ou `npm start`. Tests : `npm test`.

---

## Multi-tenant (`company`)

L'app sert **deux sociétés** sur la même base MongoDB et le même déploiement — pas de DB/schéma séparé, isolation par simple champ discriminant `company: 'solumada' | 'optimum'` (enum défini dans `constants.js`) filtré manuellement dans chaque route.

### Comment le tenant est attribué

- **User** ([models/User.js](models/User.js)) : `company` obligatoire à la création. Un hook pre-save synchronise le thème dessus (`if (this.isModified("company")) this.theme = this.company`) — le thème part donc aligné sur la société, mais peut diverger ensuite via `PATCH /api/auth/theme` (rien ne les re-synchronise après coup).
- **JWT** ([middleware/auth.js](middleware/auth.js)) : le token embarque `company` à la connexion → chaque requête authentifiée porte son tenant via `req.user.company`, sans revalidation en base.
- **Offre** ([routes/offres.js](routes/offres.js)) : `data.company = req.user.company` à la création — jamais fourni par le client, toujours déduit de l'admin connecté. Le PATCH supprime explicitement `company` du body → champ immuable après création.
- **Candidature** : `company` copié depuis `offre.company` à la création, qu'elle vienne d'une saisie manuelle ou du formulaire public — le candidat hérite de la société de l'offre postulée.

### Comment l'isolation est appliquée

Pas de plugin Mongoose global ni de middleware automatique : **chaque route filtre manuellement** avec `{ company: req.user.company }` (stats dashboard, comptages/agrégations offres et candidatures, enrichissement des bookings Cal.com qui exclut les candidatures d'une autre société). C'est une isolation "par discipline du code" — toute nouvelle route de liste/agrégation doit penser à ajouter ce filtre, sinon elle peut exposer les données de l'autre tenant.

Note : `GET /api/offres` et `GET /api/candidatures` (listes/détails) **ne filtrent volontairement pas** par `company` — ces vues restent cross-company par choix. Seuls les endpoints de stats/agrégation (`stats/summary`, `stats/madagascar`) et l'enrichissement des bookings Cal.com appliquent le filtre `company`.

### Exception : `/api/users`

`GET /api/users` liste **tous les utilisateurs, toutes sociétés confondues** (cross-company, pour la gestion admin) — un admin peut voir/gérer les comptes de l'autre société. `POST /api/users` permet de choisir explicitement la `company` du nouveau compte, sinon elle reprend celle du créateur. C'est le seul point du système qui n'est pas cloisonné par tenant.

### Répercussions au-delà des données

- **Règle métier** : une offre ne peut passer au statut `Active` sans `lien_rdv` renseigné, ni sans `approbation_inspection.approuvee` **sauf pour `optimum`** ([routes/offres.js](routes/offres.js)) — contrainte réglementaire propre à une des deux entités.
- **Langue** : la langue de l'UI (`LANG`, `public/js/i18n.js`) est dérivée de `company` — `optimum` → anglais, `solumada` → français. Pas de sélecteur de langue indépendant.
- **Thème visuel** : le sélecteur de thème dans la topbar est actuellement masqué (`display:none`, `public/app.html`) — le thème suit `company` via `COMPANY_CONFIG` plutôt que d'être un choix libre de l'utilisateur.

---

## Structure des Fichiers

```
├── server.js                  # Point d'entrée — Express, MongoDB, routes, crons, sécurité
├── constants.js                # Enums partagés (COMPANIES, statuts, canaux, contrats, recommandations)
├── .env                        # Variables d'environnement (voir section dédiée)
├── middleware/
│   ├── auth.js                 # verifyToken(JWT) + signToken()
│   ├── callbackAuth.js         # verifyCallbackSecret — auth des callbacks n8n → app
│   ├── i18n.js                 # be(req, fr, en) — réponse bilingue selon header X-Lang
│   ├── rateLimiter.js          # Rate limiter in-memory (IP-based)
│   └── upload.js               # Config Multer partagée (disque, PDF/DOC/DOCX, 10 MB max)
├── models/
│   ├── User.js                 # Admin — company, theme, reset password
│   ├── Offre.js                # Offre d'emploi — company, Cal.com, approbation inspection
│   ├── Candidature.js          # Candidature + champs analyse IA + RDV
│   └── AuditLog.js             # Journal d'audit (action, entity, user, details)
├── routes/
│   ├── auth.js                 # /api/auth — login, setup, profil, thème, reset password
│   ├── offres.js               # /api/offres — CRUD offres + stats + évaluation batch (WF4)
│   ├── candidatures.js         # /api/candidatures — CRUD + emails + workflow + RDV Cal.com
│   ├── public.js                # /api/public — formulaire public + callbacks n8n (WF2/WF4/WF5/RDV)
│   ├── calcom.js                # /api/calcom — event types, plannings, bookings (API Cal.com v2)
│   ├── n8n.js                   # /api/n8n — statut workflow WF2, config, liens
│   ├── audit.js                 # /api/audit — historique paginé/filtrable
│   └── users.js                 # /api/users — gestion admins (cross-company)
├── services/
│   ├── email.js                 # Envoi emails via API HTTP maison — tous les templates
│   ├── n8n.js                   # Déclenchement des 5 webhooks n8n + retry exponentiel
│   └── audit.js                 # logAudit() — écriture fire-and-forget dans AuditLog
├── utils/
│   └── text.js                  # escapeRegex, parseEmailList, isValidEmail
├── public/
│   ├── app.html                 # Shell SPA (sidebar + topbar + router JS, PAGES{})
│   ├── login.html               # Page de connexion
│   ├── postuler.html            # Formulaire public candidature (standalone)
│   ├── css/style.css            # Tout le CSS — design system + responsive
│   └── js/
│       ├── i18n.js              # LANG (dérivé de company) + dictionnaire TRANSLATIONS + t()
│       ├── utils.js              # Auth, api, toast, badges, dates, tabs, upload zone
│       └── pages/
│           ├── dashboard.js      # Stats + grilles récentes
│           ├── offres.js         # Liste + modals création/édition offres
│           ├── candidatures.js   # Liste + fiche candidature + actions
│           ├── rendezvous.js     # Page "RDV" — entretiens à venir lus en direct depuis Cal.com
│           ├── calcom.js         # Admin Cal.com — types d'événements + plannings de dispo
│           ├── audit.js          # Historique des actions (AuditLog)
│           ├── users.js          # Gestion des comptes admin (cross-company)
│           ├── batch-cv.js       # Import CVs en masse (WF5) + suivi de progression
│           └── settings.js       # Profil utilisateur
└── uploads/                     # CVs et lettres uploadés (non versionné)
```

> `public/js/pages/n8n.js` existe toujours sur disque mais **n'est plus chargé** dans `app.html` et n'a pas d'entrée dans `PAGES` — fichier mort, à supprimer ou à réintégrer si la page doit revenir.

---

## Frontend — Architecture SPA

### Fonctionnement global

`app.html` est le shell unique. Tout le contenu est injecté dans `#page-content` par JS.

```
app.html
  └── <div id="page-content">   ← renderXxx() injecte ici
  └── <script>
        navigate(page)          ← router client
        PAGES = { dashboard, offres, candidatures, rendezvous, audit, users, settings, 'batch-cv', calcom }
```

Chaque `navigate(page)` :
1. Appelle `closeSidebar()` (mobile)
2. Met à jour `topbar-title`, `topbar-sub`, `topbar-actions`
3. Appelle `PAGES[page].render()` qui injecte le HTML

### i18n (public/js/i18n.js)

```javascript
LANG            // 'fr' | 'en' — dérivé de user.company ('optimum'→'en') ou du thème pré-login
t('cle')        // → traduction FR/EN depuis TRANSLATIONS[LANG]
tf('cle', n)    // variante avec interpolation (pluriels, etc.)
```

Chargé **avant** `utils.js` dans `app.html` — tout le texte de l'UI passe par `t()`, pas de chaînes hardcodées dans les pages.

### Utils disponibles partout (utils.js)

```javascript
Auth.user()             // → { nom, email, role, theme, company }
Auth.token()            // → JWT string
api.get/post/patch/delete(url, data?)   // fetch avec Bearer token
toast(msg, type, duration?)  // type: 'success' | 'error' | 'info'
withLoading(btn, asyncFn)    // désactive le bouton + spinner pendant l'appel async
renderBadge(reco)       // QUALIFIE | A_REVOIR | NON_SELECTIONNE → badge HTML
renderScoreBar(score)   // score 0-10 → barre de progression HTML
renderScorePill(score)  // variante compacte en pastille
offerStatusBadge(s)     // Active | Fermée | En pause → badge HTML
formatDate(d)           // → "12 jan. 2025"
formatDatetime(d)       // → "12 jan. 2025, 14:30"
timeAgo(d)              // → "il y a 3h"
initials(name)          // "Jean Dupont" → "JD"
fileUrl(path)           // /api/uploads/xxx?token=... (téléchargement protégé)
initTabs()              // Active le système de tabs (.tab-btn / .tab-panel)
initUploadZone(zoneId, inputId)  // drag & drop de fichier
debounce(fn, wait?)
emailListIncludes(field, email)  // teste un email dans une liste "a@x.com, b@x.com"
channelBadge(channel)   // plateforme | telephone | physique | email → badge HTML
requireAuth()           // redirige vers /login si non authentifié
```

### Thèmes

Deux thèmes via `data-theme` sur `<html>`, dérivés de `company` :
- `solumada` — vert (`--accent: #3E9143`)
- `optimum` — bleu (`--accent: #62A5D2`)

`applyTheme(theme)` / `switchTheme(theme)` (utils.js) + sauvegarde en DB via `api.patch('/api/auth/theme', { theme })`. Le sélecteur manuel de thème dans la topbar est actuellement masqué (voir section Multi-tenant).

---

## CSS — Design System

**Fichier unique :** `public/css/style.css`

### Variables CSS principales

```css
/* Couleurs accent (changent selon le thème — voir data-theme) */
--accent, --accent-dark, --accent-light, --accent-mid, --accent-text
--accent-glow, --accent-soft
--grad-start, --grad-end, --grad-mid   /* pour les dégradés */

/* Neutres (fixes) */
--bg: #f0f4f8           /* fond de page */
--surface: #ffffff      /* fond des cards */
--surface-2: #f7f9fc    /* fond secondaire */
--surface-3: #eef2f7    /* fond tertiaire */
--border: #e2e8f0
--border-soft: #eff3f8
--text, --text-2, --text-3

/* Sidebar sombre (fixe, indépendante des thèmes accent) */
--sb-bg, --sb-surface, --sb-border, --sb-text, --sb-text-dim, --sb-hover

/* Layout */
--sidebar-w: 260px

/* Effets */
--shadow-xs, --shadow-sm, --shadow, --shadow-lg, --shadow-dark, --shadow-accent
--transition: .18s cubic-bezier(.4,0,.2,1)
--spring: .38s cubic-bezier(.34,1.56,.64,1)

/* Typographie */
--font: 'Plus Jakarta Sans'
--mono: 'JetBrains Mono'

/* Radius */
--r: 10px   --r-lg: 14px   --r-xl: 18px   --r-2xl: 24px
```

### Classes composants clés

| Classe | Usage |
|--------|-------|
| `.btn .btn-primary/secondary/ghost/danger` | Boutons |
| `.btn-sm / .btn-lg` | Tailles boutons |
| `.btn-icon` | Bouton carré icône |
| `.card .card-header .card-body .card-title` | Cartes |
| `.stats-grid` | Grille 4 colonnes stat cards |
| `.stat-card .stat-top .stat-value .stat-label` | Stat card |
| `.form-group .form-label .form-control` | Formulaire |
| `.form-grid` | Grille 2 colonnes formulaire |
| `.upload-zone` | Zone drag & drop |
| `.filters-bar .filter-input .filter-select` | Barre filtres |
| `.tabs .tab-btn .tab-panel` | Système d'onglets (pill style) |
| `.badge .badge-green/amber/red/blue/gray/accent/purple` | Badges |
| `.score-wrap .score-bar .score-fill .score-num` | Barre score |
| `.avatar` | Avatar initiales circulaire |
| `.offre-card` | Carte offre d'emploi |
| `.workflow-card` | Carte workflow n8n |
| `.table-wrap` | Wrapper table scrollable |
| `.empty-state` | État vide centré |
| `.spinner` | Spinner de chargement |
| `.toast-container .toast` | Notifications (créées via JS) |
| `.dashboard-2col` | Grille 2 colonnes dashboard |
| `.sidebar-toggle` | Bouton hamburger (mobile) |
| `.sidebar-overlay` | Overlay sidebar (mobile) |
| `.detail-hero` | Bandeau héro dégradé |
| `.skill-tag` | Tag compétence |

### Breakpoints responsive

| Breakpoint | Cible |
|-----------|-------|
| `≤ 1280px` | Petits laptops — padding réduit |
| `≤ 1024px` | Laptops basse résolution — sidebar 210px, stats 2 col |
| `≤ 900px` | Ajustements grilles intermédiaires |
| `≤ 768px` | Tablettes — sidebar cachée + hamburger, grilles 1 col |
| `481–768px` | Plage tablette dédiée (media query `min-width`/`max-width` combinés) |
| `≤ 640px` | Ajustements composants (cards, formulaires) |
| `≤ 540px` | Ajustements fins mobile |
| `≤ 480px` | Mobile — stats 1 col, sous-titre masqué, toast plein écran |

`@media (prefers-reduced-motion: reduce)` désactive aussi les animations/transitions.

---

## API — Référence complète

### Auth (`/api/auth`) — sans JWT sauf mention

```
POST   /api/auth/login          { email, password }        → { token, user }  (rate limit 10/15min)
POST   /api/auth/setup          { nom, email, password, company }  → { token, user }  (1 seul admin, company requis)
GET    /api/auth/me             [JWT]                       → { user }
PATCH  /api/auth/theme          [JWT] { theme }             → { user, token }
PATCH  /api/auth/me             [JWT] { nom?, password? }   → { user, token }
POST   /api/auth/forgot-password  { email }                 → { success }  (toujours 200, ne révèle pas l'existence du compte)
POST   /api/auth/reset-password   { token, password }       → { success }
```

### Offres (`/api/offres`) — JWT requis

```
GET    /api/offres                    ?statut=&q=            → { offres[] }
GET    /api/offres/stats/summary      → { stats: { totalOffers, activeOffers, totalApplications, qualified, toReview, rejected } }
GET    /api/offres/stats/madagascar   → { stats: { offres:{...}, candidatures:{...}, canaux:[...] } }  (stats conformité process RH)
POST   /api/offres                    { ...offre }           → { offre, lien_candidature }
                                       company déduit de req.user.company ; statut='Active' exige lien_rdv
                                       + (sauf company='optimum') approbation_inspection.approuvee
GET    /api/offres/:id                                       → { offre }
GET    /api/offres/:id/candidatures                           → { candidatures[] }  (max 500, triées par score)
PATCH  /api/offres/:id                { ...champs }           → { offre }  (company non modifiable ; mêmes règles d'activation)
DELETE /api/offres/:id                                        → { success }  (supprime aussi les candidatures liées)
POST   /api/offres/:id/evaluer-candidats  { nb_top }          → { success, nb_candidats, nb_top }
                                                               Déclenche WF4 (évaluation batch comparative via Claude)
```

### Candidatures (`/api/candidatures`) — JWT requis

```
GET    /api/candidatures                    ?page=1&limit=50&offre_id=&recommandation=&a_appeler=&q=&score_min=&score_max=
                                            → { candidatures[], total, page, pages }
GET    /api/candidatures/calcom/slots       ?offre_id=XXX[&date=YYYY-MM-DD|&days=N]
                                            → { dates: { "2025-05-12":[{time}], … } } (ou { slots:[] } si &date)
                                            Résout username+slug depuis offre.lien_rdv, interroge l'API Cal.com v2
GET    /api/candidatures/batch-status       ?ids=id1,id2,…   → { candidatures[] }  (polling progression batch CV/évaluation)
GET    /api/candidatures/:id                → { candidature }
POST   /api/candidatures                    { offre_id, candidat_nom, ... } multipart  → { candidature }
PATCH  /api/candidatures/:id                { champs whitelistés ADMIN_EDITABLE }       → { candidature }
DELETE /api/candidatures/:id                → { success }  (supprime aussi CV/lettre sur disque)
POST   /api/candidatures/:id/upload-cv      multipart { cv }  → { success, cv_path, cv_filename }
POST   /api/candidatures/:id/convoquer-test → { candidature }  (statut → "Test convoqué")
POST   /api/candidatures/:id/envoyer-emails-qualification   → { success }
POST   /api/candidatures/:id/envoyer-email-refus            → { success }
POST   /api/candidatures/:id/rdv-manuel     { date, heure, lieu, note }
                                            → { candidature }  (saisie manuelle, aucun appel Cal.com)
POST   /api/candidatures/:id/planifier-rdv  { date, heure, lieu, note, slot_iso, type_rdv }
                                            → { success, calcom_booking_uid }
                                            Crée le booking dans Cal.com (best-effort) puis met à jour la DB
                                            (rdv_pris, rdv_manuel, statut) même si l'appel Cal.com échoue
POST   /api/candidatures/:id/relancer-workflow              → { success }  (reset score/analyse + re-déclenche WF2)
```

**Champs PATCH whitelistés (`ADMIN_EDITABLE`, [routes/candidatures.js](routes/candidatures.js)) :** `statut, recommandation, candidat_nom, candidat_email, candidat_telephone, email_recruteur, score, resume_analyse, adequation_poste, competences_detectees, competences_manquantes, experience_annees, niveau_education, points_forts, points_faibles, titre_poste, canal_candidature, a_email, a_appeler, rdv_pris, non_interesse, candidat_potentiel, email_invitation_envoye_le, relance_1_envoyee_le, relance_2_envoyee_le, commentaire, batch_justification`

### Public (`/api/public`) — Sans auth

```
GET    /api/public/offre/:offre_id            → { offre }  (uniquement si statut=Active ; champs sensibles exclus)
POST   /api/public/candidature                multipart/form-data:
                                               offre_id, candidat_nom, candidat_email,
                                               candidat_telephone?, cv (file), lettre? (file)
                                             Rate limit: 5 requêtes / 10 min par IP
                                             → { success, candidature, formule_remerciement }
PATCH  /api/public/candidature/:id/analyse           Header: X-Callback-Secret
                                                     { score, recommandation, resume_analyse, ... }
                                                     → { success }  (callback n8n WF2 — analyse IA individuelle)
PATCH  /api/public/candidature/:id/rdv-confirme      Header: X-Callback-Secret
                                                     { date, heure, lieu }
                                                     → { success }  (callback n8n quand le candidat a réservé sur Cal.com)
PATCH  /api/public/candidature/:id/no-rdv            Header: X-Callback-Secret
                                                     → { success }  (callback n8n — aucune réservation après relances)
POST   /api/public/offre/:offre_id/top-candidats     Header: X-Callback-Secret
                                                     { top_candidats:[{id,score_final?,justification?}], tous_candidats?:[{id,score_final}] }
                                                     → { success, updated }  (callback n8n WF4 — évaluation batch)
POST   /api/public/batch-cv/callback                 Header: X-Callback-Secret
                                                     { candidature_id, candidat_nom, candidat_email, candidat_telephone }
                                                     → { success }  (callback n8n WF5 — extraction CV batch)
```

Tous les callbacks protégés par `X-Callback-Secret` passent par `middleware/callbackAuth.js` (`verifyCallbackSecret`) — **fail-closed** : si `N8N_CALLBACK_SECRET` n'est pas configuré côté serveur, tous les callbacks sont rejetés (503), jamais acceptés par défaut.

### Cal.com (`/api/calcom`) — JWT requis

API applicative qui wrappe `https://api.cal.com/v2` (auth `Bearer CALCOM_API_KEY`) :

```
GET    /api/calcom/event-types                      → { eventTypes[] }  (avec bookingUrl calculée + locations/locationType/locationLabel)
POST   /api/calcom/event-types      { title, lengthInMinutes, description?, scheduleId?, locationType?, locationValue? }
                                                      → { eventType }
                                                      locationType: 'teams'|'calvideo'|'address'|'link' — défaut 'teams' si omis
                                                      (Microsoft Teams remplace Cal Video comme défaut de l'app, pas de Cal.com)
                                                      locationValue: requis pour 'address'/'link' (adresse ou URL)
PATCH  /api/calcom/event-types/:id  { title?, lengthInMinutes?, description?, scheduleId?, locationType?, locationValue? }
                                                      → { eventType }
                                                      Permet de changer la location d'un event type existant (ex: migrer
                                                      un event type créé avant l'ajout de Teams). Pas de bouton dédié dans
                                                      l'UI actuellement — endpoint disponible pour usage direct/futur.
DELETE /api/calcom/event-types/:id                   → { success }
GET    /api/calcom/schedules                         → { schedules[] }  (disponibilités + dateOverrides)
POST   /api/calcom/schedules        { name, timeZone, availability?, dateOverrides? }
                                                      → { schedule }
PATCH  /api/calcom/schedules/:id    { name?, timeZone?, availability?, dateOverrides? }
                                                      → { schedule }
DELETE /api/calcom/schedules/:id                     → { success }
GET    /api/calcom/bookings         ?status=upcoming&take=100
                                                      → { bookings[] }  enrichis avec la candidature liée
                                                      (par metadata.candidature_id ou par email), filtrés par company
POST   /api/calcom/bookings/:uid/cancel      { reason?, candidature_id? }      → { success }
POST   /api/calcom/bookings/:uid/reschedule  { start, reason?, candidature_id? } → { success, booking }
```

Le format Cal.com diffère du format frontend sur deux points normalisés dans `routes/calcom.js` :
- jours de récurrence : noms de jours anglais (`"Monday"`) côté Cal.com ↔ index numérique `0-6` (Dim-Sam) côté frontend
- exceptions de dates : format plat `overrides:[{date,startTime,endTime}]` côté Cal.com ↔ format imbriqué `dateOverrides:[{date,availability:[...]}]` côté frontend

**Location (visio) des event types** — schéma API v2 confirmé (`routes/calcom.js`, helpers `buildLocation()`/`locationSummary()`) :
```
{ type: 'integration', integration: 'office365-video' }  // Microsoft Teams — défaut de l'app
{ type: 'integration', integration: 'cal-video' }         // Cal Video — défaut natif de Cal.com
{ type: 'address', address: '...', public: true }
{ type: 'link', link: '...', public: true }
```
L'app Teams doit déjà être installée/connectée dans le compte Cal.com — assigner cette intégration comme location ne l'installe pas (contrainte de l'API Cal.com).

### n8n (`/api/n8n`) — JWT requis

```
GET    /api/n8n/workflows              → { workflows: [{ key:'wf2', id, name, active }] }
GET    /api/n8n/executions/:wfId       → { executions[] }
POST   /api/n8n/trigger/wf2            → { success, status }
GET    /api/n8n/config                 → { n8n_base_url, wf2_id, wf1_id }
GET    /api/n8n/links                  → { links: { dashboard, wf2 } }
```

### Audit (`/api/audit`) — JWT requis

```
GET    /api/audit    ?page=1&limit=50&action=&entity_type=&q=   → { logs[], total, page, pages }
```

### Users (`/api/users`) — JWT requis, cross-company (voir section Multi-tenant)

```
GET    /api/users                          → { users[] }  (toutes sociétés, triés par company)
POST   /api/users        { nom, email, password, company? }   → { user }  (envoie les identifiants par email)
PATCH  /api/users/:id     { nom?, email?, password?, company? } → { user }
PATCH  /api/users/:id/toggle-actif          → { user }  (impossible de se désactiver soi-même)
```

### Fichiers protégés

```
GET    /api/uploads/:filename?token=JWT    → fichier binaire (CV / lettre), path traversal bloqué
```

### Autres routes

```
GET    /health       → statut app + MongoDB (pour monitoring/load balancer)
GET    /readiness    → 200 si MongoDB connecté, 503 sinon
```

---

## Modèles MongoDB

Les enums (`COMPANIES`, `RECOMMANDATIONS`, `CANDIDATURE_STATUTS`, `OFFRE_STATUTS`, `CANAUX`, `CONTRATS`) sont centralisés dans **`constants.js`** — source de vérité unique, ne pas dupliquer les valeurs ailleurs.

### User

```javascript
{ nom, email (unique), password (hashed, bcrypt 12), role: 'admin',
  company: 'solumada'|'optimum',   // tenant — voir section "Multi-tenant"
  theme: 'solumada'|'optimum', avatar, lastLogin, actif: Boolean,
  resetToken, resetTokenExpiry }   // reset de mot de passe
```

### Offre

```javascript
{ offre_id (unique, string), titre_poste,
  missions_principales,   // requis — descriptif du poste
  profil_souhaite,        // optionnel
  competences_requises, annees_experience, langues_requises,
  exigences_ia,           // guide le scoring Claude dans n8n
  type_contrat,           // CDI|CDD|Stage|Freelance|Alternance (CONTRATS)
  localisation, salaire, email_recruteur,  // String — un ou plusieurs emails séparés par des virgules
  date_butoire,           // null = pas de limite ; si dépassée → offre fermée auto (cron horaire)
  date_parution_prevue, date_limite_selection,
  test_requis: Boolean,   // si true : automatisation_active forcée à false (qualification manuelle)
  test_date, test_heure, test_lieu,
  lien_rdv,               // lien Cal.com — format https://cal.com/username/event-slug
                          // requis pour passer une offre en statut 'Active'
  lien_calendar,          // ⚠️ déprécié — ancien lien Google Calendar, gardé en fallback
                          // (offre?.lien_rdv || offre?.lien_calendar) tant que d'anciennes offres l'utilisent
  automatisation_active: Boolean,  // false si test_requis ; sinon pilote scenario A/B du callback WF2
  formule_remerciement,   // texte affiché au candidat après soumission
  approbation_inspection: { approuvee: Boolean, date_approbation, commentaire },
                          // requis pour activer une offre, sauf company='optimum'
  company: 'solumada'|'optimum',  // tenant — déduit de req.user.company à la création, immuable ensuite
  statut: 'Active'|'Fermée'|'En pause' (OFFRE_STATUTS),  // défaut 'En pause'
  date_creation }
```

### Candidature

```javascript
{ offre_id, titre_poste, email_recruteur,  // copié de l'offre — un ou plusieurs emails séparés par des virgules
  company: 'solumada'|'optimum',  // copié de offre.company à la création
  candidat_nom, candidat_email, candidat_telephone,
  canal_candidature: 'plateforme'|'telephone'|'physique'|'email' (CANAUX),
  a_email: Boolean, a_appeler: Boolean,  // dérivés de la présence d'un email à la création
  cv_filename, cv_path,
  lettre_filename, lettre_path,

  // Remplis par n8n après analyse IA (WF2) ou évaluation batch (WF4)
  score: Number (0–10),
  recommandation: 'QUALIFIE'|'A_REVOIR'|'NON_SELECTIONNE'|'' (RECOMMANDATIONS),
  resume_analyse, adequation_poste,
  competences_detectees, competences_manquantes,
  experience_annees, niveau_education,
  points_forts, points_faibles,
  batch_justification,    // justification de sélection lors d'une évaluation batch (WF4)

  // Suivi qualification / relances
  email_invitation_envoye_le, relance_1_envoyee_le, relance_2_envoyee_le,  // Date — pilotent le cron de relances
  non_interesse: Boolean,
  candidat_potentiel: Boolean,
  commentaire,

  // Rendez-vous d'entretien (Cal.com)
  rdv_pris: Boolean,
  rdv_manuel: { date, heure, lieu, note, type_rdv: ''|'visio'|'presentiel' },
                          // rempli par /rdv-manuel, /planifier-rdv ou le callback n8n /rdv-confirme
                          // (le uid du booking Cal.com n'est PAS stocké ici, seulement journalisé dans l'audit log)

  statut: 'Nouveau'|'En cours'|'Entretien planifié'|'Test convoqué'|'Test passé'|'Accepté'|'Refusé'|'Pas intéressé'
         (CANDIDATURE_STATUTS),
  date_candidature }
```

### AuditLog

```javascript
{ action,        // ex: OFFRE_CREEE, CANDIDATURE_RECUE, STATUT_CHANGE, RDV_PLANIFIE, USER_LOGIN, WF_ECHEC, ...
  entity_type,    // 'offre' | 'candidature' | 'user'
  entity_id, entity_label,
  user_email,     // email de l'admin, ou 'n8n'/'public'/'system' pour les actions automatiques
  details: Mixed, // objet libre (contexte de l'action)
  created_at }
```

Écrit via `logAudit()` (`services/audit.js`) — fire-and-forget, une erreur d'écriture n'interrompt jamais la requête HTTP en cours.

---

## Variables d'Environnement (.env)

```bash
NODE_ENV=                  # 'production' active les vérifications strictes au démarrage
PORT=3000
MONGODB_URI=               # URI MongoDB Atlas
JWT_SECRET=                # Clé secrète JWT (longue, aléatoire) — requis en prod
BASE_URL=                  # URL publique de l'app (ex: https://xxx.ngrok-free.app) — requis en prod
ALLOWED_ORIGINS=           # CORS — liste d'origines séparées par des virgules (sinon = BASE_URL)
UPLOAD_DIR=                # Chemin absolu de stockage des CVs (sinon ./uploads)
PM2_INSTANCE_ID=           # Géré par PM2 — les crons ne tournent que sur l'instance 0

# n8n (5 webhooks distincts)
N8N_BASE_URL=              # https://xxx.app.n8n.cloud
N8N_API_KEY=               # Clé API n8n
N8N_WF1_ID=                # ID workflow WF1 (référence, non utilisé pour un trigger direct ici)
N8N_WF2_ID=                # ID du workflow WF2 (analyse IA)
N8N_WEBHOOK_URL=           # Webhook WF2 — soumission publique (candidature-reception)
N8N_WF2_WEBHOOK_URL=       # Webhook WF2 — saisie manuelle (candidature-app)
N8N_QUALIF_WEBHOOK_URL=    # Webhook qualification (candidature-mailing / RDV Cal.com)
N8N_BATCH_WEBHOOK_URL=     # Webhook WF4 — évaluation batch comparative
N8N_BATCH_CV_WEBHOOK_URL=  # Webhook WF5 — extraction CV batch
N8N_CALLBACK_SECRET=       # Secret partagé app ↔ n8n pour tous les callbacks — requis en prod
N8N_MAX_RETRIES=3
N8N_RETRY_DELAY=4000

# Cal.com
CALCOM_API_KEY=            # Clé API Cal.com (cal_live_...) — Bearer sur api.cal.com/v2 et v1
```

> Pas de `EMAIL_SERVICE`/`EMAIL_USER`/`EMAIL_PASS` : l'envoi d'email passe par une API HTTP maison dont l'URL est hardcodée dans `services/email.js` (`EMAIL_API_URL`), pas par SMTP.

---

## Flux Clés

### Soumission d'une candidature (public)

```
/postuler?offre_id=XXX
  → POST /api/public/candidature (multipart)
  → Vérif offre Active + rate limit + déduplication (email+offre_id) + vérif deadline
  → Fichiers sauvés dans /uploads/ ; company/titre_poste/email_recruteur copiés de l'offre
  → Candidature créée en DB (statut: Nouveau, score: null, canal_candidature: 'plateforme')
  → services/n8n.js → webhook WF2 (payload JSON + CV/lettre en base64)
  → n8n analyse avec Claude → callback PATCH /api/public/candidature/:id/analyse
  → Candidature mise à jour (score, recommandation, analyse...)
     Scénario A (automatisation_active && !test_requis) : statut dérive de la recommandation IA
     Scénario B/C (test_requis ou manuel) : statut reste 'En cours', le recruteur décide
```

### Qualification manuelle (admin)

```
POST /api/candidatures/:id/envoyer-emails-qualification
  → Déclenche le webhook n8n de qualification (email invitation + email recruteur)
  → Si offre.test_requis = false : email d'invitation entretien automatique
  → Si offre.test_requis = true  : recruteur convoque un test (POST /:id/convoquer-test),
                                    puis qualifie manuellement après résultat du test
  → email_invitation_envoye_le horodaté → alimente le cron de relances
```

### Prise de rendez-vous (Cal.com) — automatisée via n8n

Workflow n8n **"HR Recruitment Rendez Vous Email"** (webhook qualification, déclenché à l'invitation) :

```
App → webhook n8n { candidat_email, titre_poste, lien_rdv, email_recruteur, candidature_id, callback_secret, ... }
  → Email au candidat avec le lien Cal.com (offre.lien_rdv + ?guests=email_recruteur pour l'invite calendrier)
  → Attente → GET https://api.cal.com/v2/bookings?attendeeEmail=...&status=ACCEPTED (vérifie la réservation)
  → Si pas de réservation : relance 1 → attente → re-check
  → Si toujours rien : relance 2 (dernier avertissement) → attente → check final
      → Si trouvé  : callback PATCH /api/public/candidature/:id/rdv-confirme (date/heure/lieu extraits du booking)
      → Si absent  : email d'alerte au recruteur (+ éventuel callback /no-rdv)
```

Ce polling Cal.com se fait uniquement côté n8n — le booking peut aussi être créé directement par l'app
(`POST /api/candidatures/:id/planifier-rdv`) quand un recruteur planifie manuellement un entretien.

> Le workflow est exporté dans `n8n workflow (mis à jour)/HR Recruitment Rendez Vous Email.json`
> (version à jour — l'ancien dossier `n8n workflow/` peut être obsolète). Les délais "Wait 48h/24h"
> y sont actuellement réglés sur 1 minute dans le JSON exporté : à vérifier côté n8n Cloud avant de
> s'y fier comme documentation des délais réels en production.

En complément, un **cron applicatif** (`server.js`, `sendInterviewReminders`, toutes les heures) envoie ses propres relances par email (J+2 après invitation sans RDV, J+4 après la relance 1) indépendamment du polling Cal.com côté n8n — deux mécanismes de relance coexistent, à garder synchronisés si l'un des deux est modifié.

### Évaluation batch de candidats (WF4)

```
POST /api/offres/:id/evaluer-candidats { nb_top }
  → Réinitialise les anciennes justifications de sélection batch
  → services/n8n.js → triggerBatchEvaluation() : envoie tous les candidats déjà analysés individuellement
  → n8n (Claude) classe et sélectionne les nb_top meilleurs, en tenant compte du contexte global de l'offre
  → callback POST /api/public/offre/:offre_id/top-candidats
     → met à jour score_final pour tous les candidats évalués
     → passe les nb_top sélectionnés en recommandation='QUALIFIE' + batch_justification
```

### Extraction CV en masse (WF5)

```
Page "Import CVs" (batch-cv.js) → upload de plusieurs CVs
  → services/n8n.js → triggerBatchCVExtraction() par CV (fire-and-forget)
  → n8n (Claude) extrait nom/email/téléphone du CV
  → callback POST /api/public/batch-cv/callback → met à jour la candidature placeholder créée par l'app
  → GET /api/candidatures/batch-status?ids=... : polling front pour suivre la progression
```

### Fermeture automatique des offres

```
Cron horaire (server.js, isMainInstance seulement — évite les doublons en cluster PM2)
  → Offres avec date_butoire < now ET statut = 'Active'
  → Passage automatique à statut = 'Fermée'
```

---

## Middleware Auth

```javascript
// Protège une route :
router.get('/route', verifyToken, handler)

// Crée un token :
signToken(user)  // → JWT string, expire dans 7j
                 // Payload : { id, email, nom, role, theme, company }

// Dans une route protégée :
req.user  // → { id, email, nom, role, theme, company }
          // req.user.company = tenant courant — voir section "Multi-tenant"
```

Callbacks n8n → app : `verifyCallbackSecret` (`middleware/callbackAuth.js`), compare le header `X-Callback-Secret` à `N8N_CALLBACK_SECRET` — fail-closed si le secret serveur n'est pas configuré.

---

## Conventions de Code

### Backend
- Réponses JSON : `{ success: true, data }` ou `{ success: false, error: 'message' }`
- Erreurs HTTP : 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 409 (conflit), 410 (deadline dépassée), 429 (rate limit), 502 (webhook externe indisponible), 500 (server)
- Pas de middleware de validation externe — validation manuelle dans les routes
- Messages d'erreur bilingues via `be(req, texteFr, texteEn)` (`middleware/i18n.js`), sélection par header `X-Lang`
- Enums toujours importés depuis `constants.js` — ne pas redéfinir de listes de valeurs en dur dans une route/modèle

### Frontend
- Chaque page JS expose une fonction `renderXxx()` globale appelée par le router
- Tout texte affiché passe par `t('cle')` / `tf('cle', n)` (i18n.js) — pas de chaîne hardcodée FR ou EN
- Les modals sont injectés dans le DOM via `innerHTML` avec l'HTML complet
- Pas de state manager — données relues depuis l'API à chaque navigation
- Inline styles tolérés dans les templates HTML des pages JS
- `onclick="fn()"` directement dans le HTML généré (pas d'addEventListener) — la CSP (`scriptSrcAttr: 'unsafe-inline'`) l'autorise explicitement

### CSS
- Toujours utiliser les variables CSS (`var(--accent)`, etc.) — jamais de couleurs hardcodées
- Ajouter les styles responsive à la fin de `style.css` dans les blocs `@media` existants
- Les styles spécifiques à `postuler.html` et `login.html` sont en `<style>` inline dans ces fichiers

---

## Points d'Attention pour Modifications

1. **Ajouter une page SPA** : créer `public/js/pages/mapage.js`, ajouter `<script>` dans `app.html`, ajouter l'entrée dans l'objet `PAGES` du script de `app.html`.

2. **Ajouter un champ à Candidature** : modifier `models/Candidature.js` + whitelister dans `routes/candidatures.js` (`ADMIN_EDITABLE`, un `Set`) + adapter l'UI dans `public/js/pages/candidatures.js`. Si le champ est un enum, l'ajouter dans `constants.js`, pas en dur dans le modèle.

3. **Modifier un payload n8n** : éditer `services/n8n.js` — 5 fonctions distinctes selon le workflow visé (`triggerAIAnalysis` WF2 auto, `triggerManualWorkflow` WF2 manuel, `triggerQualificationEmail` qualification/RDV, `triggerBatchEvaluation` WF4, `triggerBatchCVExtraction` WF5).

4. **Modifier les emails** : éditer `services/email.js` — chaque fonction `sendXxx()` contient le HTML complet du template ; l'envoi passe par `sendViaApi()` (API HTTP maison), pas par un transporteur SMTP.

5. **Modifier le thème** : éditer les blocs `:root` et `[data-theme="optimum"]` dans `style.css` — tous les composants se mettent à jour automatiquement via les variables. Rappel : le thème suit `company`, pas un choix libre de l'utilisateur actuellement.

6. **Le fichier uploads/ n'est pas versionné** — en production, utiliser un stockage externe (S3, Cloudinary) et adapter `middleware/upload.js` (config centralisée, utilisée par `routes/public.js` et `routes/candidatures.js`) et le service de download dans `server.js`.

7. **Modifier l'intégration Cal.com** : le code applicatif (`routes/calcom.js`, `routes/candidatures.js` calcom/slots + planifier-rdv, `public/js/pages/calcom.js`, `public/js/pages/rendezvous.js`) et le workflow n8n (`n8n workflow (mis à jour)/HR Recruitment Rendez Vous Email.json`) font tous les deux des appels directs à l'API Cal.com — un changement de `lien_rdv` (format d'URL) ou d'event type sur Cal.com impacte les deux côtés. Le champ `offre.lien_rdv` doit toujours pointer vers `https://cal.com/<username>/<event-slug>` ; le username et le slug sont extraits de cette URL, il n'y a pas d'ID stocké séparément.

   **Visio par défaut = Microsoft Teams** (`office365-video`), pas Cal Video. Deux leviers distincts :
   - **Event type** (`routes/calcom.js`, `POST`/`PATCH /event-types`) : détermine la visio proposée au **candidat** qui réserve via la page Cal.com hébergée (`offre.lien_rdv`) — c'est le chemin de réservation le plus fréquent, et il ne passe jamais par notre backend. Les event types créés **avant** ce changement restent en Cal Video tant qu'ils ne sont pas migrés manuellement (dans le dashboard Cal.com, ou via le nouveau `PATCH /api/calcom/event-types/:id` — pas d'UI dédiée pour ça côté app).
   - **`POST /api/candidatures/:id/planifier-rdv`** (réservation initiée par le **recruteur**) : envoie désormais un objet `location` conforme au schéma API v2 (`{ type: 'address', address: lieu }` en présentiel, `{ type: 'integration', integration: 'office365-video' }` en visio) au lieu d'une chaîne brute comme avant. Si Cal.com refuse (event type visé pas encore migré vers Teams), l'app retente automatiquement sans forcer de location plutôt que d'échouer toute la planification (voir le `catch` autour de l'appel `POST /v2/bookings`).
   - Aléa Cal.com connu (hors de notre contrôle) : réserver avec `office365-video` peut parfois renvoyer un lien de redirection Cal Video au lieu d'un vrai lien Teams direct — à surveiller en conditions réelles.

8. **Ajouter une route de stats/agrégation** : penser au filtre `{ company: req.user.company }` (voir section "Multi-tenant") — rien ne l'impose automatiquement, l'oubli fuite les données de l'autre société dans un total/comptage censé être scopé. Exceptions volontairement cross-company : `/api/users`, et les listes `GET /api/offres` / `GET /api/candidatures` (vues partagées entre les deux sociétés par choix produit).

9. **`public/js/pages/n8n.js` est un fichier mort** (non chargé dans `app.html`, absent de `PAGES`) — à supprimer si la page workflow n8n n'est plus utilisée, ou à réintégrer explicitement sinon.
