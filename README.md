# B-Sides

A private, journal-style place to write lyrics. It runs as one Cloudflare Worker, stores entries in D1, and is protected by a password.

- Autosaves while you type (Ctrl/Cmd+S saves right away)
- Searches across titles and lyrics
- Shows line and word counts
- Works on phones, and follows your system's dark mode

## Deploy with Cloudflare + GitHub (auto-deploys on every push)

1. In the Cloudflare dashboard, open **Workers & Pages → Create → Import a repository**.
2. Connect GitHub, then pick this repo. Keep the defaults (deploy command `npx wrangler deploy`) and click **Deploy**.
   The D1 database is created automatically on the first deploy, and the table is created on first use.
3. Open the new Worker's **Settings → Variables and Secrets**. Add a **Secret** named `PASSWORD` with the password you want, then save.
4. Visit `https://bsides.<your-subdomain>.workers.dev` and log in.

## Or deploy from your computer

```bash
npm install
npx wrangler login
npx wrangler secret put PASSWORD
npm run deploy
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:8787, password "dev" (create .dev.vars with PASSWORD=dev)
```

## Files

- `src/index.js`: the Worker (login, the entries API, and table setup)
- `public/`: the journal UI (plain HTML, CSS and JS, no build step)
