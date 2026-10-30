// Chats are the unit of memory. A chat can be about a person or anything else. Each chat keeps its own chips
// (likes and avoids), city, budget group, notes and results in this browser's localStorage, so a new occasion starts
// with the chips already loaded. Qloo stores no profile; this is the memory on top of it.
// Pasted text and screenshots are never saved. A chip keeps its short quote, a run keeps the result.
// Chats are keyed by a stable id, so renaming a chat never breaks the likes that point at it.
import { LEGACY_OCCASION, OCCASIONS, occasionById, type Group } from './occasions';
import type { InsightResult, ResultCard, Taste } from './types';

export const CHATS_KEY = 'addytaste.chats.v2';
export const LIKES_KEY_V2 = 'addytaste.likes.v2';
/** Old (v1) keys. They are only ever read, never deleted, so old data stays readable. */
export const THREADS_KEY_V1 = 'addytaste.threads.v1';
export const LIKES_KEY_V1 = 'addytaste.likes.v1';

export interface Toggle { taste: Taste; on: boolean }
export interface ChatRun {
  runId: string;
  at: number;
  occasion: string;
  group: string | null;
  city: string;
  sourceKind: 'text' | 'image';
  result: InsightResult;
  /** Which chips, city and budget this result was made from. A different signature means the result is stale. */
  sig?: string;
}
export interface Note { at: number; text: string }

export interface Chat {
  /** Stable id. Never derived from the title. */
  id: string;
  title: string;
  /** True while the title is still the automatic one. Renaming sets it to false. */
  titleAuto: boolean;
  /** True for the sample chats seeded for first-time visitors. */
  sample?: boolean;
  city: string;
  /** White Elephant budget group. */
  group: Group;
  /** The occasion this chat was last on. */
  occasion: string;
  likes: Toggle[];
  avoids: Toggle[];
  /** One result per occasion, newest first. */
  runs: ChatRun[];
  notes: Note[];
  /** Occasions still to be prepared (sample chats only). */
  queue?: string[];
  updatedAt: number;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const store = (s?: StorageLike) => s ?? (globalThis as { localStorage?: Storage }).localStorage;

export const newChatId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const sameItem = (a: string, b: string) => keyOf(a) === keyOf(b);
export const occasionLabel = (id: string) => occasionById(id)?.label ?? id;

export const NEW_CHAT_TITLE = 'New chat';
const upFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Neutral default title: the first liked items ("Gardening, jazz"), else the occasion ("Birthday ideas"), else "New chat".
 * It never guesses who the chat is about.
 */
export function defaultTitle(likes: { item: string }[], occasion?: string): string {
  const items = likes.map((l) => l.item.trim()).filter(Boolean).slice(0, 2);
  if (items.length) return upFirst(items.join(', ')).slice(0, 40);
  const label = occasion ? occasionById(occasion)?.label : undefined;
  return label ? `${label} ideas` : NEW_CHAT_TITLE;
}

export function newChat(init: Partial<Chat> = {}, now = Date.now()): Chat {
  return { id: newChatId(), title: NEW_CHAT_TITLE, titleAuto: true, city: '', group: 'friends', occasion: 'birthday', likes: [], avoids: [], runs: [], notes: [], updatedAt: now, ...init };
}

/** Rename rules: trimmed, not empty, at most 40 characters. */
export function validTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return t ? t : null;
}

/** Rename a chat. An empty name is rejected (returns null). The id, likes and results are untouched. */
export function renameChat(chats: Chat[], id: string, raw: string): Chat[] | null {
  const t = validTitle(raw);
  if (!t) return null;
  return chats.map((c) => (c.id === id ? { ...c, title: t, titleAuto: false } : c));
}

export const runFor = (c: Chat, occasion: string) => c.runs.find((r) => r.occasion === occasion);

/** Replace this chat's result for the occasion (one result per occasion), newest first. */
export function upsertRun(c: Chat, run: ChatRun): Chat {
  const runs = [run, ...c.runs.filter((r) => r.occasion !== run.occasion)].sort((a, b) => b.at - a.at);
  return { ...c, runs, updatedAt: Math.max(c.updatedAt, run.at) };
}

/** What a result was made from. */
export function runSig(c: Pick<Chat, 'likes' | 'avoids' | 'city' | 'group'>, occasion: string): string {
  return JSON.stringify([occasion, c.likes.filter((t) => t.on).map((t) => t.taste.id), c.avoids.filter((t) => t.on).map((t) => t.taste.id), c.city.trim(), occasion === 'white_elephant' ? c.group : null]);
}

/** Gift and brand picks from this chat's other occasions, so a gift does not repeat. */
export function priorGifts(c: Chat, occasion: string): { name: string; id?: string }[] {
  const out: { name: string; id?: string }[] = [];
  for (const r of c.runs) {
    if (r.occasion === occasion) continue;
    for (const card of r.result.cards) {
      if (card.kind !== 'gift') continue;
      if (!out.some((o) => sameItem(o.name, card.name))) out.push({ name: card.name, id: card.entityId });
    }
  }
  return out;
}

export interface LastTime { occasion: string; at: number; gift?: string; place?: string }
/** The most recent result from another occasion, for the "Last time" line. */
export function lastTime(c: Chat, occasion: string): LastTime | null {
  const r = c.runs.filter((x) => x.occasion !== occasion).sort((a, b) => b.at - a.at)[0];
  if (!r) return null;
  const name = (kind: string) => r.result.cards.find((x) => x.kind === kind)?.name.replace(/^\[sample\] /, '');
  return { occasion: r.occasion, at: r.at, gift: name('gift'), place: name('place') };
}

// ---------- chips: follow-up merge ----------
export interface ChipUpdateLike { addLikes: Taste[]; addAvoids: Taste[]; removeLikes: string[]; removeAvoids: string[] }

/** Apply a validated follow-up to a chat's chips. Added chips are on; removed ones are dropped. The note uses the chat's current title. */
export function applyChipUpdate(c: Pick<Chat, 'title' | 'likes' | 'avoids'>, u: ChipUpdateLike): { likes: Toggle[]; avoids: Toggle[]; note: string | null } {
  const drop = (list: Toggle[], items: string[]) => list.filter((t) => !items.some((i) => sameItem(i, t.taste.item)));
  const add = (list: Toggle[], tastes: Taste[]) => [...list, ...tastes.filter((t) => !list.some((x) => sameItem(x.taste.item, t.item))).map((t) => ({ taste: t, on: true }))];
  const likes = add(drop(c.likes, u.removeLikes), u.addLikes);
  const avoids = add(drop(c.avoids, u.removeAvoids), u.addAvoids);
  const parts = [
    ...u.addLikes.map((t) => `+${t.item}`),
    ...u.removeLikes.map((i) => `\u2212${i}`),
    ...u.addAvoids.map((t) => `avoid ${t.item}`),
    ...u.removeAvoids.map((i) => `unavoid ${i}`),
  ];
  return { likes, avoids, note: parts.length ? `Updated ${c.title}: ${parts.join(', ')}` : null };
}

/** All chips' quotes joined: each quote is an exact piece of an earlier message, so the server can re-check them. */
export const quotesText = (c: Pick<Chat, 'likes' | 'avoids'>) => [...c.likes, ...c.avoids].map((t) => t.taste.quote).join('\n');

// ---------- seed ----------
const chip = (id: string, item: string, category: Taste['category'], quote: string): Toggle => ({ on: true, taste: { id, item, category, quote, source: 'text' } });

/**
 * Three clearly labeled sample chats with neutral titles. Used only when nothing at all is stored.
 * The first one shows the multi-occasion flow: two occasions, with a "Last time" line and a gift that does not repeat.
 */
export function seedChats(now = Date.now()): Chat[] {
  return [
    newChat({ id: 'c-sample-birthday', title: 'Sample \u00b7 Birthday ideas', titleAuto: false, sample: true, city: 'New Orleans', occasion: 'birthday', queue: ['holidays', 'birthday'],
      likes: [chip('s-b1', 'gardening', 'activity', 'Sample: loves gardening'), chip('s-b2', 'Fleetwood Mac', 'artist', 'Sample: loves Fleetwood Mac'), chip('s-b3', 'tea shop', 'place', 'Sample: loves a good tea shop')],
      avoids: [chip('s-b4', 'scented candles', 'other', 'Sample: no more scented candles')] }, now),
    newChat({ id: 'c-sample-date', title: 'Sample \u00b7 Date night', titleAuto: false, sample: true, city: 'New Orleans', occasion: 'date_night', queue: ['date_night'],
      likes: [chip('s-d1', 'live jazz', 'other', 'Sample: loves live jazz'), chip('s-d2', 'oysters', 'food', 'Sample: loves oysters'), chip('s-d3', 'Norah Jones', 'artist', 'Sample: loves Norah Jones')],
      avoids: [chip('s-d4', 'tasting menus', 'food', 'Sample: avoids long tasting menus')] }, now - 1),
    newChat({ id: 'c-sample-holiday', title: 'Sample \u00b7 Holiday gifts', titleAuto: false, sample: true, city: 'New Orleans', occasion: 'holidays', queue: ['holidays'],
      likes: [chip('s-h1', 'coffee', 'food', 'Sample: lives on coffee'), chip('s-h2', 'Michael Lewis', 'person', 'Sample: reads Michael Lewis'), chip('s-h3', 'Sade', 'artist', 'Sample: plays Sade in the car')],
      avoids: [chip('s-h4', 'neckties', 'other', 'Sample: no more neckties')] }, now - 2),
  ];
}

// ---------- migration from v1 ----------
interface V1Run { runId: string; at: number; occasion: string; group: string | null; city: string; sourceKind: 'text' | 'image'; likes: Toggle[]; avoids: Toggle[]; result: InsightResult }
interface V1Thread { id: string; title: string; person: string; occasion: string; group: string | null; updatedAt: number; runs: V1Run[] }
interface V1Like { id: string; threadId: string; threadTitle: string; likedAt: number; card: ResultCard }
export interface LikedCardV2 { id: string; chatId: string; chatTitle: string; occasion: string; likedAt: number; card: ResultCard }

const mapOccasion = (o: string) => LEGACY_OCCASION[o] ?? (occasionById(o) ? o : 'birthday');
const hasItem = (list: Toggle[], t: Toggle) => list.some((x) => sameItem(x.taste.item, t.taste.item));

/** One chat per v1 thread. The v1 title (set by the user's own runs, e.g. "Mom, birthday") stays as the chat title, and the v1 thread id becomes the chat id. */
export function migrateThreads(threads: V1Thread[]): Chat[] {
  return threads.map((t) => {
    let c = newChat({ id: t.id, title: t.title, titleAuto: false, updatedAt: t.updatedAt, occasion: mapOccasion(t.occasion) });
    for (const r of [...(t.runs ?? [])].sort((a, b) => a.at - b.at)) {
      const occ = mapOccasion(r.occasion);
      c = {
        ...c,
        city: r.city || c.city,
        group: (r.group as Group) || c.group,
        occasion: occ,
        likes: [...c.likes.filter((x) => !hasItem(r.avoids, x)), ...r.likes.filter((n) => !c.likes.some((x) => sameItem(x.taste.item, n.taste.item)))],
        avoids: [...c.avoids, ...r.avoids.filter((n) => !hasItem(c.avoids, n))],
      };
      c = upsertRun(c, { runId: r.runId, at: r.at, occasion: occ, group: r.group, city: r.city, sourceKind: r.sourceKind, result: { ...r.result, occasion: occ } });
    }
    return c;
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** v1 likes pointed at a thread id and a title; the thread id is now the chat id, and the occasion comes from the thread. */
export function migrateLikes(likes: V1Like[], threads: V1Thread[]): LikedCardV2[] {
  return likes.filter((l) => l && l.id && l.card).map((l) => {
    const t = threads.find((x) => x.id === l.threadId);
    const title = l.threadTitle || t?.title || '';
    const suffix = title.slice(title.indexOf(',') + 1).toLowerCase();
    const occasion = t ? mapOccasion(t.occasion) : suffix.includes('anniversary') ? 'anniversary' : suffix.includes('date') ? 'date_night' : suffix.includes('white elephant') ? 'white_elephant' : suffix.includes('birthday') ? 'birthday' : '';
    return { id: `${l.threadId}|${occasion}|${l.card.kind}|${l.card.name.toLowerCase()}`, chatId: l.threadId, chatTitle: title, occasion, likedAt: l.likedAt, card: l.card };
  });
}

const parseList = <T,>(raw: string | null | undefined): T[] => {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

export function saveChats(chats: Chat[], s?: StorageLike) {
  try { store(s)?.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 60))); } catch { /* storage full or blocked */ }
}

/**
 * Load chats. v2 present: use it. Otherwise migrate v1 chats and likes (v1 keys are left untouched).
 * Otherwise, and only when nothing at all is stored, seed the sample chats.
 */
export function bootstrap(s?: StorageLike, now = Date.now()): { chats: Chat[]; likes: LikedCardV2[]; how: 'existing' | 'migrated' | 'seeded' | 'empty' } {
  const st = store(s);
  if (!st) return { chats: [], likes: [], how: 'empty' };
  const raw = st.getItem(CHATS_KEY);
  if (raw !== null) {
    return {
      chats: parseList<Chat>(raw).filter((c) => c && c.id && c.title && Array.isArray(c.likes)),
      likes: parseList<LikedCardV2>(st.getItem(LIKES_KEY_V2)).filter((l) => l && l.id && l.card),
      how: 'existing',
    };
  }
  const threads = parseList<V1Thread>(st.getItem(THREADS_KEY_V1)).filter((t) => t && t.id && Array.isArray(t.runs));
  const v1likes = parseList<V1Like>(st.getItem(LIKES_KEY_V1));
  if (threads.length || v1likes.length) {
    const chats = migrateThreads(threads);
    const likes = migrateLikes(v1likes, threads);
    saveChats(chats, st);
    try { st.setItem(LIKES_KEY_V2, JSON.stringify(likes)); } catch { /* ignore */ }
    return { chats, likes, how: 'migrated' };
  }
  const chats = seedChats(now);
  saveChats(chats, st);
  return { chats, likes: [], how: 'seeded' };
}

export const OCCASION_IDS = OCCASIONS.map((o) => o.id);
