import { describe, expect, it } from 'vitest';
import { buildInsightsParams, buildSearchParams, buildTagParams, createQlooClient, parseEntity, parseTags, SAMPLE_BADGE, SAMPLE_PREFIX, toQuery, TYPE, type Fetcher } from '../server/qloo';
import { makeSamplesDir } from './helpers';

describe('qloo.ts request building', () => {
  it('builds exact /v2/insights params for a place', () => {
    expect(
      buildInsightsParams({ type: 'place', entityIds: ['E1', 'E2'], tagIds: ['urn:tag:genre:jazz'], excludeTagIds: ['urn:tag:genre:country'], city: 'New Orleans', priceMax: 2, take: 12 }),
    ).toEqual({
      'filter.type': 'urn:entity:place',
      'signal.interests.entities': 'E1,E2',
      'signal.interests.tags': 'urn:tag:genre:jazz',
      'filter.exclude.tags': 'urn:tag:genre:country',
      'operator.filter.exclude.tags': 'union',
      'filter.location.query': 'New Orleans',
      'filter.price_level.max': 2,
      'feature.explainability': true,
      take: 12,
    });
  });

  it('brand requests carry no location or price, tag requests no explainability', () => {
    const brand = buildInsightsParams({ type: 'brand', entityIds: ['E1'], city: 'Chicago', priceMax: 3 });
    expect(brand).toEqual({ 'filter.type': 'urn:entity:brand', 'signal.interests.entities': 'E1', 'feature.explainability': true, take: 10 });
    const tag = buildInsightsParams({ type: 'tag', entityIds: ['E1'], tagIds: ['T1'] });
    expect(tag).toEqual({ 'filter.type': 'urn:tag', 'signal.interests.entities': 'E1', 'signal.interests.tags': 'T1', take: 10 });
    expect(TYPE.movie).toBe('urn:entity:movie');
  });

  it('sends already-used gift ids as filter.exclude.entities', () => {
    expect(buildInsightsParams({ type: 'brand', entityIds: ['E1'], excludeEntityIds: ['OLD1', 'OLD2'] })['filter.exclude.entities']).toBe('OLD1,OLD2');
    expect(buildInsightsParams({ type: 'brand', entityIds: ['E1'] })).not.toHaveProperty('filter.exclude.entities');
  });

  it('clamps price_level.max to 1-4 and take to 1-50', () => {
    const p = buildInsightsParams({ type: 'place', priceMax: 9, take: 500 });
    expect(p['filter.price_level.max']).toBe(4);
    expect(p.take).toBe(50);
    expect(buildInsightsParams({ type: 'brand', take: 0 }).take).toBe(1);
  });

  it('builds search and tag lookups', () => {
    expect(buildSearchParams('Radiohead', 'artist')).toEqual({ query: 'Radiohead', types: 'urn:entity:artist', take: 3 });
    expect(buildSearchParams('gardening', 'activity')).toEqual({ query: 'gardening', take: 3 });
    expect(buildTagParams('jazz')).toEqual({ 'filter.query': 'jazz', take: 3 });
  });

  it('keeps colons and commas readable and skips empty values', () => {
    expect(toQuery({ 'filter.type': 'urn:entity:place', 'signal.interests.entities': ['A', 'B'], empty: '', gone: undefined, 'filter.location.query': 'New Orleans' })).toBe(
      'filter.type=urn:entity:place&signal.interests.entities=A,B&filter.location.query=New%20Orleans',
    );
  });

  it('live client: GET to the hackathon host with the key in X-Api-Key', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const fetchImpl: Fetcher = async (url, init) => {
      calls.push({ url, headers: init?.headers });
      return { ok: true, status: 200, json: async () => ({ results: { entities: [{ entity_id: 'P1', name: 'Real Place', tags: [{ name: 'brunch' }], location: { lat: 1, lon: 2 } }] } }) };
    };
    const client = createQlooClient({ apiKey: 'test-key', fetchImpl });
    expect(client.mode).toBe('live');
    const r = await client.insights({ type: 'place', entityIds: ['E1'], city: 'Austin', take: 5 }, 'x');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:place&signal.interests.entities=E1&filter.location.query=Austin&feature.explainability=true&take=5',
    );
    expect(calls[0].headers?.['X-Api-Key']).toBe('test-key');
    expect(r.entities[0]).toMatchObject({ id: 'P1', name: 'Real Place', sample: false, lat: 1, lon: 2 });
  });

  it('live client: non-200 throws without echoing the url', async () => {
    const client = createQlooClient({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
    await expect(client.findTag('jazz')).rejects.toThrow('Qloo /v2/tags returned 401');
  });

  it('parses explainability as a list or a map, and tags in either shape', () => {
    const a = parseEntity({ entity_id: 'X', name: 'N', query: { explainability: [{ entity_id: 'E1', score: 0.8 }] } }, ['E1'], false);
    expect(a?.explain).toEqual({ E1: 0.8 });
    const b = parseEntity({ entity_id: 'X', name: 'N', query: { explainability: { E1: 0.4, OTHER: 0.9 } } }, ['E1'], false);
    expect(b?.explain).toEqual({ E1: 0.4 });
    expect(parseTags({ results: { tags: [{ id: 'urn:tag:1', name: 'Jazz' }] } })).toEqual([{ id: 'urn:tag:1', name: 'Jazz' }]);
    expect(parseTags({ results: [{ tag_id: 't2', name: 'Soul' }] })).toEqual([{ id: 't2', name: 'Soul' }]);
  });
});

describe('sample fallback labeling', () => {
  it('no key means sample mode, and the badge text is the agreed one', () => {
    expect(createQlooClient({ apiKey: '' }).mode).toBe('sample');
    expect(createQlooClient({ apiKey: '   ' }).mode).toBe('sample');
    expect(SAMPLE_BADGE).toBe('Sample data, Qloo key pending');
  });

  it('flips to live automatically once a key is present', () => {
    expect(createQlooClient({ apiKey: 'abc' }).mode).toBe('live');
  });

  it('every sample entity is flagged sample and prefixed, even if the file forgot the prefix', async () => {
    const client = createQlooClient({ samplesDir: makeSamplesDir({ prefixed: false }) });
    const place = await client.insights({ type: 'place', entityIds: ['A'], city: 'Chicago' }, 'whatever');
    const brand = await client.insights({ type: 'brand', entityIds: ['A'] }, 'whatever');
    for (const e of [...place.entities, ...brand.entities]) {
      expect(e.sample).toBe(true);
      expect(e.name.startsWith(SAMPLE_PREFIX)).toBe(true);
    }
    expect(place.entities.every((e) => e.name.startsWith('[sample] [sample]'))).toBe(false);
  });

  it('does not double the prefix when the file already has it', async () => {
    const client = createQlooClient({ samplesDir: makeSamplesDir({ prefixed: true }) });
    const r = await client.insights({ type: 'movie', entityIds: ['A'] }, 'k');
    expect(r.entities[0].name.startsWith('[sample] [sample]')).toBe(false);
    expect(r.entities[0].name.startsWith('[sample] ')).toBe(true);
  });

  it('sample pins are placed around the requested city, not at a real address', async () => {
    const client = createQlooClient({ samplesDir: makeSamplesDir() });
    const r = await client.insights({ type: 'place', entityIds: ['A'], city: 'Chicago' }, 'k');
    expect(r.entities[0].lat).toBeGreaterThan(41);
    expect(r.entities[0].lat).toBeLessThan(42.5);
  });

  it('sample tags follow the seeds, so toggling a like changes them', async () => {
    const client = createQlooClient({ samplesDir: makeSamplesDir() });
    const one = await client.insights({ type: 'tag', entityIds: ['SAMPLE-ENT-a'] }, 'k');
    const two = await client.insights({ type: 'tag', entityIds: ['SAMPLE-ENT-a', 'SAMPLE-ENT-b'] }, 'k');
    expect(one.tags.map((t) => t.name)).not.toEqual(two.tags.map((t) => t.name));
  });

  it('a missing sample file is a clear error, not an empty success', async () => {
    const client = createQlooClient({ samplesDir: '/nonexistent-folder-xyz' });
    await expect(client.insights({ type: 'place' }, 'k')).rejects.toThrow('No sample file');
  });
});
