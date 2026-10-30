// Quote validation: every like/avoid read from text must carry a quote that appears in the text.
import type { Category, Taste } from '../src/lib/types';

export const CATEGORIES: Category[] = ['artist', 'movie', 'person', 'tv_show', 'place', 'food', 'brand', 'book', 'activity', 'other'];

export function normalizeCategory(c: unknown): Category {
  const v = String(c ?? '').toLowerCase().trim().replace(/\s+/g, '_') as Category;
  return CATEGORIES.includes(v) ? v : 'other';
}

/** Returns the exact substring of `text` that matches `quote`, or null. */
export function findExactQuote(text: string, quote: unknown): string | null {
  if (typeof quote !== 'string') return null;
  const q = quote.trim();
  if (q.length < 2) return null;
  if (text.includes(q)) return q;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx >= 0) return text.slice(idx, idx + q.length);
  // Ellipsis-joined pieces of one sentence: if every piece is in the text, in order, return the real span.
  const parts = q.split(/\.{2,}|\u2026/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    let from = 0;
    let start = -1;
    let end = -1;
    for (const part of parts) {
      const at = lower.indexOf(part.toLowerCase(), from);
      if (at < 0) return null;
      if (start < 0) start = at;
      end = at + part.length;
      from = end;
    }
    return text.slice(start, end);
  }
  return null;
}

interface RawTaste { item?: unknown; category?: unknown; quote?: unknown }

let counter = 0;
const makeId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Text source: keep an item only if its quote is found in `text`.
 * Image source (`text` is null): the quote is Gemini's short reading of the screenshot and cannot be checked
 * against a string, so those items are marked source "image".
 */
export function validateTastes(text: string | null, items: unknown): { kept: Taste[]; dropped: number } {
  const kept: Taste[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const raw of (Array.isArray(items) ? items : []) as RawTaste[]) {
    const item = typeof raw?.item === 'string' ? raw.item.trim() : '';
    const key = item.toLowerCase();
    if (!item || seen.has(key)) { dropped++; continue; }
    let quote: string | null;
    let source: 'text' | 'image';
    if (text === null) {
      quote = typeof raw.quote === 'string' && raw.quote.trim() ? raw.quote.trim().slice(0, 200) : item;
      source = 'image';
    } else {
      quote = findExactQuote(text, raw.quote);
      source = 'text';
    }
    if (!quote) { dropped++; continue; }
    seen.add(key);
    kept.push({ id: makeId(), item, category: normalizeCategory(raw.category), quote, source });
  }
  return { kept, dropped };
}

/** Re-check tastes the browser sends back. Text-sourced quotes must still be in the pasted text. */
export function revalidate(text: string | null, tastes: unknown): Taste[] {
  const list = (Array.isArray(tastes) ? tastes : []) as Taste[];
  const out: Taste[] = [];
  for (const t of list) {
    if (!t || typeof t.item !== 'string') continue;
    if (t.source === 'image') {
      out.push({ id: String(t.id ?? t.item), item: t.item.trim().slice(0, 80), category: normalizeCategory(t.category), quote: String(t.quote ?? t.item).slice(0, 200), source: 'image' });
      continue;
    }
    if (text === null) continue;
    const quote = findExactQuote(text, t.quote);
    if (quote) out.push({ id: String(t.id ?? t.item), item: t.item.trim().slice(0, 80), category: normalizeCategory(t.category), quote, source: 'text' });
  }
  return out;
}
