# Feeds & Speeds Workbench Handoff

Date: 2026-07-20

## Project Location

Local folder:

```text
C:\Users\grime\Desktop\Projects\Feeds and Speeds Workbench
```

GitHub repo:

```text
https://github.com/joseph24gk/feeds-speeds-workbench
```

GitHub Pages URL:

```text
https://joseph24gk.github.io/feeds-speeds-workbench/
```

Cloudflare Worker URL:

```text
https://feeds-speeds-workbench-api.kelso.workers.dev
```

## What Happened

The project started from Claude Code's `feeds-speeds-workbench.jsx`, which had the preferred visual design and core app behavior. Codex first made a separate static rebuild, but the user preferred Claude's UI. We then abandoned the Codex-made frontend and ported Claude's JSX into this project as the frontend source of truth.

The current frontend is React + Vite:

```text
src/App.jsx
src/main.jsx
index.html
vite.config.js
```

Claude's embedded CSS and component structure are preserved in `src/App.jsx`. Only deployment-safe plumbing was changed:

- `window.storage` was replaced with browser `localStorage`.
- Direct browser-side Anthropic calls were replaced with Worker API calls.
- The app now calls `/api/tool-lookup` and `/api/curve-digitize` through `VITE_API_BASE`.

## API / Worker

The Worker lives here:

```text
worker/index.js
wrangler.jsonc
```

It supports both providers:

- If `OPENAI_API_KEY` exists, it uses OpenAI.
- Else if `ANTHROPIC_API_KEY` exists, it uses Anthropic.

The user deployed the Worker and set `ANTHROPIC_API_KEY` via:

```powershell
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Important: an earlier Anthropic key was shown in a screenshot/terminal. Treat that exposed key as compromised and revoke it if not already done.

## Current Status

Completed:

- Local project folder created.
- Git repo initialized.
- GitHub repo created and pushed.
- GitHub Pages enabled.
- GitHub repo variable `VITE_API_BASE` set to:

  ```text
  https://feeds-speeds-workbench-api.kelso.workers.dev
  ```

- Cloudflare Worker deployed.
- Worker JSON error handling fixed so async API errors no longer show only Cloudflare `1101`.
- Worker endpoint was tested and returned JSON successfully.

Known issue found after deployment:

- GitHub Pages initially showed a blank page because Vite built assets as root-relative paths like `/assets/index...js`.
- Fix added in `vite.config.js`:

  ```js
  export default defineConfig({
    base: "/feeds-speeds-workbench/",
  });
  ```

After this fix, rebuild and rerun the Pages workflow.

## Useful Commands

Local frontend:

```powershell
npm install
npm run dev
```

Local preview of production build:

```powershell
npm run build
npm run preview
```

Deploy Worker:

```powershell
npx wrangler deploy
```

Set Worker secret:

```powershell
npx wrangler secret put ANTHROPIC_API_KEY
# or
npx wrangler secret put OPENAI_API_KEY
```

Set GitHub frontend API base:

```powershell
gh variable set VITE_API_BASE --repo joseph24gk/feeds-speeds-workbench --body "https://feeds-speeds-workbench-api.kelso.workers.dev"
```

Run Pages workflow manually:

```powershell
gh workflow run pages.yml --repo joseph24gk/feeds-speeds-workbench --ref main
gh run watch --repo joseph24gk/feeds-speeds-workbench
```

Test Worker lookup:

```powershell
curl.exe -X POST "https://feeds-speeds-workbench-api.kelso.workers.dev/api/tool-lookup" -H "Content-Type: application/json" --data "{`"brand`":`"Harvey`",`"pn`":`"987362`"}"
```

## Notes For Next Agent

- The user wants Claude Code's look exactly, not a redesign.
- Do not reintroduce the Codex static rewrite UI.
- Keep API keys out of the frontend and GitHub repo.
- The frontend may be public; secrets must live in Cloudflare Worker secrets.
- If lookup fails, tail Worker logs:

  ```powershell
  npx wrangler tail feeds-speeds-workbench-api --format json --status error
  ```

- If GitHub Pages is blank, inspect `dist/index.html` and confirm asset URLs start with `/feeds-speeds-workbench/assets/...`.
