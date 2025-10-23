# Contributing Guide

First, some principles:

- Make very strict database rules; tokens are stored there
- Minimal personal data collection
- Use git branches for features, frequent commits

## Setting Up

1. **Prerequisites**:
   - Download Node.js 20+!

2. **Dependencies**:

   ```bash
   # Backend (in root)
   npm install

   # Frontend (in /web)
   cd web && npm install
   ```

3. **Environment Setup**:
Request .env files from a team member. Create local copies from examples:

   ```bash
   # Backend (in root .env)
   cp .env.example .env
   # Edit: FIREBASE_SERVICE_ACCOUNT_JSON_PATH, FIREBASE_PROJECT_ID

   # Frontend (in /web .env)
   cp web/.env.example web/.env
   # Edit: Firebase config from Console > Project Settings
   ```

4. **Service Account**:
Request `serviceAccountKey.json` from a team member. Place it in /firebase

5. **Development**:

   ```bash
   cd web && npm run dev     # Frontend dev server
   npm run ingest:facebook   # Pull Facebook events manually
   ```

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

## Token Management

Add Facebook Page Access Tokens to Firestore

```bash
# Add token for a Facebook page
npm run tokens add <pageId> "EAABwzLix..."

# View stored tokens
npm run tokens:list

# Check system status
npm run tokens:status

# Get Facebook debug info
npm run tokens debug <pageId>
```

**Getting Facebook Tokens:**

1. [Facebook Developers](https://developers.facebook.com/) → Create App
2. Add "Facebook Pages API" product
3. Generate Page Access Token with `pages_read_engagement` + `pages_show_list`
4. Store with CLI: `npm run tokens add <pageId> <token>`

## Key Commands

```bash
# Development
cd web && npm run dev              # Frontend dev server
npm run build                      # Build production bundle

# Facebook Integration  
npm run ingest:facebook           # Pull events from stored tokens
npm run tokens:status             # Token health overview

# Firebase
firebase login                    # One-time setup
firebase deploy                   # Deploy to production
```

## Project Structure

```text
DTUEvent/
├── web/                              # React 19 + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/               # React components
│   │   │   └── EventCard.tsx         # Event card component
│   │   ├── data/
│   │   │   ├── dal.ts                # Data access layer
│   │   │   └── mock.ts               # Mock data
│   │   ├── lib/
│   │   │   └── firebase.ts           # Firebase client initialization
│   │   ├── utils/
│   │   │   └── eventUtils.ts         # Helper functions (sorting, formatting)
│   │   ├── types.ts                  # Shared TS types
│   │   ├── App.tsx                   # Root component
│   │   ├── App.css                   # Root component CSS style
│   │   ├── main.tsx                  # Entry point
│   │   ├── index.css                 # Tailwind styles
│   │   └── vite-env.d.ts             # Vite type definitions
│   ├── public/                       # Static assets (currently empty)
│   ├── dist/                         # Build output (generated)
│   ├── .env                          # Frontend environment variables
│   ├── .env.example                  # Frontend environment template
│   ├── index.html                    # HTML entry point
│   ├── vite.config.ts                # Vite + plugin config
│   ├── postcss.config.js             # PostCSS configuration
│   ├── eslint.config.js              # ESLint config
│   ├── tsconfig.json                 # Main TypeScript config
│   ├── tsconfig.app.json             # App-specific TS config
│   ├── tsconfig.node.json            # Node-specific TS config
│   └── package.json                  # Frontend dependencies
├── tools/                            # Backend utilities & scripts
│   ├── ingest-facebook.mjs           # Facebook → Firestore ingestion script
│   ├── manage-tokens.mjs             # Token management CLI
│   └── token-manager.mjs             # Token management core logic
├── functions/                        # Firebase Functions (active)
│   ├── index.js                      # Functions entry point
│   ├── firebase-debug.log            # Firebase debug logs
│   ├── .eslintrc.js                  # Functions ESLint config
│   ├── .gitignore                    # Functions gitignore
│   └── package.json                  # Functions dependencies
├── firebase/                         # Firebase config & credentials
│   ├── dtuevent-8105b-firebase-adminsdk-fbsvc-ce81792c13.json  # Service account (gitignored)
│   ├── firebase.json                 # Firebase project config
│   ├── firestore.rules               # Database security rules
│   ├── firestore.indexes.json        # Database indexes
│   └── exports/                      # Database exports
├── .github/                          # GitHub Actions & workflows
├── .vscode/                          # VS Code workspace settings
├── .env                              # Backend environment variables
├── .env.example                      # Backend environment template
├── .firebaserc                       # Firebase project aliases
├── .gitignore                        # Git ignore rules
├── firebase.json                     # Firebase hosting & redirects
├── CONTRIBUTING.md                   # Developer documentation
├── README.md                         # User documentation
├── package.json                      # Backend dependencies & scripts
├── package-lock.json                 # Exact dependency versions
└── LICENSE                           # Project license
```

## Firebase Security Rules

Tokens stored in admin-only Firestore collections:

- `events/` - Public read, admin write
- `pages/` - Public read, admin write  
- `admin-tokens/` - Admin only (no client access)

## Deployment

GitHub Actions automatically deploys `main` branch to Firebase Hosting.

Manual deployment:

```bash
firebase deploy
```
