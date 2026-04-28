# Vacation Planner

A Next.js app for planning a trip day-by-day with an interactive map. State lives in Redis (Upstash by default) with localStorage as an offline cache. The owner edits via a token; anyone else with the URL gets a read-only, sanitized view.

## Pages

- **Planning** (`/`) — the editor: days list, day-detail panel, map, Activity Ideas card.
- **Itinerary** (`/itinerary`) — vertical-scroll timeline of every day, chronological items, color-coded.
- **Transportation** (`/transportation`) — every flight, ferry, car rental as a card with route, times, vendor, confirmation, passengers, addresses.
- **Accommodations** (`/accommodations`) — every stay with check-in→check-out dates, address, phone, vendor, confirmation.
- **Events** (`/events`) — dinners and excursions with date, time, notes, location.

A sticky top nav switches between them; current page is highlighted.

## Features

### Editor
- **Categories**: flights, ferries, car rentals, accommodations, dinners, excursions — each with `bookingVendor`, `confirmationNumber`, and `notes` detail fields.
- **Color-coded everywhere**: each category has a distinct color (sky/teal/orange/violet/rose/emerald) on the chronological list left-border, the time, the label, and the matching map pin.
- **Strict time inputs**: every time field is `<input type="time">` so HH:MM is enforced and the chronological sort stays tight.
- **Edit any item** via the ✎ icon — opens the modal pre-filled with current values; category selector locks during edit.
- **Send to Ideas** (💡 icon on excursions/dinners): demote a scheduled item back to the Ideas list without losing it.
- **Multi-night accommodations** automatically extend the trip with the right days and render contextually as Check-in / Staying at / Check-out on each day of the stay.
- **Multi-day car rentals**: `dropoffDate` field; the rental renders Pickup → Ongoing → Drop-off across the span. The "transportation unconfirmed" warning correctly clears for middle days.
- **Overnight flights**: when AeroDataBox returns an arrival local-date different from the departure local-date, the planner auto-creates the arrival day if missing.
- **Taxi/Uber quick-add**: the transportation-unconfirmed warning has a one-click button that drops in a `Taxi/Uber` car-rental entry. Editable like any other.

### Map
- **Color-coded pins** matching the chronological list categories, plus a neutral slate pin for general city locations.
- **Click a pin → that day is selected**: city pins pick the first day visiting that city; item-coord pins pick the day they're on.
- **Routes drawn**: dashed amber for flights (between airport coords), teal for ferries (port-to-port when set, else city-to-city), blue for generic day-travel.

### Ideas
- **Activity Ideas card** for unscheduled "maybe do this" items, with optional `coord` so they can also pin on the map.
- **Grouped by location** (alphabetical) with item counts; items within each group sorted alphabetically.
- **Nearby Ideas panel** inside each day's details, filtered by location match against the day's start/end.
- **Promote idea to day**: opens a modal with a category dropdown (default: Excursion); fields swap with the chosen category; name, notes, and coord are pre-filled from the idea. The idea is removed from the list once placed.

### Google Maps integration
- **Paste a Maps link** input on the Ideas card: extracts place name and lat/lon, snaps to the nearest known trip city for `location`, fills the form.
- **Same on every editor modal** that has a coord field:
  - Accommodations / dinners / excursions → fills `name`, `address`, `phone`, `coord`.
  - Ferries get **two** lookup rows ("Departure terminal" / "Arrival terminal") that fill the corresponding coord and address.
- **Reverse-geocoding** via Nominatim (free, no key) returns a clean human-readable address; OSM's `phone` / `contact:phone` tag fills `phone` when it's present on the place.
- **Flight lookup by flight number**: type the number, click Lookup. AeroDataBox returns airline, airports, lat/lon, scheduled times, and the local arrival date.

### Sharing & Security
- **Read-only sanitized sharing**: send the deployed URL to anyone. They see the trip without sensitive fields stripped server-side: `confirmationNumber`, `phone`, `bookingVendor`, `passengers`, `address`, `pickupAddress`, `dropoffAddress`, `departureAddress`, `arrivalAddress`.
- **Owner mode** is unlocked via a token: click **Sign in** in the top nav, paste the value of `OWNER_TOKEN`, and you get full edit access. The token is stored in localStorage and sent as `Authorization: Bearer …` on every API call.
- **Server-enforced**: PUT/DELETE on `/api/trip` returns 403 without a valid token, so the read-only view can't be bypassed by editing requests in DevTools.

### Persistence
- **Redis-backed** at key `vp:trip` storing one JSON blob `{ days, ideas }`.
- **localStorage cache** keeps the UI working when the network is down; it re-syncs on the next save.
- **Sync status indicator** in the header: ⏳ Loading… · 💾 Saving… · ✓ Synced · ⚠ Offline · 🔒 Forbidden · 👁 Read-only.
- **Reset** button (owner-only) wipes both localStorage and Redis back to the seeded sample data.

### UI polish
- **Dark/light theme** toggle (sun/moon icon).
- **Mobile responsive**: at 900px the three-column layout collapses to one; the hero's status/Reset/theme cluster reflows below the title; modals and nav links tighten at 600px.
- **Days list scrollbar**: the days panel caps at viewport height so a long trip (e.g. 19 days) scrolls inside its panel rather than pushing the page down.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in the keys
npm run dev
```

Production build / serve:

```bash
npm run build
npm run start
```

> On Windows, the build/dev scripts force Webpack to avoid Turbopack's native-binding requirement.

## Required environment variables

| Variable | Purpose | Where to get it |
|---|---|---|
| `REDIS_URL` | Trip persistence. Use `rediss://...` for TLS. | [Upstash](https://upstash.com) free tier — 500 K commands/month |
| `AERODATABOX_API_KEY` | Flight-number lookup | [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) free tier |
| `OWNER_TOKEN` | Edit-access gate; without it, visitors get a read-only sanitized view | Generate any random string. `node -e "console.log('vp-'+require('crypto').randomBytes(16).toString('hex'))"` |

Put them in `.env.local` for local dev, and into your deployment platform's env-var settings for production. If `OWNER_TOKEN` is unset the app runs fully open (dev-only convenience).

## Deploy on Render

Render auto-deploys on push when connected to a GitHub repo. Settings:

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Add `REDIS_URL`, `AERODATABOX_API_KEY`, and `OWNER_TOKEN` to the service's Environment tab.

`render.yaml` in this repo declares the service for [Render Blueprints](https://render.com/docs/blueprint-spec).

## API surface

All endpoints are under `app/api/`:

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/trip` | GET / PUT / DELETE | Read or replace the full `{ days, ideas }` blob. PUT/DELETE require the owner token; GET sanitizes for non-owners. |
| `/api/auth/check` | GET | Returns `{ ok, configured }` based on the supplied token. Used by the UI to validate sign-in. |
| `/api/flights/lookup` | GET `?number=XX123&date=YYYY-MM-DD` | Calls AeroDataBox with `dateLocalRole=Departure`. Returns airline, airports, coords, times, and arrivalDate when overnight. |
| `/api/places/lookup` | GET `?url=<encoded Google Maps URL>` | Follows redirects, parses `/place/<name>/`, `!3d!4d`, and `@lat,lng`, then reverse-geocodes via Nominatim for address + phone. Snaps to the nearest known trip city for the `location` field. |

## Project layout

```
app/
  api/
    trip/route.js               — Redis read/write with sanitization + auth
    auth/check/route.js         — token validation
    flights/lookup/route.js     — AeroDataBox proxy
    places/lookup/route.js      — Maps URL parser + Nominatim reverse-geocode
  components/
    Nav.js                      — sticky top nav with Sign in/out
    useTripData.js              — read-only trip fetch hook for view pages
  lib/
    auth.js                     — owner-token storage + authFetch wrapper
    trip-utils.js               — item categories, sort helpers, date formatting
  itinerary/page.js             — timeline view
  transportation/page.js        — bookings list
  accommodations/page.js        — bookings list
  events/page.js                — dinners + excursions list
  page.js                       — Planning page (editor)
  layout.js                     — root layout (Nav + theme)
  globals.css                   — theme variables, category colors, responsive rules
```
