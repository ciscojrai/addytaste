import { describe, expect, it } from 'vitest';
import { handleApi } from '../server/api';
import { createQlooClient, type Fetcher } from '../server/qloo';
import { filterByAvoids, isWorkSafeEntity } from '../server/filter';
import { HttpError, joinPieces, pricesWithin, runInsight, runRead, runUpdate, templateSegments, validSegments } from '../server/pipeline';
import { findExactQuote, validateTastes } from '../server/quotes';
import { resolveOccasion } from '../src/lib/occasions';
import { stay22Link } from '../src/lib/stay22';
import { like, makeSamplesDir } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gem = any;
const gemini = (compose?: unknown): Gem => ({
  available: true,
  compose: async () => { if (!compose) throw new Error('down'); return compose; },
  read: async () => ({ likes: [{ item: 'Frank Ocean', category: 'artist', quote: 'I like Frank Ocean' }, { item: 'Invented', category: 'artist', quote: 'never said this' }], avoids: [{ item: 'country music', category: 'other', quote: 'Not into country music' }] }),
});
const TEXT = 'I like Frank Ocean and gardening. Not into country music.';
const body = (extra: Record<string, unknown> = {}) => ({
  occasion: 'date_night',
  city: 'Chicago',
  text: TEXT,
  likes: [like('Frank Ocean', 'artist', 'I like Frank Ocean'), like('gardening', 'activity', 'gardening')],
  avoids: [like('loud', 'other', 'Not into country music')],
  runId: 'r1',
  ...extra,
});

describe('insight pipeline in sample mode', () => {
  const qloo = () => createQlooClient({ samplesDir: makeSamplesDir() });

  it('labels the result and every card as sample, with a city-only Stay22 link', async () => {
    const r = await runInsight(body(), { qloo: qloo(), gemini: gemini(), stay22Aid: 'newaddy' });
    expect(r.dataSource).toBe('sample');
    expect(r.cards.map((c) => c.kind)).toEqual(['place', 'gift', 'backup']);
    for (const c of r.cards) { expect(c.sample).toBe(true); expect(c.name.startsWith('[sample] ')).toBe(true); }
    const place = r.cards[0];
    expect(place.stay22).toBe('https://www.stay22.com/allez/roam?aid=newaddy&address=Chicago&campaign=addytaste');
    expect(r.pins.length).toBeGreaterThan(0);
    expect(r.pins.every((p) => p.sample)).toBe(true);
    expect(r.runId).toBe('r1');
  });

  it('falls back to a template paragraph (labeled) when Gemini is down, and still returns three cards', async () => {
    const r = await runInsight(body(), { qloo: qloo(), gemini: gemini(), stay22Aid: 'newaddy' });
    expect(r.fallback).toBe(true);
    expect(r.inference.writtenBy).toMatch(/Template from Qloo tags/);
    expect(r.inference.segments.some((s) => s.tag)).toBe(true);
    expect(r.cards).toHaveLength(3);
  });

  it('never returns a pick matching an avoid, and filters work-unsafe picks for Work', async () => {
    const r = await runInsight(body({ occasion: 'white_elephant', group: 'work', avoids: [] }), { qloo: qloo(), gemini: gemini(), stay22Aid: 'x' });
    expect(r.workSafe).toBe(true);
    expect(r.budget).toEqual({ min: 20, max: 30, label: '$20\u2013$30' });
    expect(r.filteredOut.some((f) => f.because === 'not work-safe')).toBe(true);
    expect(r.cards.map((c) => c.name).join(' ')).not.toMatch(/Beer Barrel/);
  });

  it('rejects when nothing is liked or the occasion is unknown', async () => {
    await expect(runInsight(body({ likes: [] }), { qloo: qloo(), gemini: gemini(), stay22Aid: 'x' })).rejects.toBeInstanceOf(HttpError);
    await expect(runInsight(body({ occasion: 'nope' }), { qloo: qloo(), gemini: gemini(), stay22Aid: 'x' })).rejects.toBeInstanceOf(HttpError);
    await expect(runInsight(body({ occasion: 'white_elephant' }), { qloo: qloo(), gemini: gemini(), stay22Aid: 'x' })).rejects.toThrow(/White Elephant/);
  });

  it('drops text-sourced tastes whose quote is not in the pasted text', async () => {
    const r = await runInsight(body({ likes: [like('Frank Ocean', 'artist', 'I like Frank Ocean'), like('Ghost', 'artist', 'text that is not there')] }), { qloo: qloo(), gemini: gemini(), stay22Aid: 'x' });
    expect(r.cards.every((c) => c.quote !== 'text that is not there')).toBe(true);
  });

  it('uses Gemini copy only for validated picks, and keeps real highlights only', async () => {
    const composed = {
      segments: [{ text: 'They enjoy ', tag: '' }, { text: 'patio dining', tag: 'patio dining' }, { text: ' and ', tag: '' }, { text: 'spaceships', tag: 'spaceships' }, { text: '.', tag: '' }],
      place: { name: '[sample] Patio One', because_like: 'Frank Ocean', idea: 'Book the patio', why: 'It has patio dining.' },
      gift: { name: 'does not exist', because_like: 'unknown', idea: '', why: '' },
      backup: { name: '[sample] Film Two', because_like: 'gardening', idea: 'Movie night in: Film Two', why: 'Romance.' },
    };
    const r = await runInsight(body({ likes: [like('Frank Ocean', 'artist', 'I like Frank Ocean'), like('gardening', 'activity', 'gardening')] }), { qloo: qloo(), gemini: gemini(composed), stay22Aid: 'x' });
    expect(r.fallback).toBe(false);
    expect(r.inference.writtenBy).toBe('Written by Gemini from Qloo tags');
    const tagged = r.inference.segments.filter((s) => s.tag).map((s) => s.tag);
    expect(tagged).toEqual(['patio dining']);
    expect(r.cards[0].name).toBe('[sample] Patio One');
    expect(r.cards[0].idea).toBe('Book the patio');
    expect(r.cards[1].name.startsWith('[sample] ')).toBe(true); // invented gift name replaced by a real candidate
    expect(r.cards[1].idea).toMatch(/Pick something from/);
  });
});

describe('insight pipeline with a (fake) live Qloo', () => {
  it('flags the result live, uses the place name in the Stay22 link and sends exclusion tags', async () => {
    const urls: string[] = [];
    const fetchImpl: Fetcher = async (url) => {
      urls.push(url);
      const u = new URL(url);
      let payload: unknown = {};
      if (u.pathname === '/search') payload = { results: [{ entity_id: 'E-' + u.searchParams.get('query'), name: u.searchParams.get('query') }] };
      else if (u.pathname === '/v2/tags') payload = { results: { tags: [{ id: 'urn:tag:' + u.searchParams.get('filter.query'), name: u.searchParams.get('filter.query') }] } };
      else if (u.searchParams.get('filter.type') === 'urn:tag') payload = { results: { tags: [{ id: 't1', name: 'live jazz' }, { id: 't2', name: 'quiet' }] } };
      else payload = { results: { entities: [{ entity_id: 'X1', name: 'Real Spot', tags: [{ name: 'live jazz' }], location: { lat: 41.9, lon: -87.6 }, properties: { address: '1 Main St' }, query: { explainability: [{ entity_id: 'E-Frank Ocean', score: 0.9 }] } }] } };
      return { ok: true, status: 200, json: async () => payload };
    };
    const qloo = createQlooClient({ apiKey: 'k', fetchImpl });
    const r = await runInsight(body(), { qloo, gemini: gemini(), stay22Aid: 'newaddy' });
    expect(r.dataSource).toBe('live');
    expect(r.cards[0].sample).toBe(false);
    expect(r.cards[0].stay22).toBe('https://www.stay22.com/allez/roam?aid=newaddy&address=Real%20Spot%2C%20Chicago&campaign=addytaste');
    expect(r.cards[0].because).toBe('Frank Ocean'); // from Qloo explainability
    expect(r.inference.viaTagCall).toBe(true);
    const placeCall = urls.find((u) => u.includes('filter.type=urn:entity:place')) as string;
    expect(placeCall).toContain('filter.exclude.tags=urn:tag:loud');
    expect(placeCall).toContain('filter.location.query=Chicago');
    expect(placeCall).toContain('feature.explainability=true');
    expect(placeCall).toContain('signal.interests.entities=E-Frank%20Ocean');
    expect(r.pins[0]).toMatchObject({ lat: 41.9, lon: -87.6, sample: false });
  });
});

describe('reader, quotes, filters, occasions', () => {
  it('keeps exact quotes, repairs case, rejects invented ones', () => {
    expect(findExactQuote(TEXT, 'I like Frank Ocean')).toBe('I like Frank Ocean');
    expect(findExactQuote(TEXT, 'i LIKE frank ocean')).toBe('I like Frank Ocean');
    expect(findExactQuote(TEXT, 'I like ... gardening')).toBe('I like Frank Ocean and gardening');
    expect(findExactQuote(TEXT, 'not in the text')).toBeNull();
    const { kept, dropped } = validateTastes(TEXT, [{ item: 'a', quote: 'I like Frank Ocean' }, { item: 'b', quote: 'made up' }]);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  it('runRead validates Gemini quotes for text and marks screenshot reads as image', async () => {
    const t = await runRead({ occasion: 'birthday', text: TEXT }, gemini());
    expect(t.sourceKind).toBe('text');
    expect(t.likes.map((l) => l.item)).toEqual(['Frank Ocean']);
    expect(t.avoids.map((l) => l.item)).toEqual(['country music']);
    expect(t.dropped).toBe(1);
    const img = await runRead({ occasion: 'birthday', image: { mime: 'image/png', data: 'AAAA' } }, gemini());
    expect(img.sourceKind).toBe('image');
    expect(img.likes.every((l) => l.source === 'image')).toBe(true);
    await expect(runRead({ occasion: 'birthday', image: { mime: 'application/pdf', data: 'AAAA' } }, gemini())).rejects.toThrow(/PNG/);
    await expect(runRead({ occasion: 'birthday', text: '' }, gemini())).rejects.toThrow(/Paste/);
  });

  it('avoid filter matches the thing, not every word', () => {
    const items = [{ name: 'Country Roads Bar', tags: ['country music'] }, { name: 'Kitchen Table', tags: ['brunch'] }];
    const r = filterByAvoids(items, [{ item: 'country music' }, { item: 'kitchen gadgets' }]);
    expect(r.kept.map((e) => e.name)).toEqual(['Kitchen Table']);
    expect(r.removed[0].because).toBe('country music');
  });

  it('work-safe check', () => {
    expect(isWorkSafeEntity({ name: 'Hop Yard Taproom', tags: [] })).toBe(false);
    expect(isWorkSafeEntity({ name: 'Corner Espresso Bar', tags: ['coffee'] })).toBe(true);
  });

  it('White Elephant budgets and the new occasions', () => {
    expect(resolveOccasion('white_elephant', 'work')?.budget).toMatchObject({ min: 20, max: 30 });
    expect(resolveOccasion('white_elephant', 'friends')?.budget).toMatchObject({ min: 25, max: 40 });
    expect(resolveOccasion('white_elephant', 'family')?.budget).toMatchObject({ min: 25, max: 50 });
    expect(resolveOccasion('white_elephant')).toBeNull();
    for (const id of ['mothers_day', 'birthday', 'holidays', 'anniversary', 'date_night', 'valentines', 'fathers_day']) expect(resolveOccasion(id)?.budget).toBeNull();
    expect(resolveOccasion('summer_date')).toBeNull();
  });

  it('Stay22 link is the plain Allez deep link', () => {
    expect(stay22Link('Cafe Du Monde', 'New Orleans', 'abc')).toBe('https://www.stay22.com/allez/roam?aid=abc&address=Cafe%20Du%20Monde%2C%20New%20Orleans&campaign=addytaste');
  });

  it('validSegments and templateSegments', () => {
    expect(validSegments([{ text: 'x', tag: '' }], ['a'])).toEqual([]);
    expect(templateSegments([]).length).toBe(1);
    const t = templateSegments(['a', 'b', 'c']);
    expect(t.filter((s) => s.tag).map((s) => s.tag)).toEqual(['a', 'b', 'c']);
  });
});

describe('api routes', () => {
  it('status shows the sample badge text with no Qloo key, and flips live with a key', async () => {
    const noKey = await (await handleApi(new Request('http://x/api/status'), { GEMINI_API_KEY: 'g' })).json();
    expect(noKey).toEqual({ dataSource: 'sample', badge: 'Sample data, Qloo key pending', gemini: true });
    const live = await (await handleApi(new Request('http://x/api/status'), { GEMINI_API_KEY: 'g', QLOO_API_KEY: 'q' })).json();
    expect(live).toEqual({ dataSource: 'live', badge: null, gemini: true });
  });

  it('rejects bad methods and bodies without leaking details', async () => {
    expect((await handleApi(new Request('http://x/api/read'), {})).status).toBe(405);
    expect((await handleApi(new Request('http://x/api/read', { method: 'POST', body: 'nope' }), {})).status).toBe(400);
    expect((await handleApi(new Request('http://x/api/other', { method: 'POST', body: '{}' }), {})).status).toBe(404);
  });
});

describe('budget guard and paragraph joining', () => {
  it('pricesWithin accepts in-budget amounts and rejects the rest', () => {
    const b = { min: 20, max: 30 };
    expect(pricesWithin('A $25 mug', b)).toBe(true);
    expect(pricesWithin('A $45 box', b)).toBe(false);
    expect(pricesWithin('Mug for $19.99', b)).toBe(false);
    expect(pricesWithin('No price here', b)).toBe(true);
  });

  it('a gift idea priced outside the White Elephant budget is replaced, in-budget ideas are kept', async () => {
    const mk = (idea: string) => ({
      segments: [{ text: 'They enjoy', tag: '' }, { text: 'patio dining', tag: 'patio dining' }, { text: 'a lot.', tag: '' }],
      place: { name: '[sample] Patio One', because_like: 'gardening', idea: 'x', why: 'y' },
      gift: { name: '[sample] Garden Goods', because_like: 'gardening', idea, why: 'Fits.' },
      backup: { name: '[sample] Film One', because_like: 'gardening', idea: 'z', why: 'w' },
    });
    const qloo = createQlooClient({ samplesDir: makeSamplesDir() });
    const run = (idea: string) => runInsight(body({ occasion: 'white_elephant', group: 'work', avoids: [], likes: [like('gardening', 'activity', 'gardening')] }), { qloo, gemini: gemini(mk(idea)), stay22Aid: 'x' });
    expect((await run('A $45 planter')).cards[1].idea).toMatch(/^Pick something from .*\$20/);
    expect((await run('A $25 planter')).cards[1].idea).toBe('A $25 planter');
  });

  it('joinPieces adds one space between pieces, none before punctuation', () => {
    const out = joinPieces([{ text: 'They like' }, { text: 'live jazz', tag: 'live jazz' }, { text: '.' }]);
    expect(out.map((p) => p.text).join('')).toBe('They like live jazz.');
  });
});


describe('follow-up chip updates (Gemini mocked)', () => {
  const upd = (raw: unknown): Gem => ({ available: true, update: async () => raw });
  const base = { likes: ['Frank Ocean', 'jazz'], avoids: ['country music'] };

  it('adds chips only with an exact quote from the follow-up, removes existing chips by name', async () => {
    const text = 'Update: she got into gardening, and she is over jazz now.';
    const g = upd({
      addLikes: [{ item: 'gardening', category: 'activity', quote: 'she got into gardening' }, { item: 'sailing', category: 'activity', quote: 'she loves sailing' }],
      addAvoids: [],
      removeLikes: ['Jazz', 'not a chip'],
      removeAvoids: [],
    });
    const u = await runUpdate({ text, ...base }, g);
    expect(u.addLikes.map((t) => t.item)).toEqual(['gardening']);
    expect(u.addLikes[0].quote).toBe('she got into gardening');
    expect(u.removeLikes).toEqual(['jazz']);
    expect(u.dropped).toBe(2);
    expect(u.sourceKind).toBe('text');
  });

  it('does not add a chip that is already there, and a new avoid replaces the same like', async () => {
    const text = 'Frank Ocean again. No more jazz, I think.';
    const g = upd({
      addLikes: [{ item: 'Frank Ocean', category: 'artist', quote: 'Frank Ocean again' }],
      addAvoids: [{ item: 'jazz', category: 'other', quote: 'No more jazz' }],
      removeLikes: [],
      removeAvoids: [],
    });
    const u = await runUpdate({ text, ...base }, g);
    expect(u.addLikes).toEqual([]);
    expect(u.addAvoids.map((t) => t.item)).toEqual(['jazz']);
    expect(u.removeLikes).toEqual(['jazz']);
  });

  it('rejects an empty update and a missing key', async () => {
    await expect(runUpdate({ text: '  ', ...base }, upd({}))).rejects.toThrow(/update/i);
    await expect(runUpdate({ text: 'hi', ...base }, { available: false } as Gem)).rejects.toBeInstanceOf(HttpError);
  });
});

describe('last-time exclusions in the pipeline', () => {
  it('filters out gifts used before by name, and sends their Qloo ids as filter.exclude.entities', async () => {
    const qloo = createQlooClient({ samplesDir: makeSamplesDir() });
    const r = await runInsight(body({ exclude: [{ name: 'Garden Goods' }, { name: 'Other', id: 'X-9' }] }), { qloo, gemini: gemini(), stay22Aid: 'x' });
    const gift = r.cards.find((c) => c.kind === 'gift');
    expect(gift?.name).not.toMatch(/Garden Goods/);
    expect(r.filteredOut.some((f) => f.name.includes('Garden Goods'))).toBe(true);

    const urls: string[] = [];
    const fetchImpl: Fetcher = async (url) => {
      urls.push(url);
      const u = new URL(url);
      let payload: unknown = {};
      if (u.pathname === '/search') payload = { results: [{ entity_id: 'E-' + u.searchParams.get('query'), name: u.searchParams.get('query') }] };
      else if (u.pathname === '/v2/tags') payload = { results: { tags: [{ id: 'urn:tag:' + u.searchParams.get('filter.query'), name: u.searchParams.get('filter.query') }] } };
      else payload = { results: { entities: [{ entity_id: 'B1', name: 'Brand One', tags: [{ name: 'a' }] }] } };
      return { ok: true, status: 200, json: async () => payload };
    };
    await runInsight(body({ exclude: [{ name: 'Old Gift', id: 'OLD1' }, { name: 'Older', id: 'OLD2' }] }), { qloo: createQlooClient({ apiKey: 'k', fetchImpl }), gemini: gemini(), stay22Aid: 'x' });
    const brandCall = urls.find((u) => u.includes('filter.type=urn:entity:brand')) as string;
    expect(brandCall).toContain('filter.exclude.entities=OLD1,OLD2');
  });
});
