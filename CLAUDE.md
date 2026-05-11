# Solumada Recrutement App — Documentation Technique

Application web de gestion du recrutement avec analyse IA des candidatures via n8n/Claude.

---

## Stack Technique

| Couche | Technologie |
|--------|------------|
| Backend | Node.js + Express 4.18 |
| Base de données | MongoDB Atlas (Mongoose 8) |
| Auth | JWT (7 jours) + bcryptjs (salt 12) |
| Upload fichiers | Multer — stockage disque `/uploads/` |
| Email | Nodemailer (Gmail SMTP) |
| Automatisation IA | n8n Cloud + Claude (webhook) |
| Frontend | SPA vanilla JS — zéro framework, zéro bundler |
| CSS | CSS custom avec variables, deux thèmes |

Démarrage : `npm run dev` (nodemon) ou `npm start`

---

## Structure des Fichiers

```
├── server.js                  # Point d'entrée — Express, MongoDB, routes, cron
├── .env                       # Variables d'environnement (voir section dédiée)
├── middleware/
│   ├── auth.js                # verifyToken(JWT) + signToken()
│   └── rateLimiter.js         # Rate limiter in-memory (IP-based)
├── models/
│   ├── User.js                # Admin user
│   ├── Offre.js               # Offre d'emploi
│   └── Candidature.js         # Candidature + champs analyse IA
├── routes/
│   ├── auth.js                # /api/auth — login, profil, thème
│   ├── offres.js              # /api/offres — CRUD offres
│   ├── candidatures.js        # /api/candidatures — CRUD + emails + workflow
│   ├── public.js              # /api/public — formulaire public + callback n8n
│   └── n8n.js                 # /api/n8n — statut workflows
├── services/
│   ├── email.js               # Envoi emails (offre créée, qualification, refus)
│   └── n8n.js                 # Déclenchement webhook n8n + retry exponentiel
├── public/
│   ├── app.html               # Shell SPA (sidebar + topbar + router JS)
│   ├── login.html             # Page de connexion
│   ├── postuler.html          # Formulaire public candidature (standalone)
│   ├── css/style.css          # Tout le CSS — design system + responsive
│   └── js/
│       ├── utils.js           # Auth, api, toast, badges, dates, tabs
│       └── pages/
│           ├── dashboard.js   # Stats + grilles récentes
│           ├── offres.js      # Liste + modals création/édition offres
│           ├── candidatures.js# Liste + fiche candidature + actions
│           ├── n8n.js         # Statut workflows n8n
│           └── settings.js    # Profil utilisateur
└── uploads/                   # CVs et lettres uploadés (non versionné)
```

---

## Frontend — Architecture SPA

### Fonctionnement global

`app.html` est le shell unique. Tout le contenu est injecté dans `#page-content` par JS.

```
app.html
  └── <div id="page-content">   ← renderXxx() injecte ici
  └── <script>
        navigate(page)          ← router client
        PAGES = { dashboard, offres, candidatures, n8n, settings }
```

Chaque `navigate(page)` :
1. Appelle `closeSidebar()` (mobile)
2. Met à jour `topbar-title`, `topbar-sub`, `topbar-actions`
3. Appelle `PAGES[page].render()` qui injecte le HTML

### Utils disponibles partout (utils.js)

```javascript
Auth.user()           // → { nom, email, role, theme }
Auth.token()          // → JWT string
api.get(url)          // fetch GET avec Bearer token
api.post(url, data)   // fetch POST JSON
api.patch(url, data)  // fetch PATCH JSON
api.delete(url)       // fetch DELETE
toast(msg, type)      // type: 'success' | 'error' | 'info'
renderBadge(reco)     // QUALIFIE | A_REVOIR | NON_SELECTIONNE → badge HTML
renderScoreBar(score) // score 0-10 → barre de progression HTML
badgeStatut(statut)   // Active | Fermée | En pause → badge HTML
fmtDate(d)            // → "12 jan. 2025"
fmtDatetime(d)        // → "12 jan. 2025, 14:30"
timeAgo(d)            // → "il y a 3h"
initials(name)        // "Jean Dupont" → "JD"
fileUrl(path)         // /api/uploads/xxx?token=... (téléchargement protégé)
initTabs()            // Active le système de tabs (.tab-btn / .tab-panel)
```

### Thèmes

Deux thèmes via `data-theme` sur `<html>` :
- `solumada` — vert (`#22c55e`)
- `optimum` — bleu (`#62A5D2`)

Basculement : `applyTheme(theme)` (utils.js) + sauvegarde en DB via `api.patch('/api/auth/theme', { theme })`

---

## CSS — Design System

**Fichier unique :** `public/css/style.css`

### Variables CSS principales

```css
/* Couleurs accent (changent selon le thème) */
--accent, --accent-dark, --accent-light, --accent-mid, --accent-text
--accent-glow, --accent-soft
--grad-start, --grad-end, --grad-mid   /* pour les dégradés */

/* Neutres (fixes) */
--bg: #f8fafc           /* fond de page */
--surface: #ffffff      /* fond des cards */
--surface-2: #f8fafc    /* fond secondaire */
--surface-3: #f1f5f9    /* fond tertiaire */
--border: #e2e8f0
--text, --text-2, --text-3

/* Layout */
--sidebar-w: 252px

/* Effets */
--shadow-xs, --shadow-sm, --shadow, --shadow-lg, --shadow-accent
--transition: 0.2s cubic-bezier(.4,0,.2,1)
--spring: 0.4s cubic-bezier(.34,1.56,.64,1)

/* Typographie */
--font: 'Plus Jakarta Sans'
--mono: 'JetBrains Mono'

/* Radius */
--r: 10px   --r-lg: 14px   --r-xl: 20px   --r-2xl: 26px
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
| `.badge .badge-green/amber/red/blue/gray/accent` | Badges |
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
| `≤ 768px` | Tablettes — sidebar cachée + hamburger, grilles 1 col |
| `≤ 480px` | Mobile — stats 1 col, sous-titre masqué, toast plein écran |

---

## API — Référence complète

### Auth (`/api/auth`)

```
POST   /api/auth/login        { email, password }        → { token, user }
POST   /api/auth/setup        { nom, email, password }   → { token, user }  (1 seul admin)
GET    /api/auth/me           [JWT]                      → { user }
PATCH  /api/auth/theme        [JWT] { theme }            → { user }
PATCH  /api/auth/me           [JWT] { nom?, password? }  → { user }
```

### Offres (`/api/offres`) — JWT requis

```
GET    /api/offres                    → { offres[] }
GET    /api/offres/stats/summary      → { stats: { offresActives, totalCandidatures, qualifies, arevoir } }
POST   /api/offres                    { ...offre }         → { offre }
GET    /api/offres/:id                                     → { offre }
GET    /api/offres/:id/candidatures                        → { candidatures[] }
PATCH  /api/offres/:id                { ...champs }        → { offre }
DELETE /api/offres/:id                                     → { success }
```

### Candidatures (`/api/candidatures`) — JWT requis

```
GET    /api/candidatures                    ?page=1&limit=50&offre_id=&search=&recommandation=
                                            → { candidatures[], total, page, pages }
GET    /api/candidatures/:id               → { candidature }
POST   /api/candidatures                   { offre_id, candidat_nom, ... }  → { candidature }
PATCH  /api/candidatures/:id               { champs whitelistés }           → { candidature }
DELETE /api/candidatures/:id               → { success }
POST   /api/candidatures/:id/envoyer-emails-qualification   → { success }
POST   /api/candidatures/:id/envoyer-email-refus            → { success }
POST   /api/candidatures/:id/relancer-workflow              → { success }
```

**Champs PATCH whitelistés :** `statut, recommandation, score, resume_analyse, adequation_poste, competences_detectees, competences_manquantes, experience_annees, niveau_education, points_forts, points_faibles`

### Public (`/api/public`) — Sans auth

```
GET    /api/public/offre/:offre_id            → { offre }  (uniquement si statut=Active)
POST   /api/public/candidature               multipart/form-data:
                                               offre_id, candidat_nom, candidat_email,
                                               candidat_telephone?, cv (file), lettre? (file)
                                             Rate limit: 5 requêtes / 10 min par IP
                                             → { success, candidature_id }
PATCH  /api/public/candidature/:id/analyse   Header: X-Callback-Secret
                                             { score, recommandation, resume_analyse, ... }
                                             → { success }  (callback n8n)
```

### n8n (`/api/n8n`) — JWT requis

```
GET    /api/n8n/workflows              → { workflows[] }
GET    /api/n8n/executions/:wfId       → { executions[] }
POST   /api/n8n/trigger/wf2            → { success }
GET    /api/n8n/links                  → { dashboardUrl, wf2Url }
```

### Fichiers protégés

```
GET    /api/uploads/:filename?token=JWT    → fichier binaire (CV / lettre)
```

---

## Modèles MongoDB

### User

```javascript
{ nom, email (unique), password (hashed), role: 'admin',
  theme: 'solumada'|'optimum', lastLogin, actif: Boolean }
```

### Offre

```javascript
{ offre_id (unique, string), titre_poste, description_poste,
  competences_requises, annees_experience, langues_requises,
  exigences_ia,           // guide le scoring Claude dans n8n
  type_contrat,           // CDI|CDD|Stage|Freelance|Alternance
  localisation, salaire, email_recruteur,
  date_butoire,           // null = pas de limite ; si dépassée → offre fermée auto (cron horaire)
  test_requis: Boolean,   // si true : emails qualification NON envoyés automatiquement
  lien_calendar,          // lien Google Calendar pour invitation entretien
  statut: 'Active'|'Fermée'|'En pause' }
```

### Candidature

```javascript
{ offre_id, titre_poste, email_recruteur,
  candidat_nom, candidat_email, candidat_telephone,
  cv_filename, cv_path,
  lettre_filename, lettre_path,

  // Remplis par n8n après analyse IA
  score: Number (0–10),
  recommandation: 'QUALIFIE'|'A_REVOIR'|'NON_SELECTIONNE'|'',
  resume_analyse, adequation_poste,
  competences_detectees, competences_manquantes,
  experience_annees, niveau_education,
  points_forts, points_faibles,

  statut: 'Nouveau'|'En cours'|'Entretien planifié'|'Accepté'|'Refusé',
  date_candidature }
```

---

## Variables d'Environnement (.env)

```bash
PORT=3000
MONGODB_URI=               # URI MongoDB Atlas
JWT_SECRET=                # Clé secrète JWT (longue, aléatoire)
BASE_URL=                  # URL publique de l'app (ex: https://xxx.ngrok-free.app)

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=                # Email Gmail
EMAIL_PASS=                # App password Gmail (pas le mot de passe principal)

# n8n
N8N_BASE_URL=              # https://xxx.app.n8n.cloud
N8N_API_KEY=               # Clé API n8n
N8N_WF2_ID=                # ID du workflow WF2 dans n8n
N8N_WEBHOOK_URL=           # URL webhook principal
N8N_WF2_WEBHOOK_URL=       # URL webhook WF2
N8N_CALLBACK_SECRET=       # Secret partagé app ↔ n8n pour le callback
N8N_MAX_RETRIES=3
N8N_RETRY_DELAY=4000
```

---

## Flux Clés

### Soumission d'une candidature (public)

```
/postuler?offre_id=XXX
  → POST /api/public/candidature (multipart)
  → Rate limit + déduplication (email+offre_id) + vérif deadline
  → Fichiers sauvés dans /uploads/
  → Candidature créée en DB (statut: Nouveau, score: null)
  → services/n8n.js → webhook n8n WF2 (payload JSON + CV en base64)
  → n8n analyse avec Claude → callback PATCH /api/public/candidature/:id/analyse
  → Candidature mise à jour (score, recommandation, analyse...)
```

### Qualification manuelle (admin)

```
POST /api/candidatures/:id/envoyer-emails-qualification
  → Email au candidat (invitation entretien)
  → Email au recruteur (notification)
  → Si offre.test_requis = false : email automatique
  → Si offre.test_requis = true  : recruteur qualifie manuellement après test
```

### Fermeture automatique des offres

```
Cron job toutes les heures (server.js)
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
                 // Payload : { id, email, nom, role, theme }

// Dans une route protégée :
req.user  // → { id, email, nom, role, theme }
```

---

## Conventions de Code

### Backend
- Réponses JSON : `{ success: true, data }` ou `{ success: false, error: 'message' }`
- Erreurs HTTP : 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 500 (server)
- Pas de middleware de validation externe — validation manuelle dans les routes

### Frontend
- Chaque page JS expose une fonction `renderXxx()` globale appelée par le router
- Les modals sont injectés dans le DOM via `innerHTML` avec l'HTML complet
- Pas de state manager — données relues depuis l'API à chaque navigation
- Inline styles tolérés dans les templates HTML des pages JS
- `onclick="fn()"` directement dans le HTML généré (pas d'addEventListener)

### CSS
- Toujours utiliser les variables CSS (`var(--accent)`, etc.) — jamais de couleurs hardcodées
- Ajouter les styles responsive à la fin de `style.css` dans les blocs `@media` existants
- Les styles spécifiques à `postuler.html` et `login.html` sont en `<style>` inline dans ces fichiers

---

## Points d'Attention pour Modifications

1. **Ajouter une page SPA** : créer `public/js/pages/mapage.js`, ajouter `<script>` dans `app.html`, ajouter l'entrée dans l'objet `PAGES` du script de `app.html`

2. **Ajouter un champ à Candidature** : modifier `models/Candidature.js` + whitelister dans `routes/candidatures.js` (tableau `ALLOWED_PATCH_FIELDS`) + adapter l'UI dans `candidatures.js`

3. **Modifier le payload n8n** : éditer `services/n8n.js` → fonction `declencherAnalyseIA()`

4. **Modifier les emails** : éditer `services/email.js` — chaque fonction contient le HTML complet du template

5. **Modifier le thème** : éditer les blocs `:root` et `[data-theme="optimum"]` dans `style.css` — tous les composants se mettent à jour automatiquement via les variables

6. **Le fichier uploads/ n'est pas versionné** — en production, utiliser un stockage externe (S3, Cloudinary) et adapter `multer` dans `routes/public.js` et le service de download dans `server.js`
