// Hearted cards, kept in this browser's localStorage with their card data and the chat they came from.
// Pasted text and screenshots are never part of this: a card is the pick itself (name, tags, idea, why, the short quote).
import { threadId } from './storage';
import type { ResultCard } from './types';

export interface LikedCard {
  id: string;
  threadId: string;
  /** The chat name, for example "Mom, birthday". */
  threadTitle: string;
  likedAt: number;
  card: ResultCard;
}

export const LIKES_KEY = 'addytaste.likes.v1';

const store = (s?: Pick<Storage, 'getItem' | 'setItem'>) => s ?? (globalThis as { localStorage?: Storage }).localStorage;

export const likeId = (threadTitle: string, card: Pick<ResultCard, 'kind' | 'name'>) => `${threadId(threadTitle)}|${card.kind}|${card.name.toLowerCase()}`;

/** Copy only the known card fields, so nothing else can ride along into storage. */
function cleanCard(c: ResultCard): ResultCard {
  return {
    kind: c.kind, label: c.label, name: c.name, tags: [...c.tags], idea: c.idea, why: c.why, because: c.because, quote: c.quote, quoteSource: c.quoteSource,
    address: c.address, lat: c.lat, lon: c.lon, stay22: c.stay22, sample: c.sample,
  };
}

export function loadLikes(s?: Pick<Storage, 'getItem' | 'setItem'>): LikedCard[] {
  try {
    const v = JSON.parse(store(s)?.getItem(LIKES_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.id && x.card && x.threadTitle) : [];
  } catch { return []; }
}

export function saveLikes(list: LikedCard[], s?: Pick<Storage, 'getItem' | 'setItem'>) {
  try { store(s)?.setItem(LIKES_KEY, JSON.stringify(list.slice(0, 200))); } catch { /* storage full or blocked */ }
}

export const isLiked = (list: LikedCard[], threadTitle: string, card: Pick<ResultCard, 'kind' | 'name'>) => list.some((l) => l.id === likeId(threadTitle, card));

/** Heart on adds the card (newest first); heart off removes it. */
export function toggleLike(list: LikedCard[], card: ResultCard, threadTitle: string, now = Date.now()): LikedCard[] {
  const id = likeId(threadTitle, card);
  if (list.some((l) => l.id === id)) return list.filter((l) => l.id !== id);
  return [{ id, threadId: threadId(threadTitle), threadTitle, likedAt: now, card: cleanCard(card) }, ...list];
}

export const removeLike = (list: LikedCard[], id: string) => list.filter((l) => l.id !== id);
