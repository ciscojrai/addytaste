import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { qlooLogger } from '../server/api';
import { HttpError, runInsight } from '../server/pipeline';
import { createQlooClient, parseEntity, parseTags, type Fetcher } from '../server/qloo';
import { like, makeSamplesDir } from './helpers';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'qloo', name), 'utf8'));
const KEY = 'test-key-1234567890';

/** A fake hackathon.api.qloo.com that answers with the captured response shapes and records every request. */
function fakeQloo(opts: { fail?: (u: URL) => number | 'throw' | undefined } = {}) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fetchImpl: Fetcher = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, headers: init?.headers ?? {} });
    const bad = opts.fail?.(u);
    if (bad === 'throw') throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    if (bad) return { ok: false, status: bad, json: async () => ({}) };
    let body: unknown = {};
    if (u.pathname === '/search') body = fx('search-artist.json');
    else if (u.pathname === '/v2/tags') body = u.searchParams.get('filter.parents.types') ? fx('tags-place.json') : fx('tags-any.json');
    else {
      const t = u.searchParams.get('filter.type');
      body = t === 'urn:entity:place' ? fx('insights-place.json') : t === 'urn:entity:brand' ? fx('insights-brand.json') : t === 'urn:entity:movie' ? fx('insights-movie.json') : fx('insights-tag.json');
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, calls };
}

const gem = { available: true, compose: async () => { throw new Error('down'); }, read: async () => ({}) } as never;
const body = (extra: Record<string, unknown> = {}) => ({
  occasion: 'birthday',
  city: 'Faketown',
  text: 'I love Fixture Artist and brunch. No loud places.',
  likes: [like('Fixture Artist', 'artist', 'I love Fixture Artist'), like('brunch', 'food', 'brunch')],
  avoids: [],
  runId: 'r',
  ...extra,
});

describe('response shapes captured from live Qloo', () => {
  it('place: id, name, address, coordinates, tags without the generic ones, explainability scores', () => {
    const e = parseEntity(fx('insights-place.json').results.entities[0], ['FIXTURE-ARTIST-1', 'FIXTURE-ARTIST-2'], false)!;
    expect(e).toMatchObject({ id: 'FIXTURE-PLACE-1', name: 'Fixture Bistro', address: '1 Fixture St Faketown, ZZ 00000', lat: 29.95, lon: -90.07, sample: false });
    expect(e.tags).toEqual(['Lively', 'Brunch']);
    expect(e.explain).toEqual({ 'FIXTURE-ARTIST-1': 0.4, 'FIXTURE-ARTIST-2': 0.52 });
    expect(e.description).toBe('A made-up bistro for tests.');
  });

  it('brand: no location, "Other" tag dropped, explainability under signal.interests.entities', () => {
    const e = parseEntity(fx('insights-brand.json').results.entities[0], [], false)!;
    expect(e.name).toBe('Fixture Goods Co');
    expect(e.lat).toBeUndefined();
    expect(e.tags).toEqual(['Fixture goods']);
    expect(e.explain['FIXTURE-ARTIST-1']).toBe(0.55);
  });

  it('tags: /v2/tags uses id, the urn:tag insight uses tag_id; names are trimmed and de-duplicated', () => {
    expect(parseTags(fx('tags-place.json')).map((t) => t.id)).toEqual(['urn:tag:dining_options:place:brunch']);
    const t = parseTags({ results: fx('insights-tag.json').results.tags });
    expect(t.map((x) => [x.id, x.name])).toEqual([['urn:tag:genre:music:blues', 'blues'], ['urn:tag:genre:music:classic_rock', 'classic rock'], ['urn:tag:good_for:qloo:brunch', 'Brunch']]);
    expect(parseTags(fx('tags-empty.json'))).toEqual([]);
  });
});

describe('live client over the captured shapes', () => {
  it('sends the key only in the X-Api-Key header, and logs endpoint, params, status and result count', async () => {
    const { fetchImpl, calls } = fakeQloo();
    const lines: string[] = [];
    const q = createQlooClient({ apiKey: KEY, fetchImpl, log: (l) => lines.push(l) });
    expect(await q.search('Fixture Artist', 'artist')).toEqual({ id: 'FIXTURE-ARTIST-1', name: 'Fixture Artist' });
    const place = await q.insights({ type: 'place', entityIds: ['FIXTURE-ARTIST-1'], city: 'Faketown', excludeEntityIds: ['OLD-1'], priceMax: 3 }, 'x');
    expect(place.entities.map((e) => e.name)).toEqual(['Fixture Bistro', 'Fixture Cafe']);
    const tags = await q.insights({ type: 'tag', entityIds: ['FIXTURE-ARTIST-1'] }, 'x');
    expect(tags.tags.map((t) => t.name)).toEqual(['blues', 'classic rock', 'Brunch']);
    for (const c of calls) { expect(c.headers['X-Api-Key']).toBe(KEY); expect(c.url.href).not.toContain(KEY); }
    const placeUrl = calls[1].url;
    expect(placeUrl.searchParams.get('filter.exclude.entities')).toBe('OLD-1');
    expect(placeUrl.searchParams.get('filter.location.query')).toBe('Faketown');
    expect(lines[0]).toMatch(/GET \/search\?query=Fixture%20Artist.* -> 200 results=2 \d+ms$/);
    expect(lines[1]).toMatch(/GET \/v2\/insights\?filter\.type=urn:entity:place.* -> 200 results=2/);
    expect(lines[2]).toMatch(/filter\.type=urn:tag.* -> 200 results=4 \d+ms$/);
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('scoped tag lookup asks for place tags first and falls back to any tag', async () => {
    const f = fakeQloo();
    const q = createQlooClient({ apiKey: KEY, fetchImpl: f.fetchImpl });
    expect(await q.findTag('brunch', 'place')).toEqual({ id: 'urn:tag:dining_options:place:brunch', name: 'Brunch' });
    expect(f.calls[0].url.searchParams.get('filter.parents.types')).toBe('urn:entity:place');
    const g = fakeQloo({ fail: () => undefined });
    const q2 = createQlooClient({ apiKey: KEY, fetchImpl: async (u, i) => (new URL(u).searchParams.get('filter.parents.types') ? { ok: true, status: 200, json: async () => fx('tags-empty.json') } : g.fetchImpl(u, i)) });
    expect((await q2.findTag('thing', 'place'))?.id).toBe('urn:tag:genre:media:fixture');
  });

  it('logs the status of a failed call and a timeout, then throws without leaking the key', async () => {
    const lines: string[] = [];
    const q = createQlooClient({ apiKey: KEY, fetchImpl: fakeQloo({ fail: (u) => (u.pathname === '/search' ? 500 : 'throw') }).fetchImpl, log: (l) => lines.push(l) });
    await expect(q.search('x', 'artist')).rejects.toThrow(/returned 500/);
    await expect(q.insights({ type: 'brand', entityIds: ['A'] }, 'x')).rejects.toThrow(/timeout/);
    expect(lines[0]).toMatch(/-> 500 \d+ms$/);
    expect(lines[1]).toMatch(/-> timeout/);
  });

  it('the logger scrubs the key from a line', () => {
    const out: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { out.push(a.join(' ')); };
    try { qlooLogger({ QLOO_API_KEY: KEY })(`GET /x?token=${KEY} -> 200`); } finally { console.log = orig; }
    expect(out[0]).toContain('token=[key]');
    expect(out[0]).not.toContain(KEY);
  });
});

describe('pipeline on live data', () => {
  it('is live end to end: no sample label anywhere, ids kept, prior gifts sent by id', async () => {
    const f = fakeQloo();
    const r = await runInsight(body({ exclude: [{ name: 'Old Gift', id: 'OLD-1' }] }), { qloo: createQlooClient({ apiKey: KEY, fetchImpl: f.fetchImpl }), sample: createQlooClient({ samplesDir: makeSamplesDir() }), gemini: gem, stay22Aid: 'x' });
    expect(r.dataSource).toBe('live');
    expect(r.inference.legend).toEqual(['Backed by a Qloo tag']);
    expect(r.cards.map((c) => [c.kind, c.name, c.sample, c.entityId])).toEqual([['place', 'Fixture Bistro', false, 'FIXTURE-PLACE-1'], ['gift', 'Fixture Goods Co', false, 'FIXTURE-BRAND-1'], ['backup', 'Fixture Film', false, 'FIXTURE-MOVIE-1']]);
    expect(r.inference.viaTagCall).toBe(true);
    expect(r.inference.tags).toEqual(['blues', 'classic rock', 'Brunch']);
    expect(r.cards[0].stay22).toContain('Fixture%20Bistro');
    expect(r.pins.every((p) => !p.sample)).toBe(true);
    const brand = f.calls.find((c) => c.url.searchParams.get('filter.type') === 'urn:entity:brand')!.url;
    expect(brand.searchParams.get('filter.exclude.entities')).toBe('OLD-1');
    expect(brand.searchParams.get('signal.interests.entities')).toBe('FIXTURE-ARTIST-1');
    expect(brand.searchParams.get('signal.interests.tags')).toBe('urn:tag:dining_options:place:brunch');
    expect(JSON.stringify(r)).not.toMatch(/\[sample\]/);
    // the credited like comes from Qloo's explainability score
    expect(r.cards[1].because).toBe('Fixture Artist');
  });

  it('a failed call falls back to labeled sample for that piece only: the result is "mixed"', async () => {
    const f = fakeQloo({ fail: (u) => (u.searchParams.get('filter.type') === 'urn:entity:brand' ? 503 : undefined) });
    const r = await runInsight(body(), { qloo: createQlooClient({ apiKey: KEY, fetchImpl: f.fetchImpl }), sample: createQlooClient({ samplesDir: makeSamplesDir() }), gemini: gem, stay22Aid: 'x' });
    expect(r.dataSource).toBe('mixed');
    expect(r.cards.find((c) => c.kind === 'place')?.sample).toBe(false);
    const gift = r.cards.find((c) => c.kind === 'gift')!;
    expect(gift.sample).toBe(true);
    expect(gift.name.startsWith('[sample] ')).toBe(true);
  });

  it('with every Qloo call failing, the whole result is labeled sample', async () => {
    const f = fakeQloo({ fail: () => 500 });
    const r = await runInsight(body(), { qloo: createQlooClient({ apiKey: KEY, fetchImpl: f.fetchImpl }), sample: createQlooClient({ samplesDir: makeSamplesDir() }), gemini: gem, stay22Aid: 'x' });
    expect(r.dataSource).toBe('sample');
    expect(r.cards.every((c) => c.sample)).toBe(true);
    expect(r.inference.legend[0]).toMatch(/sample tag, not real Qloo/);
  });

  it('with no sample fallback available, a failing Qloo is an error, never fake live data', async () => {
    const f = fakeQloo({ fail: () => 500 });
    await expect(runInsight(body(), { qloo: createQlooClient({ apiKey: KEY, fetchImpl: f.fetchImpl }), gemini: gem, stay22Aid: 'x' })).rejects.toBeInstanceOf(HttpError);
  });

  it('a search hit that does not look like the liked thing is not used as a seed', async () => {
    const f = fakeQloo();
    const r = await runInsight(body({ likes: [like('Totally Different Band', 'artist', 'I love Fixture Artist'), like('brunch', 'food', 'brunch')] }), { qloo: createQlooClient({ apiKey: KEY, fetchImpl: f.fetchImpl }), gemini: gem, stay22Aid: 'x' });
    const place = f.calls.find((c) => c.url.searchParams.get('filter.type') === 'urn:entity:place')!.url;
    expect(place.searchParams.get('signal.interests.entities')).toBeNull();
    expect(place.searchParams.get('signal.interests.tags')).toBe('urn:tag:dining_options:place:brunch,urn:tag:dining_options:place:brunch');
    expect(r.dataSource).toBe('live');
  });

  it('a real result that is truly empty stays an error and is not replaced by samples', async () => {
    const empty = fakeQloo();
    const fetchImpl: Fetcher = async (u, i) => {
      const x = new URL(u);
      if (x.pathname === '/v2/insights') return { ok: true, status: 200, json: async () => ({ success: true, results: { entities: [], tags: [] } }) };
      return empty.fetchImpl(u, i);
    };
    await expect(runInsight(body(), { qloo: createQlooClient({ apiKey: KEY, fetchImpl }), sample: createQlooClient({ samplesDir: makeSamplesDir() }), gemini: gem, stay22Aid: 'x' })).rejects.toThrow(/nothing/);
  });
});
