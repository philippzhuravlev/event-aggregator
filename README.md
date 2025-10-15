# Read Me

This document is the **non-technical** part of DTU Event documentation, for general users. For developer and contributor documentation, see [CONTRIBUTING.md](./CONTRIBUTING.md).

This website will be a central registry for Technical University of Denmark (DTU)'s campus events from bars and cafes. JS/Node.js/REACT/Tailwind frontend, Firestore backend for hosting and DB. The site pulls through facebook's API from a number of DTU Campus bars and nearby form bars. Note that we do not discriminate between Lyngby Campus and Ballerup Campus.

## Problem

DTU student events are currently fragmented across many Facebook pages (PF sub‑orgs, bars, dorms, ad‑hoc groups). New and international students especially struggle to discover what is happening without already following 10-20 pages or relying on friends’ “Interested” facebook signals. DTUEvent provides a single neutral, lightweight, mobile‑friendly web feed aggregating events (initially via mock data + pages where we have admin tokens). A web app (instead of native) keeps scope realistic and instantly accessible.

## Stakeholders

- Students (primary) - need a simple, reliable overview of upcoming social and academic events.
- Organizers (secondary: PF, bars, dorm committees, study orgs) - want increased, predictable reach and less manual promotion overhead.
- DTU administration (tertiary) - benefits from stronger social cohesion & inclusion.

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

- Akkash - Scrum Master / coordination
- Christian - Software Developer
- Philipp - Software Developer
- Hannah - Design & UX
- Lilian - Design & Agile facilitation
- Ollie - Outreach (Facebook page admin liaison) & dev support

## Planned Features

- User favorites and personalization
- Calendar integration and export
- Event categorization (academic, social, etc.)
- Location mapping
- Mobile-responsive design improvements
- Page admin authentication system (Facebook OAuth)
- Business Manager integration for stable API access
- Automated token refresh system
- Page admin dashboard for managing event sync
- Manual event submission (fallback for pages without API access)
- Page admin onboarding flow
- Event moderation and approval system
- Analytics dashboard for event engagement
- Notification system for page admins (event sync status, token expiration)

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
