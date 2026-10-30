// Server-side Qloo client. GET everywhere, X-Api-Key header, base https://hackathon.api.qloo.com.
// No key: reads clearly fake sample JSON from the gitignored .samples/ folder and labels everything as sample.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Category } from '../src/lib/types';
import { norm } from './filter';

export const QLOO_BASE = 'https://hackathon.api.qloo.com';
export const SAMPLE_PREFIX = '[sample] ';
export const SAMPLE_BADGE = 'Sample data, Qloo key pending';

export const TYPE = {
  place: 'urn:entity:place',
  brand: 'urn:entity:brand',
  movie: 'urn:entity:movie',
  tag: 'urn:tag',
} as const;
export type InsightType = keyof typeof TYPE;

export type Param = string | number | boolean | string[] | null | undefined;

/** Query string with ":" and "," left readable (Qloo urns and id lists). Skips empty values. */
export function toQuery(params: Record<string, Param>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    const val = Array.isArray(v) ? v.join(',') : String(v);
    if (!val) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(val).replace(/%3A/gi, ':').replace(/%2C/gi, ',')}`);
  }
  return parts.join('&');
}

export interface InsightsOpts {
  type: InsightType;
  entityIds?: string[];
  tagIds?: string[];
  excludeTagIds?: string[];
  city?: string;
  priceMax?: number;
  take?: number;
}

/** Exact /v2/insights params for one request. Param names follow the Qloo Parameter Reference. */
export function buildInsightsParams(o: InsightsOpts): Record<string, Param> {
  const p: Record<string, Param> = { 'filter.type': TYPE[o.type] };
  if (o.entityIds?.length) p['signal.interests.entities'] = o.entityIds.join(',');
  if (o.tagIds?.length) p['signal.interests.tags'] = o.tagIds.join(',');
  if (o.excludeTagIds?.length) {
    p['filter.exclude.tags'] = o.excludeTagIds.join(',');
    p['operator.filter.exclude.tags'] = 'union';
  }
  if (o.type === 'place') {
    if (o.city) p['filter.location.query'] = o.city;
    if (o.priceMax) p['filter.price_level.max'] = Math.min(4, Math.max(1, Math.round(o.priceMax)));
  }
  if (o.type !== 'tag') p['feature.explainability'] = true;
  p['take'] = Math.min(50, Math.max(1, o.take ?? 10));
  return p;
}

const SEARCH_TYPE: Partial<Record<Category, string>> = {
  artist: 'urn:entity:artist',
  movie: 'urn:entity:movie',
  tv_show: 'urn:entity:tv_show',
  place: 'urn:entity:place',
  brand: 'urn:entity:brand',
  book: 'urn:entity:book',
  person: 'urn:entity:person',
};

/** GET /search params (entity name to entity id). */
export function buildSearchParams(query: string, category: Category): Record<string, Param> {
  const type = SEARCH_TYPE[category];
  return { query, ...(type ? { types: type } : {}), take: 3 };
}

/** GET /v2/tags params (a like to tag ids). */
export function buildTagParams(query: string): Record<string, Param> {
  return { 'filter.query': query, take: 3 };
}

export interface QlooEntity {
  id: string;
  name: string;
  tags: string[];
  description?: string;
  address?: string;
  lat?: number;
  lon?: number;
  /** Seed entity id -> contribution score (0 to 1) from feature.explainability. */
  explain: Record<string, number>;
  sample: boolean;
}
export interface QlooTag { id: string; name: string }

export type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface QlooClient {
  mode: 'live' | 'sample';
  search(query: string, category: Category): Promise<{ id: string; name: string } | null>;
  findTag(query: string): Promise<QlooTag | null>;
  insights(o: InsightsOpts, sampleKey: string): Promise<{ entities: QlooEntity[]; tags: QlooTag[] }>;
}

export interface QlooConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: Fetcher;
  /** Folder holding sample JSON (default ./.samples/qloo). */
  samplesDir?: string;
  /** Used only in sample mode to place sample pins. */
  cityCenter?: { lat: number; lon: number };
  log?: (line: string) => void;
}

const CITY_CENTERS: Record<string, { lat: number; lon: number }> = {
  'new orleans': { lat: 29.9511, lon: -90.0715 },
  chicago: { lat: 41.8781, lon: -87.6298 },
  'new york': { lat: 40.7128, lon: -74.006 },
  austin: { lat: 30.2672, lon: -97.7431 },
  nashville: { lat: 36.1627, lon: -86.7816 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  seattle: { lat: 47.6062, lon: -122.3321 },
  atlanta: { lat: 33.749, lon: -84.388 },
  miami: { lat: 25.7617, lon: -80.1918 },
};
export function sampleCityCenter(city: string): { lat: number; lon: number } {
  const key = norm(city);
  for (const [name, c] of Object.entries(CITY_CENTERS)) if (key.includes(norm(name))) return c;
  return CITY_CENTERS['new orleans'];
}

function hashNum(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
const hash = (s: string) => hashNum(s).toString(36);

/** Sample mode only: rotate a list by the seeds, so turning a chip on or off visibly changes the order. */
function rotate<T>(list: T[], seeds: string[]): T[] {
  if (!list.length) return list;
  const k = seeds.reduce((a, s) => a + hashNum(s), 0) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Parse one /v2/insights result into our shape. Tolerates both flat and nested location/address fields. */
export function parseEntity(raw: Json, seedIds: string[], sample: boolean): QlooEntity | null {
  const id = String(raw?.entity_id ?? raw?.id ?? '');
  const name0 = String(raw?.name ?? '').trim();
  if (!id || !name0) return null;
  const tags: string[] = (Array.isArray(raw.tags) ? raw.tags : []).map((t: Json | string) => (typeof t === 'string' ? t : String(t?.name ?? ''))).filter(Boolean);
  const loc = raw.location ?? raw.properties?.geocode ?? {};
  const lat = Number(loc.lat ?? loc.latitude);
  const lon = Number(loc.lon ?? loc.lng ?? loc.longitude);
  const explain: Record<string, number> = {};
  const ex = raw.query?.explainability;
  if (Array.isArray(ex)) {
    for (const e of ex) {
      const k = String(e?.entity_id ?? e?.id ?? '');
      const s = Number(e?.score ?? e?.value);
      if (k && Number.isFinite(s)) explain[k] = s;
    }
  } else if (ex && typeof ex === 'object') {
    for (const [k, v] of Object.entries(ex)) {
      const s = typeof v === 'number' ? v : Number((v as Json)?.score);
      if (seedIds.includes(k) && Number.isFinite(s)) explain[k] = s;
    }
  }
  const address = raw.properties?.address ?? raw.address ?? raw.properties?.geocode?.formatted_address;
  return {
    id,
    name: sample && !name0.startsWith(SAMPLE_PREFIX) ? SAMPLE_PREFIX + name0 : name0,
    tags,
    description: raw.properties?.short_description ?? raw.properties?.description ?? undefined,
    address: typeof address === 'string' ? address : undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    explain,
    sample,
  };
}

export function parseTags(json: Json): QlooTag[] {
  const list = json?.results?.tags ?? json?.results ?? json?.tags ?? [];
  return (Array.isArray(list) ? list : [])
    .map((t: Json) => ({ id: String(t?.id ?? t?.tag_id ?? ''), name: String(t?.name ?? t?.tag ?? '').trim() }))
    .filter((t: QlooTag) => t.id && t.name);
}

export function createQlooClient(cfg: QlooConfig = {}): QlooClient {
  const apiKey = cfg.apiKey?.trim() || '';
  const base = (cfg.baseUrl || QLOO_BASE).replace(/\/$/, '');
  const f: Fetcher = cfg.fetchImpl ?? ((url, init) => fetch(url, init));
  const samplesDir = cfg.samplesDir ?? join(process.cwd(), '.samples', 'qloo');
  const log = cfg.log ?? (() => {});

  async function get(path: string, params: Record<string, Param>): Promise<Json> {
    const url = `${base}${path}?${toQuery(params)}`;
    const res = await f(url, { headers: { 'X-Api-Key': apiKey, accept: 'application/json' } });
    if (!res.ok) {
      log(`qloo ${path} -> ${res.status}`);
      throw new Error(`Qloo ${path} returned ${res.status}`);
    }
    return (await res.json()) as Json;
  }

  if (apiKey) {
    return {
      mode: 'live',
      async search(query, category) {
        const json = await get('/search', buildSearchParams(query, category));
        const list: Json[] = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];
        const hit = list[0];
        const id = hit && String(hit.entity_id ?? hit.id ?? '');
        return hit && id ? { id, name: String(hit.name ?? query) } : null;
      },
      async findTag(query) {
        const tags = parseTags(await get('/v2/tags', buildTagParams(query)));
        return tags[0] ?? null;
      },
      async insights(o) {
        const json = await get('/v2/insights', buildInsightsParams(o));
        const seeds = o.entityIds ?? [];
        const results = json?.results ?? {};
        if (o.type === 'tag') return { entities: [], tags: parseTags({ results: results.tags ?? results.entities ?? [] }) };
        const list: Json[] = Array.isArray(results.entities) ? results.entities : [];
        return { entities: list.map((r) => parseEntity(r, seeds, false)).filter((e): e is QlooEntity => !!e), tags: [] };
      },
    };
  }

  // ---- Sample mode (no key): fake data, always labeled. ----
  function readSample(file: string): Json | null {
    const p = join(samplesDir, file);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Json) : null;
  }
  return {
    mode: 'sample',
    async search(query) {
      return { id: `SAMPLE-ENT-${hash(query)}`, name: SAMPLE_PREFIX + query };
    },
    async findTag(query) {
      return { id: `SAMPLE-TAG-${hash(query)}`, name: query };
    },
    async insights(o, sampleKey) {
      const json = readSample(`insights-${o.type}.${sampleKey}.json`) ?? readSample(`insights-${o.type}.json`);
      if (!json) throw new Error(`No sample file for ${o.type} (${sampleKey}) in ${samplesDir}`);
      const center = cfg.cityCenter ?? sampleCityCenter(o.city ?? '');
      const seeds = [...(o.entityIds ?? []), ...(o.tagIds ?? [])];
      if (o.type === 'tag') {
        // Each seed pulls three tags from the pool, so the tag set follows the chips that are on.
        const pool = parseTags({ results: json.results?.tags ?? [] });
        const picked = new Map<string, QlooTag>();
        for (const s of seeds) {
          const start = hashNum(s) % Math.max(pool.length, 1);
          for (let i = 0; i < 3 && pool.length; i++) { const t = pool[(start + i) % pool.length]; picked.set(t.id, t); }
        }
        return { entities: [], tags: [...picked.values()].slice(0, o.take ?? 12) };
      }
      const list: Json[] = Array.isArray(json.results?.entities) ? json.results.entities : [];
      const entities = rotate(list, seeds)
        .map((r) => {
          // Sample places carry an offset in degrees from the city center, not a real coordinate.
          const off = r.sample_offset;
          const withLoc = off ? { ...r, location: { lat: center.lat + Number(off.dlat), lon: center.lon + Number(off.dlon) } } : r;
          return parseEntity(withLoc, o.entityIds ?? [], true);
        })
        .filter((e): e is QlooEntity => !!e)
        .slice(0, o.take ?? 10);
      return { entities, tags: [] };
    },
  };
}
