# AddyTaste (aistudio-newaddy)

A newaddy-style chat for the Qloo Agentic Hackathon. Paste what someone said they like, or attach a screenshot. It reads likes and avoids, lets you toggle each one, and rewrites a live "Predictive inference" paragraph from the tags Qloo returns. Below it sit three picks: a place (with a small map and a Stay22 link), a gift brand and a backup plan. Each result is saved into that person's chat thread (for example "Mom, birthday") in your browser's localStorage. Tap the heart on any place, gift or backup card to save it to the sidebar's Likes tab (stored with its chat name; tapping a liked item opens that chat).

Not an official Qloo product. No Qloo logos or assets are used.

## Run it

```bash
npm install
cp .env.example .env     # then add GEMINI_API_KEY (and QLOO_API_KEY when you have it)
npm run dev              # http://127.0.0.1:5180   (the /demo page is at /demo)
npm run typecheck
npm test
npm run build
```

Keys are read on the server only (`/api/*`). `.env` is gitignored.

## How it works

| Piece | Where |
| --- | --- |
| Page, chips, inference panel, cards, map | `src/` (React, Vite, Leaflet) |
| Occasions and budgets (Work $20-30, Friends $25-40, Family $25-50) | `src/lib/occasions.ts` |
| Qloo client and exact request shapes | `server/qloo.ts` |
| Reader and writer (Gemini REST, model fallback chain) | `server/gemini.ts` |
| Read, resolve, rank, filter, compose | `server/pipeline.ts` |
| One handler for `/api/status`, `/api/read`, `/api/insight` | `server/api.ts` (Vite dev middleware and `netlify/functions/api.mts`) |

Qloo calls (all GET, `X-Api-Key` header, base `https://hackathon.api.qloo.com`):

- `/search` and `/v2/tags` turn each like into an entity id or a tag id.
- `/v2/insights` with `filter.type` of `urn:entity:place`, `urn:entity:brand`, `urn:entity:movie` and `urn:tag`, `signal.interests.entities`, `signal.interests.tags`, `filter.exclude.tags` (+ `operator.filter.exclude.tags=union`), `filter.location.query`, `filter.price_level.max`, `feature.explainability=true`.

Guardrails: text quotes must be exact substrings of what was pasted; a highlight in the Predictive inference is kept only if its tag is one Qloo returned; picks must be Qloo candidates; avoids are filtered on our side too; Work-safe mode drops bars and alcohol; a gift price outside the White Elephant budget is never shown.

## Sample data until the Qloo key lands

With no `QLOO_API_KEY` the server reads clearly fake JSON from `.samples/qloo/` and the page shows a "Sample data, Qloo key pending" badge. Sample names start with `[sample]`, every card carries a Sample tag, and sample map pins are placed around the city with a "not real places" caption. `.samples/` is gitignored, so sample data cannot be committed by accident. Put a key in `.env` and the app switches to live data on the next request.

## Privacy

Pasted text and screenshots are processed in memory and never saved. A saved run keeps the chips (item plus quote) and the result, in this browser only. A liked card keeps only the card itself and its chat name.

## Demo page

`/demo` has a hero, a 3-step explainer, four `<video controls>` slots and a plain "Built on Qloo" section. Drop recordings in `public/clips/` (see the README there).
