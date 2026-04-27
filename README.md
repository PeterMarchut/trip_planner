# Vacation Planner

A Next.js app for planning vacations day by day with an interactive map. Trip state persists to a Redis database (Upstash by default), with localStorage as an offline cache.

## Features

- Day-by-day itinerary with chronological list per day
- Interactive Leaflet map showing locations and transport routes (flights, ferries, day-travel)
- Itinerary item types: flights, ferries, car rentals, accommodations, dinners, excursions — each with optional booking vendor + confirmation number
- Multi-night accommodations auto-extend the trip and render contextually (check-in / staying-at / check-out) on the right days
- Flight lookup by flight number + local date via the AeroDataBox API (auto-fills airline, airports, times, coords)
- Activity Ideas list with location-based filtering on each day
- Transportation-unconfirmed warning on days that have items but no car rental
- Server-backed persistence (Redis) + offline localStorage cache + sync status indicator

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in the keys (see below)
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
| `REDIS_URL` | Where trip data is stored. Use `rediss://...` for TLS. | [Upstash](https://upstash.com) free tier — 500 K commands/month |
| `AERODATABOX_API_KEY` | Flight-number lookup | [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) free tier |

Put them in `.env.local` for local dev, and into your deployment platform's env-var settings for production.

## Deploy on Render

Render auto-deploys on push when connected to a GitHub repo. Settings:

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Add `REDIS_URL` and `AERODATABOX_API_KEY` to the service's Environment tab.

`render.yaml` in this repo declares the service for [Render Blueprints](https://render.com/docs/blueprint-spec).
