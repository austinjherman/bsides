# Lyrics Journal

A private, journal-style place to write lyrics. It runs as one Cloudflare Worker, stores entries in D1, and is protected by a password.

- Autosaves while you type (Ctrl/Cmd+S saves right away)
- Searches across titles and lyrics
- Shows line and word counts
- Works on phones, and follows your system's dark mode

## Deploy (one time)

```bash
npm install
npx wrangler login
npx wrangler d1 create lyrics-journal      # copy the database_id it prints into wrangler.toml
npm run db:init                            # creates the table
npx wrangler secret put PASSWORD           # pick the password you'll log in with
npm run deploy
```

Wrangler then prints your URL (`https://lyrics-journal.<you>.workers.dev`).

## Run locally

```bash
npm run db:init:local
npm run dev        # http://localhost:8787, password "dev" (set in .dev.vars)
```

## Files

- `src/index.js`: the Worker (login and the entries API)
- `public/`: the journal UI (plain HTML, CSS and JS, no build step)
- `schema.sql`: the D1 table
