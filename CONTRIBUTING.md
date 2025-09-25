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
├── firebase.json                     # Firebase hosting + emulators config
├── firestore.rules                   # Firestore security rules
├── firestore.indexes.json            # Declared composite indexes
├── dtuevent-*.json                   # Service account, from Firebase (DO NOT COMMIT real secrets)
├── CONTRIBUTING.md                   # Dev & contribution guidelines (this file)
├── README.md                         # Project overview & feature context
├── package.json                      # Root scripts (ingestion) + shared deps
└── LICENSE                           # License file
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
   - Place Firebase service account JSON at repo root (gitignored). Export path:
     - `setx FIREBASE_SERVICE_ACCOUNT_JSON_PATH "C:\\path\\to\\service.json"`
6. Development server:
   - `cd web && npm run dev`
7. Build production bundle:
   - `cd web && npm run build`
8. First‑time Firebase project setup (repo root):
   - `firebase login`
   - `firebase init` (select Firestore + Hosting, public directory: `web/dist`, enable SPA rewrite)
9. Deploy Hosting only:
   - `npx firebase-tools deploy --only hosting`
   - Note that the "main" branch is automatically deployed to Firebase Hosting via GitHub Actions

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
