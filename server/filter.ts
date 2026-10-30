// Avoids filter results on our side too (Qloo's filter.exclude.tags needs tag ids we may not have found),
// and the Work-safe check.

const GENERIC = new Set(['music', 'movie', 'film', 'food', 'song', 'band', 'show', 'place', 'the', 'and', 'of', 'a', 'stuff', 'thing']);

const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(stem).join(' ');
const hasWord = (haystack: string, needle: string) => (' ' + haystack + ' ').includes(' ' + needle + ' ');

export interface Candidate { id: string; name: string; tags: string[]; description?: string }

export function matchesAvoid(entity: { name: string; tags: string[] }, avoids: { item: string }[]): string | null {
  const name = norm(entity.name);
  const tags = entity.tags.map(norm).filter(Boolean);
  for (const a of avoids) {
    const full = norm(a.item);
    if (!full) continue;
    if (hasWord(name, full) || tags.some((t) => hasWord(t, full))) return a.item;
    const toks = full.split(' ').filter((t) => t.length >= 3 && !GENERIC.has(t));
    // For a multi-word avoid ("kitchen gadgets") only the last word, the thing itself, counts alone.
    for (const tok of toks.length > 1 ? toks.slice(-1) : toks) {
      if (tags.some((t) => hasWord(t, tok))) return a.item;
      if (hasWord(name, tok) && tok.length >= 5) return a.item;
    }
  }
  return null;
}

export function filterByAvoids<T extends { name: string; tags: string[] }>(entities: T[], avoids: { item: string }[]) {
  const kept: T[] = [];
  const removed: { name: string; because: string }[] = [];
  for (const e of entities) {
    const hit = matchesAvoid(e, avoids);
    if (hit) removed.push({ name: e.name, because: hit });
    else kept.push(e);
  }
  return { kept, removed };
}

const UNSAFE = /\b(alcohol|beer|wine|whisk(?:e)?y|bourbon|vodka|liquor|spirits|cocktails?|brewery|breweries|pubs?|taprooms?|tap houses?|saloons?|nightclubs?|lingerie|adult|erotic|sex|sexy|cannabis|marijuana|weed|vape|tobacco|cigars?|gambling|casino|firearms?|guns?|weapons?|explicit|nsfw)\b/i;
export const isWorkSafeText = (...parts: (string | undefined)[]) => !UNSAFE.test(parts.filter(Boolean).join(' '));
export const isWorkSafeEntity = (e: { name: string; tags: string[]; description?: string }) => isWorkSafeText(e.name, e.tags.join(' '), e.description);
