# Feeds & Speeds Workbench

This project now uses the Claude Code workbench UI as the frontend source of truth.

- Frontend: React + Vite in `src/App.jsx`
- Design: Claude's embedded "machine enamel" / DRO styling from the original JSX
- Storage: browser `localStorage`
- AI backend: Cloudflare Worker in `worker/index.js`
- Static share target: GitHub Pages publishing the Vite `dist` output

## Local frontend

```powershell
cd "C:\Users\grime\Desktop\Projects\Feeds and Speeds Workbench"
npm install
npm run dev
```

Open <http://127.0.0.1:8766/>.

## AI features

The browser app calls:

- `POST /api/tool-lookup`
- `POST /api/curve-digitize`

Those endpoints are implemented by the Cloudflare Worker so API keys are never exposed in the browser. The Worker can use either provider:

- If `OPENAI_API_KEY` is set, it uses OpenAI.
- Else if `ANTHROPIC_API_KEY` is set, it uses Anthropic.
- If neither is set, lookup and PDF/image digitizing will fail until a key is added.

For local Worker testing:

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars

npx wrangler dev
```

If the Worker is not on the same origin as the frontend, set the frontend API base:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Then restart `npm run dev`.

## Deploy the Worker

```powershell
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
# or:
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Copy the deployed Worker URL.

## Deploy frontend to GitHub Pages

1. Create a GitHub repo, for example `feeds-speeds-workbench`.
2. Set `VITE_API_BASE` for the deployed Worker before building:

   ```powershell
   @"
   VITE_API_BASE=https://feeds-speeds-workbench-api.<your-subdomain>.workers.dev
   "@ | Set-Content -LiteralPath ".env.production"
   ```

3. Build the static frontend:

   ```powershell
   npm run build
   ```

4. Publish `dist` to GitHub Pages.

The simplest durable route is a GitHub Actions workflow that builds Vite and uploads `dist` as the Pages artifact. If publishing manually, only publish the contents of `dist`, not `.env`, `.dev.vars`, or source secrets.

## Coworker rollout

1. Deploy the Worker.
2. Deploy the frontend to GitHub Pages with `VITE_API_BASE` pointing at the Worker.
3. Tune your machine and tool library.
4. Use Export to download `shop-data.json`.
5. Send coworkers the Pages URL plus the starter `shop-data.json`.
6. Coworkers open the app, click Import, and select the starter JSON.

Each coworker has their own browser-local data. Send a new export whenever shop defaults change.
