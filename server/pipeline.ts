// The two steps behind the page: read (Gemini reads text or a screenshot) and insight (Qloo + Gemini).
import type { Category, InferenceSegment, InsightResult, Pin, ReadResult, ResultCard, Taste } from '../src/lib/types';
import { resolveOccasion, type OccasionContext } from '../src/lib/occasions';
import { stay22Link } from '../src/lib/stay22';
import { filterByAvoids, isWorkSafeEntity, norm } from './filter';
import { SAMPLE_PREFIX, type InsightType, type QlooClient, type QlooEntity, type QlooTag } from './qloo';
import { revalidate, validateTastes } from './quotes';
import type { createGemini } from './gemini';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Gemini = ReturnType<typeof createGemini>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ENTITY_CATS = new Set<Category>(['artist', 'movie', 'tv_show', 'place', 'brand', 'book', 'person']);
const MAX_TEXT = 4000;
const MAX_IMAGE_B64 = 6_000_000; // about 4.5 MB of image
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

export function cleanText(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT) : '';
}

// ---------- Step 1: read ----------
export async function runRead(body: Json, gemini: Gemini): Promise<ReadResult> {
  const ctx = resolveOccasion(String(body.occasion ?? ''), body.group);
  if (!ctx) throw new HttpError(400, 'Pick an occasion first (and who the White Elephant is with).');
  if (!gemini.available) throw new HttpError(503, 'Gemini key is missing on the server.');
  const text = cleanText(body.text);
  const image = body.image as { mime?: string; data?: string } | undefined;
  let raw: Json;
  if (image?.data) {
    if (!IMAGE_MIME.has(String(image.mime))) throw new HttpError(400, 'Attach a PNG, JPEG or WebP screenshot.');
    if (image.data.length > MAX_IMAGE_B64) throw new HttpError(413, 'That image is too large. Try a smaller screenshot.');
    raw = await gemini.read({ image: { mime: String(image.mime), data: image.data }, hint: ctx.def.readerHint }).catch(failRead);
    const likes = validateTastes(null, raw.likes);
    const avoids = validateTastes(null, raw.avoids);
    return finishRead(likes, avoids, 'image');
  }
  if (!text) throw new HttpError(400, 'Paste some text or attach a screenshot.');
  raw = await gemini.read({ text, hint: ctx.def.readerHint }).catch(failRead);
  return finishRead(validateTastes(text, raw.likes), validateTastes(text, raw.avoids), 'text');
}
function failRead(): never { throw new HttpError(502, 'The reader is busy right now. Try again in a moment.'); }
function finishRead(likes: { kept: Taste[]; dropped: number }, avoids: { kept: Taste[]; dropped: number }, sourceKind: 'text' | 'image'): ReadResult {
  // An item both liked and avoided is ambiguous: drop it from likes.
  const avoidKeys = new Set(avoids.kept.map((a) => norm(a.item)));
  const keptLikes = likes.kept.filter((l) => !avoidKeys.has(norm(l.item)));
  return { likes: keptLikes.slice(0, 12), avoids: avoids.kept.slice(0, 8), dropped: likes.dropped + avoids.dropped + (likes.kept.length - keptLikes.length), sourceKind };
}

// ---------- Step 2: insight ----------
export interface InsightDeps { qloo: QlooClient; gemini: Gemini; stay22Aid: string }

const uniq = <T,>(a: T[]) => [...new Set(a)];
const stripSample = (s: string) => (s.startsWith(SAMPLE_PREFIX) ? s.slice(SAMPLE_PREFIX.length) : s);
const sameName = (a: string, b: string) => norm(stripSample(a)) === norm(stripSample(b));

export async function runInsight(body: Json, deps: InsightDeps): Promise<InsightResult> {
  const ctx = resolveOccasion(String(body.occasion ?? ''), body.group);
  if (!ctx) throw new HttpError(400, 'Pick an occasion first (and who the White Elephant is with).');
  const text = typeof body.text === 'string' && body.text ? cleanText(body.text) : null;
  const likes = revalidate(text, body.likes).slice(0, 8);
  const avoids = revalidate(text, body.avoids).slice(0, 6);
  if (!likes.length) throw new HttpError(400, 'Turn on at least one like. Qloo ranks by taste fit, so it needs something to start from.');
  const city = String(body.city ?? '').trim().slice(0, 80);
  const { qloo } = deps;

  // 1. Resolve names to Qloo ids.
  const entityIds: string[] = [];
  const tagIds: string[] = [];
  const seedLike = new Map<string, Taste>();
  await Promise.all(
    likes.map(async (like) => {
      const entityFirst = ENTITY_CATS.has(like.category);
      const [ent, tag] = await Promise.all([
        entityFirst ? qloo.search(like.item, like.category).catch(() => null) : Promise.resolve(null),
        entityFirst ? Promise.resolve(null) : qloo.findTag(like.item).catch(() => null),
      ]);
      if (ent) { entityIds.push(ent.id); seedLike.set(ent.id, like); return; }
      if (tag) { tagIds.push(tag.id); return; }
      const late = entityFirst ? await qloo.findTag(like.item).catch(() => null) : await qloo.search(like.item, like.category).catch(() => null);
      if (late && entityFirst) tagIds.push(late.id);
      else if (late) { entityIds.push(late.id); seedLike.set(late.id, like); }
    }),
  );
  const excludeTagIds: string[] = [];
  await Promise.all(avoids.map(async (a) => { const t = await qloo.findTag(a.item).catch(() => null); if (t) excludeTagIds.push(t.id); }));
  if (!entityIds.length && !tagIds.length) throw new HttpError(502, 'Qloo could not match any of those likes. Try a different one.');

  // 2. Four insight calls in parallel.
  const base = { entityIds, tagIds, excludeTagIds };
  const call = (type: InsightType, extra: Partial<Parameters<QlooClient['insights']>[0]> = {}) =>
    qloo.insights({ type, ...base, ...extra }, ctx.key).catch((e: Error) => ({ entities: [] as QlooEntity[], tags: [] as QlooTag[], error: e.message }));
  const [tagRes, placeRes, brandRes, movieRes] = await Promise.all([
    call('tag', { take: 12 }),
    city ? call('place', { city, priceMax: ctx.placePriceMax, take: 12 }) : Promise.resolve({ entities: [] as QlooEntity[], tags: [] as QlooTag[] }),
    call('brand', { take: 12 }),
    call('movie', { take: 10 }),
  ]);

  // 3. Our own filters on top: avoids, Work-safe, and never echo a seed back as a pick.
  const filteredOut: { name: string; because: string }[] = [];
  const clean = (list: QlooEntity[]) => {
    const { kept, removed } = filterByAvoids(list, avoids);
    filteredOut.push(...removed);
    return kept
      .filter((e) => !likes.some((l) => sameName(l.item, e.name)))
      .filter((e) => {
        if (!ctx.workSafe || isWorkSafeEntity(e)) return true;
        filteredOut.push({ name: e.name, because: 'not work-safe' });
        return false;
      });
  };
  const places = clean(placeRes.entities);
  const brands = clean(brandRes.entities);
  const movies = clean(movieRes.entities);
  if (!places.length && !brands.length && !movies.length) throw new HttpError(502, 'Qloo returned nothing for that mix. Turn another like on, or check the city.');

  // 4. Tags for the Predictive inference: Qloo's tag call, else the tags on the entities it returned.
  let tags = tagRes.tags.map((t) => t.name);
  const viaTagCall = tags.length > 0;
  if (!viaTagCall) {
    const freq = new Map<string, number>();
    for (const e of [...places, ...brands, ...movies]) for (const t of e.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
    tags = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }
  tags = uniq(tags).filter((t) => !avoids.some((a) => norm(t) === norm(a.item))).slice(0, 10);
  const allowedTags = uniq([...tags, ...places.slice(0, 5).flatMap((e) => e.tags.slice(0, 3)), ...brands.slice(0, 5).flatMap((e) => e.tags.slice(0, 3)), ...movies.slice(0, 4).flatMap((e) => e.tags.slice(0, 2))]).slice(0, 40);

  // 5. Gemini writes the paragraph and the picks, from those candidates only.
  const cand = (l: QlooEntity[]) => l.slice(0, 6).map((e) => ({ name: e.name, tags: e.tags.slice(0, 5) }));
  let composed: Json | null = null;
  try {
    if (deps.gemini.available) {
      composed = await deps.gemini.compose({
        occasion: ctx.def.label + (ctx.group ? ` (${ctx.group})` : ''),
        budget: ctx.budget?.label ?? null,
        workSafe: ctx.workSafe,
        city,
        likes: likes.map((l) => ({ item: l.item, quote: l.quote })),
        avoids: avoids.map((a) => a.item),
        allowedTags,
        candidates: { place: cand(places), brand: cand(brands), movie: cand(movies) },
      });
    }
  } catch { composed = null; }

  const segments = composed ? validSegments(composed.segments, allowedTags) : [];
  const fallback = !composed || !segments.length;
  const finalSegments = fallback ? templateSegments(tags) : segments;

  const cards: ResultCard[] = [];
  const mk = (kind: ResultCard['kind'], label: string, list: QlooEntity[], pick: Json | undefined): ResultCard | null => {
    if (!list.length) return null;
    const chosen = list.find((e) => pick?.name && sameName(e.name, String(pick.name))) ?? list[0];
    const like = likeFor(chosen, seedLike, likes, pick?.because_like);
    const card: ResultCard = {
      kind,
      label,
      name: chosen.name,
      tags: chosen.tags.slice(0, 4),
      idea: oneLine(pick?.idea) || defaultIdea(kind, chosen.name, ctx),
      why: oneLine(pick?.why) || `Qloo ties ${stripSample(chosen.name)} to ${chosen.tags.slice(0, 2).join(' and ') || 'what they like'}.`,
      because: like.item,
      quote: like.quote,
      quoteSource: like.source,
      sample: chosen.sample,
    };
    if (kind === 'gift' && ctx.budget) {
      // Gemini is told the budget, but a price in its copy that is outside it is never shown.
      const b = ctx.budget;
      if (!pricesWithin(`${card.idea} ${card.why}`, b)) { card.idea = defaultIdea('gift', chosen.name, ctx); card.why = `Qloo ties ${stripSample(chosen.name)} to ${chosen.tags.slice(0, 2).join(' and ') || 'what they like'}.`; }
    }
    if (kind === 'place') {
      card.address = chosen.address;
      card.lat = chosen.lat;
      card.lon = chosen.lon;
      // Sample places are fake, so the sample link points at the city, not at a made-up name.
      card.stay22 = stay22Link(chosen.sample ? '' : chosen.name, city, deps.stay22Aid);
    }
    return card;
  };
  const place = mk('place', ctx.def.placeLabel, places, composed?.place);
  const gift = mk('gift', ctx.def.giftLabel, brands, composed?.gift);
  const backup = mk('backup', ctx.def.backupLabel, movies, composed?.backup);
  for (const c of [place, gift, backup]) if (c) cards.push(c);

  const pins: Pin[] = places
    .filter((e) => e.lat !== undefined && e.lon !== undefined)
    .slice(0, 6)
    .map((e) => ({ name: e.name, lat: e.lat as number, lon: e.lon as number, primary: !!place && e.name === place.name, sample: e.sample }));

  return {
    runId: String(body.runId ?? ''),
    occasion: ctx.def.id,
    group: ctx.group,
    city,
    budget: ctx.budget,
    workSafe: ctx.workSafe,
    dataSource: qloo.mode,
    inference: { segments: finalSegments, legend: ['Backed by a Qloo tag'], writtenBy: fallback ? 'Template from Qloo tags (Gemini unavailable)' : 'Written by Gemini from Qloo tags', tags, viaTagCall },
    cards,
    pins,
    filteredOut,
    fallback,
  };
}

/** True when every $ amount in the text sits inside the budget. */
export function pricesWithin(text: string, b: { min: number; max: number }): boolean {
  for (const m of text.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)) {
    const v = Number(m[1]);
    if (v < b.min || v > b.max) return false;
  }
  return true;
}

const oneLine = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 220) : '');

function defaultIdea(kind: ResultCard['kind'], name: string, ctx: OccasionContext): string {
  const n = stripSample(name);
  if (kind === 'place') return `Book a table or a spot at ${n}`;
  if (kind === 'gift') return ctx.budget ? `Pick something from ${n} around ${ctx.budget.label}` : `Pick something from ${n}`;
  return `Movie night in: ${n}`;
}

/** Which liked item to credit: Qloo's explainability score first, then Gemini's pick if valid, then the first like. */
function likeFor(e: QlooEntity, seedLike: Map<string, Taste>, likes: Taste[], geminiChoice: unknown): Taste {
  let best: { id: string; score: number } | null = null;
  for (const [id, score] of Object.entries(e.explain)) if (seedLike.has(id) && (!best || score > best.score)) best = { id, score };
  if (best) return seedLike.get(best.id) as Taste;
  const g = typeof geminiChoice === 'string' ? likes.find((l) => norm(l.item) === norm(geminiChoice)) : undefined;
  return g ?? likes[0];
}

/** Keep a highlight only if its tag is one Qloo returned and the phrase contains that tag's words. */
export function validSegments(raw: unknown, allowed: string[]): InferenceSegment[] {
  const allow = new Map(allowed.map((t) => [norm(t), t]));
  const out: InferenceSegment[] = [];
  for (const s of (Array.isArray(raw) ? raw : []) as Json[]) {
    const text = typeof s?.text === 'string' ? s.text : '';
    if (!text) continue;
    const tagKey = norm(s?.tag);
    const real = tagKey ? allow.get(tagKey) : undefined;
    // A highlight is a short phrase that contains the tag's words, not a whole sentence.
    const ok = real && norm(text).includes(tagKey) && text.trim().split(/\s+/).length <= 6;
    out.push(ok ? { text: text.trim(), tag: real } : { text: text.trim() });
  }
  return out.length >= 2 && out.some((s) => s.tag) ? joinPieces(out) : [];
}

/** Put one space between pieces, except before punctuation, so the paragraph reads cleanly. */
export function joinPieces(pieces: InferenceSegment[]): InferenceSegment[] {
  return pieces.filter((p) => p.text).map((p, i, all) => {
    const prev = all[i - 1];
    const needsSpace = !!prev && !/^[.,;:!?)\]]/.test(p.text);
    return { ...p, text: needsSpace ? ' ' + p.text : p.text };
  });
}

export function templateSegments(tags: string[]): InferenceSegment[] {
  const t = tags.slice(0, 4);
  if (!t.length) return [{ text: 'Qloo did not return enough tags to describe this mix yet.' }];
  const segs: InferenceSegment[] = [{ text: 'Together, these tastes lean toward ' }];
  t.forEach((tag, i) => {
    segs.push({ text: tag, tag });
    segs.push({ text: i < t.length - 2 ? ', ' : i === t.length - 2 ? ' and ' : '. ' });
  });
  segs.push({ text: 'The picks below share those qualities.' });
  return segs;
}
