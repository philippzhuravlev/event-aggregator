# Contributing to DTUEvent

Some key principles:

- Save minimal personal data. If needed, make it GDPR compliant (export, deletion, privacy policy).
- Keep Firebase rules strict (least privilege).
- Rather more git pushes than fewer.
- Use Git branches for your own features / fixes.

## Project Structure

```text
DTUEvent/
├── web/                              # React 19 + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── EventCard.tsx         # Presentational card for an event
│   │   ├── data/
│   │   │   ├── dal.ts                # Data access layer (Firestore / mock switch)
│   │   │   └── mock.ts               # Mock seed events/pages for local dev
│   │   ├── lib/
│   │   │   └── firebase.ts           # Firebase client initialization
│   │   ├── utils/
│   │   │   └── eventUtils.ts         # Helper functions (sorting, formatting)
│   │   ├── types.ts                  # Shared TS interfaces (Event, Page, etc.)
│   │   ├── App.tsx                   # Root component
│   │   ├── main.tsx                  # Entry point / React bootstrap
│   │   ├── index.css                 # Tailwind base imports
│   │   └── App.css                   # App‑level styles (override/util)
│   ├── public/                       # Static assets served as‑is
│   ├── vite.config.ts                # Vite + plugin config
│   ├── tsconfig.*.json               # TS build configs
│   ├── eslint.config.js              # Lint rules
│   └── package.json                  # Frontend deps & scripts
├── tools/
│   └── ingest-facebook.mjs           # Script: pull events via Graph API → Firestore
├── functions/                        # (Planned) Firebase Functions (currently placeholder)
│   └── package.json                  # Firebase Functions deps
├── firebase/                         # Firebase configuration files (organized)
│   ├── firebase.json                 # Local development Firebase config
│   ├── firestore.rules               # Firestore security rules
│   ├── firestore.indexes.json        # Declared composite indexes
│   ├── dtuevent-*.json               # Service account key (DO NOT COMMIT)
│   ├── exports/                      # Firebase export data
│   └── README.md                     # Firebase setup documentation
├── .firebaserc                       # Firebase configuration
├── firebase.json                     # Firebase redirects
├── CONTRIBUTING.md                   # Docs for devs specifially
├── README.md                         # Docs for users
├── package.json                      # From `npm install`. Deps. 
├── package-lock.json                 # From `npm install` Exact deps
└── LICENSE
```

## Quick Start (Local Dev)

1. Install prerequisites: Node.js 20+, npm, Firebase CLI (`npm i -g firebase-tools`).
2. Clone repo & install root dependencies:
   - `npm install`
3. Install web app dependencies:
   - `cd web && npm install`
4. Create env file (Windows example):
   - `copy web\.env.example web\.env`
   - Fill Firebase config vars; set `VITE_USE_FIRESTORE=true`.
5. Service account:
   - Place Firebase service account JSON in `/firebase` directory (gitignored). Export path:
     - `setx FIREBASE_SERVICE_ACCOUNT_JSON_PATH "C:\\path\\to\\DTUEvent\\firebase\\dtuevent-*-firebase-adminsdk-*.json"`
6. Development server:
   - `cd web && npm run dev`
7. Build production bundle:
   - `cd web && npm run build`
8. First‑time Firebase project setup (repo root):
   - `firebase login`
   - `firebase init` (select Firestore + Hosting, public directory: `web/dist`, enable SPA rewrite)
   - Note: Firebase config files are organized in `/firebase` directory, but always run commands from root
9. Firebase deployment (always from root):
   - `firebase deploy --only hosting` (deploy web app only)
   - `firebase deploy` (deploy all: hosting, functions, rules)
   - `firebase emulators:start` (local development)
   - Note: The "main" branch auto-deploys via GitHub Actions

## Facebook Graph API Ingestion

Environment variables (set in PowerShell or `.env` for ingestion script):

- `FB_PAGE_ACCESS_TOKEN` – Page access token with events read scope.
- `FB_PAGES` – Comma separated list (e.g. `shuset.dk,DiagonalenDTU`).
- `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` – Absolute path to service account file.

Run ingestion:

```bash
npm run ingest:facebook
```

(Uses `tools/ingest-facebook.mjs` to upsert events into `events` collection.)

## List

Below are the pages for bars at DTU. Note well that some events are not listed through these pages, but those dedicated to social gatherings.

### Bars

- Diagonalen (The Diagonal): <https://www.facebook.com/DiagonalenDTU>
- Diamanten (The Diamond): <https://www.facebook.com/DiamantenDTU>
- Etheren (The Ether): <https://www.facebook.com/EtherenDTU>
- Hegnet (The Fence): <https://www.facebook.com/hegnetdtu>
- S-Huset (S-House): <https://www.facebook.com/shuset.dk>
- Verners Kælder (Verner's Cellar), Ballerup: <https://www.facebook.com/vernerskaelder>

### Dorm Bars Near Lyngby Campus

- Nakkeosten (The Neck Cheese), Ostenfeld Dorm: <https://www.facebook.com/Nakkeosten>
- Saxen (The Sax), Kampsax Dorm: <https://www.facebook.com/kampsax/?locale=da_DK>

### Dorms Further Away From Lyngby Campus

- Række 0 (Row 0), Trørød Dorm, 11 km: <https://www.facebook.com/profile.php?id=100073724250125>
- Falladen (The Fail), P.O: Pedersen Dorm, 5 km: <https://www.facebook.com/POPSARRANGEMENTER/>
- Pauls Ølstue (Paul's Beer Room), Paul Bergsøe Dorm, 5 km: <https://www.facebook.com/p/Pauls-%C3%98lstue-100057429738696/>

### Event Pages

- SenSommerFest (Latesummer Party): <https://www.facebook.com/SenSommerfest>
- Egmont Kollegiets Festival (Egmont Dorm Festival): <https://www.facebook.com/profile.php?id=100063867437478>

### Missing

The dorms below have no dedicated bars, but still have parties over the summer.

- William Demant Dorm, 2 km
- Villum Kann Rasmussen Dorm, 1 km
