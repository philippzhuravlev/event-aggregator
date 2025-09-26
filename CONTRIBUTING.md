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
4. **Create environment files**:
   - **Root .env file** (Windows example):
     - `copy .env.example .env`
     - Fill in your Facebook Page Access Token and Page ID
     - Verify Firebase service account path is correct
   - **Web .env file** (Windows example):
     - `copy web\.env.example web\.env`
     - Fill Firebase config vars from Firebase Console
     - Set `VITE_USE_FIRESTORE=true` to use real data
5. Service account:
   - Place Firebase service account JSON in `/firebase` directory (gitignored)
   - Path should match `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` in root `.env`
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

## Environment Configuration

The project requires two `.env` files for full functionality:

### Root `.env` file (for Facebook ingestion)

Copy `.env.example` to `.env` and configure:

```bash
# Facebook Graph API Configuration
FB_PAGE_ACCESS_TOKEN=your_page_access_token_here
FB_PAGES=your_facebook_page_id_here

# Firebase Admin Configuration
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=./firebase/your-firebase-adminsdk-file.json
FIREBASE_PROJECT_ID=your-firebase-project-id

# Development Settings
NODE_ENV=development
```

### Web `.env` file (for frontend Firebase connection)

Copy `web/.env.example` to `web/.env` and configure:

```bash
# Firebase Web App Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id

# Feature Flags
VITE_USE_FIRESTORE=true

# Development Options (uncomment as needed)
# VITE_FIRESTORE_EMULATOR=true
```

**Note**: Get Firebase web config values from Firebase Console > Project Settings > General > Your apps > Web app config.

## Facebook Graph API Ingestion

Configure the required environment variables in your root `.env` file (see Environment Configuration section above):

- `FB_PAGE_ACCESS_TOKEN` - Page access token with `pages_read_engagement` permission
- `FB_PAGES` - Comma-separated list of Facebook page IDs (e.g. `777401265463466,shuset.dk`)
- `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` - Relative path to service account file

Run ingestion:

```bash
npm run ingest:facebook
```

(Uses `tools/ingest-facebook.mjs` to upsert events into `events` collection.)

### Troubleshooting Environment Setup

**Common issues:**

- **"Missing FB_PAGE_ACCESS_TOKEN"**: Ensure root `.env` file exists and has valid Page Access Token
- **"An active access token must be used"**: Token may be User Token instead of Page Token - regenerate from Graph API Explorer
- **Firebase connection errors**: Verify `web/.env` has correct Firebase config from Console
- **"VITE_USE_FIRESTORE=true" not working**: Check `web/.env` file exists and variable is set correctly
