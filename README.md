# DTUEvent

This website will be a central registry for Technical University of Denmark (DTU)'s campus events from bars and cafes. JS/Node.js/REACT/Tailwind frontend, Firestore backend for hosting and DB. The site pulls through facebook's API from a number of DTU Campus bars and nearby form bars. Note that we do not discriminate between Lyngby Campus and Ballerup Campus.

## Problem

DTU student events are currently fragmented across many Facebook pages (PF sub‑orgs, bars, dorms, ad‑hoc groups). New and international students especially struggle to discover what is happening without already following 10–20 pages or relying on friends’ “Interested” facebook signals. DTUEvent provides a single neutral, lightweight, mobile‑friendly web feed aggregating events (initially via mock data + pages where we have admin tokens). A web app (instead of native) keeps scope realistic and instantly accessible.

## Stakeholders

- Students (primary) – need a simple, reliable overview of upcoming social and academic events.
- Organizers (secondary: PF, bars, dorm committees, study orgs) – want increased, predictable reach and less manual promotion overhead.
- DTU administration (tertiary) – benefits from stronger social cohesion & inclusion.

## Features

Student:

- See all upcoming events in one chronological feed (empty state if none).
- Filter by date and (later) organizer/category.
- (Future) Opt‑in notifications for new or changed saved events.
- Share an event with a link (no personal data embedded).
- Report incorrect event details (flag shown as Under review).

Organizer:

- View basic interest / going counts & simple recent views.
- Have event details auto‑sync from Facebook within ≤15 minutes of changes (once sync service is live).

## Team

Or "TonkaProductions". Note that all contribute code.

- Akkash – Scrum Master / coordination
- Christian – Software Developer
- Philipp – Software Developer
- Hannah – Design & UX
- Lilian – Design & Agile facilitation
- Ollie – Outreach (Facebook page admin liaison) & dev support

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

## Dev Diary

1. Added "types" in web/src/types.ts to "mold" our data when we get it from our DB
2. Generated mock data
3. Created first draft of main page
4. Added firebase integration
5. Added structured README + CONTRIBUTING guide
6. Put firebase config in /firebase directory
7. Added Facebook ingestion script

## Planned Features

- User favorites and personalization
- Calendar integration and export
- Event categorization (academic, social, etc.)
- Manual event submission
- Location mapping
- Mobile-responsive design improvements
