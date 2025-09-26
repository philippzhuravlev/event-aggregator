# Contributing

This document is the **Technical** part of DTU Event documentation, for developers and contributors. For general user documentation, see [README.md](./README.md).

Some key principles:

- Save minimal personal data. If needed, make it GDPR compliant (export, deletion, privacy policy).
- Keep Firebase rules strict (least privilege).
- Rather more git pushes than fewer.
- Use Git branches for your own features / fixes.

## Tech Stack

This project is technically fullstack (front- and backend), but as Firebase handles most of the backend, it is effectively mostly frontend.

- HTML + CSS: the structure (HTML) and visual styling (CSS) of web pages.
- TypeScript: JavaScript with "types" that help catch mistakes early.
- React: lets us easily build the UI from small, reusable components.
- Vite: Fast dev server ("npm run dev") and build tool. Pronounced "veet".
- Tailwind CSS: style quickly using small utility classes.
- Node.js + npm: run tools and install packages on your computer.
- ESLint: checks code for common errors and enforces consistent style.
- PostCSS + Autoprefixer: makes CSS work consistently across different browsers.
- Firebase Hosting: deploy the website through a particular url on the internet.
- Firebase Firestore: cloud database for events, pages, and settings.
- Facebook Graph API: automatically fetch event data from Facebook pages.
- Github Workflows: automatically hosts "live" branch to Firebase
- Facebook Graph API: fetches DTU event data from the list (see "List" below)

## Project Structure

```text
DTUEvent/
├── web/                              # React 19 + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/               # React components
│   │   │   ├── EventCard.tsx         # Event card component
│   │   ├── data/
│   │   │   ├── dal.ts                # Data access layer
│   │   │   └── mock.ts               # Mock data
│   │   ├── lib/
│   │   │   └── firebase.ts           # Firebase client initialization
│   │   ├── utils/
│   │   │   └── eventUtils.ts         # Helper functions (sorting, formatting)
│   │   ├── types.ts                  # Shared TS types
│   │   ├── App.tsx                   # Root component
│   │   ├── main.tsx                  # Entry point
│   │   ├── index.css                 # Tailwind
│   │   └── App.css                   # Root component CSS style
│   ├── public/                       # Assets
│   ├── vite.config.ts                # Vite + plugin config
│   ├── tsconfig.*.json               # TS build configs
│   ├── eslint.config.js              # ESLint config
│   └── package.json                  # From `npm install`. Deps, specifically for frontend
├── tools/
│   └── ingest-facebook.mjs           # Script that pull events via Graph API → Firestore
├── functions/                        # (Planned) Firebase Functions (currently placeholder)
│   └── package.json                  # Firebase Functions deps
├── firebase/                         # Firebase config files (organized)
│   ├── firebase.json                 
│   ├── firestore.rules               
│   ├── firestore.indexes.json        
│   └── exports/                      
├── .firebaserc                       # Firebase config
├── firebase.json                     # Firebase redirects
├── CONTRIBUTING.md                   # Docs for devs specifially
├── README.md                         # Docs for users
├── package.json                      # From `npm install`. Deps, specifically for backend
├── package-lock.json                 # From `npm install` Exact backend deps
└── LICENSE
```

## Quick Start

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

- `FB_PAGE_ACCESS_TOKEN` - Page access token with events read scope.
- `FB_PAGES` - Comma separated list (e.g. `shuset.dk,DiagonalenDTU`).
- `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` - Absolute path to service account file.

Run ingestion:

```bash
npm run ingest:facebook
```

(Uses `tools/ingest-facebook.mjs` to upsert events into `events` collection.)
