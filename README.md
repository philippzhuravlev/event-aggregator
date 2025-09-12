# DTUEvent
This website will be a central registry for Technical University of Denmark (DTU)'s campus events from bars and cafes. JS/Node.js/REACT/Tailwind frontend, Firestore backend for hosting and DB. The site pulls through facebook's API from a number of DTU Campus bars and nearby form bars. Can be filtered by Lyngby Campus, Ballerup Campus and Dorms. 

# Setting Up
1. Prereqs: Node.js 20+, npm, Firebase CLI (`npm i -g firebase-tools`).
2. install deps: `cd web` and then `npm install`.
3. add .env fle: `copy web\.env.example web\.env` (Windows), then fill Firebase keys and set `VITE_USE_FIRESTORE=true`.
4. Dev: `npm run dev` (run inside `web/`).
5. For building: `npm run build` (inside `web/`).
5. Firebase (one-time, repo root): `firebase login` → `firebase init` → choose Firestore + Hosting (public `web/dist`, SPA rewrite Yes).
6. For deployment: `npx firebase-tools deploy --only hosting`.

# List
Below are the pages for bars at DTU. Note well that some events are not listed through these pages, but those dedicated to social gatherings.

### Bars:
- Diagonalen (The Diagonal): https://www.facebook.com/DiagonalenDTU
- Diamanten (The Diamond): https://www.facebook.com/DiamantenDTU
- Etheren (The Ether): https://www.facebook.com/EtherenDTU 
- Hegnet (The Fence): https://www.facebook.com/hegnetdtu
- S-Huset (S-House): https://www.facebook.com/shuset.dk
- Verners Kælder (Verner's Cellar), Ballerup https://www.facebook.com/vernerskaelder

### Dorm Bars Near Lyngby Campus:
- Nakkeosten (The Neck Cheese), Ostenfeld Dorm: https://www.facebook.com/Nakkeosten
- Saxen (The Sax), Kampsax Dorm: https://www.facebook.com/kampsax/?locale=da_DK 

### Dorms Further Away From Lyngby Campus:
- Række 0 (Row 0), Trørød Dorm, 11 km: https://www.facebook.com/profile.php?id=100073724250125
- Falladen (The Fail), P.O: Pedersen Dorm, 5 km: https://www.facebook.com/POPSARRANGEMENTER/
- Pauls Ølstue (Paul's Beer Room), Paul Bergsøe Dorm, 5 km: https://www.facebook.com/p/Pauls-%C3%98lstue-100057429738696/ 

### Event Pages:
- SenSommerFest (Latesummer Party): https://www.facebook.com/SenSommerfest
- Egmont Kollegiets Festival (Egmont Dorm Festival): https://www.facebook.com/profile.php?id=100063867437478

### Missing:
The dorms below have no dedicated bars, but still have parties over the summer. 
- William Demant Dorm, 2 km 
- Villum Kann Rasmussen Dorm, 1 km

# Tech Stack
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
- Github Workflows: automatically hosts "live" branch 

# Dev Diary
1. Added "types" in web/src/types.ts to "mold" our data when we get it from our DB 
2. Generated mock data
3. Created first draft of main page on web/src/App.tsc. w/ filter, search box, data access layer ("dal"), utils (eventUtils.ts) and made the EventCard its own object

# Planned Features
1. Automatic calendar page
2. Google Calendar Integration ("Add to Calendar" button)
3. Not just party events but filter by educational/seminars etc
4. Add events manually 
5. Google Maps overview