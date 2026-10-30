import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Taste } from '../src/lib/types';

/** Writes tiny fake sample files into a temp folder, so tests do not depend on the gitignored .samples/ folder. */
export function makeSamplesDir(opts: { prefixed?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'qloo-samples-'));
  const pre = opts.prefixed ? '[sample] ' : '';
  const ent = (name: string, tags: string[], off?: [number, number]) => ({
    entity_id: `S-${name}`,
    name: pre + name,
    tags: tags.map((t) => ({ id: `T-${t}`, name: t })),
    ...(off ? { sample_offset: { dlat: off[0], dlon: off[1] } } : {}),
  });
  const w = (f: string, results: unknown) => writeFileSync(join(dir, f), JSON.stringify({ results }));
  w('insights-place.json', { entities: [ent('Patio One', ['patio dining', 'brunch'], [0.01, 0.01]), ent('Loud Club', ['nightclub', 'loud'], [0.02, -0.01]), ent('Patio Two', ['patio dining'], [-0.01, 0.02])] });
  w('insights-brand.json', { entities: [ent('Garden Goods', ['gardening']), ent('Scent House', ['scented candles']), ent('Beer Barrel', ['beer', 'brewery'])] });
  w('insights-movie.json', { entities: [ent('Film One', ['cozy']), ent('Film Two', ['romance'])] });
  w('insights-tag.json', { tags: ['patio dining', 'brunch', 'gardening', 'cozy', 'romance', 'classic rock', 'quiet', 'warm'].map((t) => ({ id: `T-${t}`, name: t })) });
  return dir;
}

export const like = (item: string, category: Taste['category'] = 'artist', quote = item): Taste => ({ id: item, item, category, quote, source: 'text' });
