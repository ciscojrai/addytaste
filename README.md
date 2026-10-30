# AddyTaste

Paste what someone said they like (a text, an email, or a screenshot of a chat) and get a place, a gift brand and a backup plan for the occasion, ranked by Qloo's taste data. Built for the Qloo Agentic Hackathon. Not an official Qloo product; no Qloo logos or assets are used.

- **Read**: Gemini pulls out likes and avoids. Every text-sourced item must carry an exact quote from what was pasted; invented ones are dropped. You can toggle each chip.
- **Rank**: Qloo returns places, gift brands and films that fit the combination, plus the taste tags behind it. Gemini writes a short "Predictive inference" paragraph, and a highlight is kept only if its tag is one Qloo returned.
- **Chats**: any topic, "+ New chat", rename with the pencil or a double-click. Each chat keeps its likes, avoids, city and White Elephant group, and one result per occasion (Mother's Day, Birthday, Holidays / Christmas, Anniversary, Date night, Valentine's, Father's Day, White Elephant at Work $20-30, Friends $25-40, Family $25-50). A new occasion starts with the chips already loaded. A follow-up message adds or removes chips and re-runs the current occasion. Each chat shows a "Last time" line, and earlier gift brands are left out of the new result.
- **Likes**: a heart on any card saves it to the sidebar's Likes tab, linked to its chat.
- **Privacy**: pasted text and screenshots are processed in memory and never saved. Browser storage (`addytaste.chats.v2`, `addytaste.likes.v2`) keeps only chips with their quotes, result cards and notes.

## How Qloo is used

All calls are server-side GET requests to `https://hackathon.api.qloo.com` with the key in the `X-Api-Key` header (`server/qloo.ts`).

| Call | Used for |
| --- | --- |
| `/search` (`types=urn:entity:artist`, `movie`, `brand`, ...) | Turn a liked artist, film, brand or person into an entity id. A hit must look like what was said. |
| `/v2/tags` (`filter.parents.types=urn:entity:place`) | Turn a hobby, food or generic place ("gardening", "brunch") into a place tag id; also the avoid tags. |
| `/v2/insights` `filter.type=urn:entity:place` | The place pick: `signal.interests.entities`, `signal.interests.tags`, `filter.exclude.tags` (+ `operator.filter.exclude.tags=union`), `filter.location.query`, `filter.price_level.max`, `feature.explainability=true`. |
| `/v2/insights` `filter.type=urn:entity:brand` | The gift brand, with `filter.exclude.entities` set to gift brands already suggested for this chat (real Qloo ids), so a gift does not repeat. |
| `/v2/insights` `filter.type=urn:entity:movie` | The backup plan (movie night in). |
| `/v2/insights` `filter.type=urn:tag` | The taste tags behind the Predictive inference panel. |

Qloo's explainability scores decide which liked item a pick is credited to ("Because you like ..."). If a Qloo call fails or times out (25 s), that piece falls back to clearly labeled sample data (`[sample]` names, a Sample tag, and a "Part sample data" or "Sample data, not real Qloo" badge). Sample data is never shown as real. The badge reads "Live Qloo data" only when every pick on screen came from Qloo.

## How Gemini is used

Gemini REST (no SDK, `server/gemini.ts`, temperature 0, JSON-schema output) does three jobs: **read** likes and avoids from pasted text or a screenshot, **update** a chat's chips from a follow-up message, and **compose** the inference paragraph and the copy for the three picks from Qloo's candidates only. Models are raced down a fallback chain; if Gemini is unavailable the app shows a labeled template paragraph built from Qloo tags. Guardrails live in `server/pipeline.ts`: exact-quote check, picks must be Qloo candidates, avoids are filtered here too, Work-safe mode drops bars and alcohol, and a gift price outside the White Elephant budget is never shown.

## Run it

```bash
npm install
cp .env.example .env     # then fill in GEMINI_API_KEY and QLOO_API_KEY
npm run dev              # http://127.0.0.1:5180   (/demo is the how-it-works page)
npm run typecheck
npm test
npm run build
```

Environment variables (names only; values never go in the repo):

| Name | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Qloo hackathon key. Without it the app runs on labeled sample data only. |
| `GEMINI_API_KEY` | Gemini key for read, update and compose. |
| `STAY22_AID` | Stay22 affiliate id for the "Stay nearby" links. Defaults to `newaddy`. |
| `QLOO_BASE_URL` | Optional. Defaults to `https://hackathon.api.qloo.com`. |
| `GEMINI_MODEL`, `GEMINI_HEDGE_MS`, `GEMINI_TOTAL_MS` | Optional Gemini tuning. |
| `QLOO_LOG_FILE` | Optional. Appends one line per Qloo call (endpoint, params, status, result count, ms). The key is scrubbed. |

The same handler (`server/api.ts`) serves `/api/*` in the Vite dev server and as a Netlify Function (`netlify/functions/api.mts`, see `netlify.toml`). Set the env vars as site environment variables on Netlify.

## Sample data

With no `QLOO_API_KEY` (or when a live call fails) the server reads fake JSON from a gitignored `.samples/qloo/` folder if present. It is not in this repo, so a deployment without it returns an error instead of sample results when Qloo is down. Three starter chats named "Sample · ..." are seeded in an empty browser.

## Layout

| Piece | Where |
| --- | --- |
| Page, chat panel, chips, cards, map | `src/` (React, Vite, Leaflet) |
| Chat model, storage and migration | `src/lib/chats.ts`, `src/lib/likes.ts` |
| Occasions and budgets | `src/lib/occasions.ts` |
| Qloo client and exact request shapes | `server/qloo.ts` |
| Gemini client | `server/gemini.ts` |
| Read, resolve, rank, filter, compose | `server/pipeline.ts` |
| Tests and Qloo response fixtures (made-up names, real shapes) | `test/` |

## License

MIT. See `LICENSE`.

## Demo page

`/demo` has a hero, a 3-step explainer, four `<video controls>` slots and a plain "Built on Qloo" section. Drop recordings in `public/clips/` (see the README there).
