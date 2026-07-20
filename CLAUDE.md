# Feeds & Speeds Workbench

CNC machining feeds-and-speeds calculator. Manufacturer cutting data when available,
physics fallback tables always. Built for shop-floor use.

## Hard rules

1. **Do not redesign or restyle the UI.** The visual design is Claude's original
   "machine enamel + DRO" styling, kept deliberately. It lives in the `CSS` template
   literal at the bottom of `src/App.jsx`. Change it only when explicitly asked.
   An earlier Codex static rewrite was rejected — do not reintroduce it.
2. **API keys never touch the frontend or the repo.** All AI calls go through the
   Cloudflare Worker, which holds the key as a Worker secret. Never add a provider
   key to `.env`, `src/`, or anything committed. The frontend bundle is public.
3. All internal math is **inch**. Metric is a display layer only.

## Architecture

```
Browser (GitHub Pages, static)
  src/App.jsx          single-file React app, all logic + embedded CSS
  localStorage         key "fsw:data:v1" — machines, tools, unit pref
       |
       |  POST {VITE_API_BASE}/api/tool-lookup
       |  POST {VITE_API_BASE}/api/curve-digitize
       |  POST {VITE_API_BASE}/api/machine-curves
       v
Cloudflare Worker (worker/index.js)
  holds ANTHROPIC_API_KEY (or OPENAI_API_KEY) as a Worker secret
  prefers OpenAI if OPENAI_API_KEY is set, else Anthropic
       |
       v
  Anthropic Messages API (web_search tool / PDF + image vision)
```

No database, no user accounts. Each user's library is browser-local; sharing happens
via Export/Import of `shop-data.json`.

## URLs

| What | Where |
|---|---|
| Repo | https://github.com/joseph24gk/feeds-speeds-workbench |
| Live app | https://joseph24gk.github.io/feeds-speeds-workbench/ |
| Worker API | https://feeds-speeds-workbench-api.kelso.workers.dev |

## Commands

```powershell
npm install
npm run dev                 # http://127.0.0.1:8766
npm run build ; npm run preview

npx wrangler deploy                       # deploy Worker
npx wrangler secret put ANTHROPIC_API_KEY # set the key (never commit it)
npx wrangler dev                          # local Worker, needs .dev.vars
npx wrangler tail feeds-speeds-workbench-api --format json --status error

# Frontend deploy is MANUAL — pushing to main does not update the live site.
gh workflow run pages.yml --repo joseph24gk/feeds-speeds-workbench --ref main
gh run watch --repo joseph24gk/feeds-speeds-workbench
```

`VITE_API_BASE` is a GitHub repo **variable** read at build time by `.github/workflows/pages.yml`.
`vite.config.js` must keep `base: "/feeds-speeds-workbench/"` or Pages serves a blank page.

## Feature checklist

**Calculator** — material (ISO group) is the *primary* filter and hides tools not rated
for the selected group; ISO 513 group colors; chip-thinning compensation for adaptive
toolpaths; spindle-load bar (green/amber/red) that knows continuous vs burst ratings;
spindle/belt config chips when a machine has >1 continuous curve (config can carry its
own max RPM — low belt clamps lower); RPM clamped to machine/config max; named presets
saved per tool (params + result snapshot, applied without being clobbered by the
reseed effect — see `skipSeed`). The chatter/deflection advisory was REMOVED on
purpose (2026-07-20, user request, backburnered — see Todoist backlog; old code in git
history at 27809bf). Don't reintroduce it uninvited.

**Machines** — add/edit/delete; each machine holds an ARRAY of curves
(`{id,label,duty:"continuous"|"burst",maxRpm,points,srcName,forId?}`): duty ratings
(S1 vs 30-min burst), belt/gear ranges, or separate spindles (lathe main vs live
tooling). Burst curves apply to the continuous config in `forId`, or any config when
unset. Curve sources: CSV (2nd column HP/kW/ft-lb/Nm), AI digitization of a
PDF/screenshot, or AI *web search* (`/api/machine-curves`) that finds the published
curves by machine name — all three land in review cards before anything saves.
Curves attach in the add/edit form (before the machine exists) or per-row. Legacy
single-`curve` machines migrate on load via `migrateMachine()`.

**Tools** — AI lookup by brand + part number; sequential lookup queue with progress bar
(one web search at a time, results stack below for review); results-review cards before
anything is saved; Fusion `.tools` import (zip parsed in-browser) with importable/skipped
preview; multi-select with bulk lookup and bulk delete; sortable + filterable list
(type/brand/diameter/data source); manual add/edit; `series` display-name field.

**Tool types** — square endmill, ball endmill, chamfer mill (included angle + tip diameter,
RPM on effective diameter), drill (feed per rev), tap (feed locked to thread pitch).

**Metric-tool hybrid** — the `metricTool` flag makes callouts render in mm (`8.5 mm`,
`M10×1.5`) while all feeds and speeds stay in imperial programming units.

**App level** — localStorage persistence (debounced 400 ms), global inch/mm toggle,
Export/Import of `shop-data.json` for sharing a library with coworkers (duplicates skipped);
full-browser-width layout (no max-width; Calculator goes two-column with a sticky DRO
at ≥1180px; LOC/Coating table columns hide under 900px via `.wide-col`); brand favicons
via Google's s2 favicon service (domain map in `BRAND_DOMAINS`, hidden on load failure)
and tool-type glyphs embedded as MDI (Apache-2.0) SVG paths in `TYPE_ICON_PATHS`.

## Gotchas

- Tool lookup takes ~90 s per tool (web search + reasoning). The sequential queue is
  intentional; bulk lookups of large selections take a long while. Machine curve
  search (`/api/machine-curves`) runs 1–3 min.
- The Worker calls both providers with `stream: true` and accumulates SSE text
  deltas, retrying transient upstream failures (524/529/5xx…). This is the fix for
  buffered responses dying at ~100 s behind Cloudflare with a plain-text
  "error code: 524" page that crashed `response.json()`. Don't switch back to
  non-streaming calls.
- With `?stream=1`, tool-lookup and machine-curves return an SSE stream of real
  progress milestones (web search #, reading results, chars written, retry
  attempts) translated from provider events, then a final result event — consumed
  by `apiStream()` in the frontend and shown with an elapsed timer. Plain POST
  (no query param) still returns buffered JSON.
- All three tabs stay MOUNTED (hidden via display:none in `App`) so the lookup
  queue and AI curve searches keep running while the user navigates. Don't switch
  back to conditional rendering.
- Tool-type icons are original hand-drawn SVG silhouettes in `TYPE_ICONS` — the
  user rejected MDI screw glyphs ("look like bolts"). Verify icon changes by
  rasterizing with sharp (in node_modules); Browser-pane screenshots time out in
  this dev environment.
- The Worker's prompts are **load-bearing and deliberately verbose** — they were restored
  from the original artifact after the port condensed them. Do not "tidy" them. In
  particular keep: the ISO group-code legend (the model needs it to file cutting rows in
  the right group), the `series` field constraint (short family name only — `series` is
  what `toolLabel()` renders as the tool's display name everywhere), the taps/metric
  conversion notes, and the "don't invent groups / don't fill placeholder numbers" rules.
- Worker CORS is `Access-Control-Allow-Origin: *` with no auth — the endpoint is an open
  proxy to a paid API.
- `.tools` unzip uses `DecompressionStream("deflate-raw")` — browser-only, no polyfill.
