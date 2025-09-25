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

## Challenges

- Facebook Graph API access limited: only pages where we hold admin/editor access are queryable without full App Review; strategy is to (1) use mock pages, (2) invite actual page admins to grant scoped access, (3) request permissions incrementally. Scraping is intentionally avoided due to fragility and legal risk.
- Privacy / GDPR: MVP stores minimal or no personal data; if later storing preferences or notification channels, we will implement export & deletion plus a clear privacy policy and (if needed) cookie/localStorage consent dialog.
- Non‑commercial student project: lowers compliance surface but we still document data flows for review.

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

## Dev Diary

1. Added "types" in web/src/types.ts to "mold" our data when we get it from our DB
2. Generated mock data
3. Created first draft of main page
4. Added firebase integration
5. Added structured README + CONTRIBUTING guide

## Planned Features

1. Fetch public facebook page data from Facebook's Graph API and list them
2. Let people favorite pages but pref. no profiles nor cookie use
3. Automatic calendar page
4. Google Calendar Integration ("Add to Calendar" button)
5. Not just party events but filter by educational/seminars etc
6. Add events manually
7. Google Maps overview
8. Facebook Graph API: create Meta app (Dev) and validate Page token on a test page
9. Firebase Functions: implement /api/sync/facebook and upsert normalized events to Firestore
10. App Review: request Page Public Content Access (read-only public events)
11. Cloud Scheduler: daily sync trigger with shared secret header
12. Compliance: privacy policy page + short screencast for review submission
