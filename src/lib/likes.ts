// Hearted cards, kept in this browser's localStorage with their card data, the chat and the occasion.
// Likes point at the chat by its stable id, so renaming a chat never breaks them.
// Pasted text and screenshots are never part of this: a card is the pick itself (name, tags, idea, why, the short quote).
import { LIKES_KEY_V2, type LikedCardV2, type StorageLike } from './chats';
import type { ResultCard } from './types';

export type LikedCard = LikedCardV2;
export const LIKES_KEY = LIKES_KEY_V2;

const store = (s?: StorageLike) => s ?? (globalThis as { localStorage?: Storage }).localStorage;

export const likeId = (chatId: string, occasion: string, card: Pick<ResultCard, 'kind' | 'name'>) => `${chatId}|${occasion}|${card.kind}|${card.name.toLowerCase()}`;

/** Copy only the known card fields, so nothing else can ride along into storage. */
function cleanCard(c: ResultCard): ResultCard {
  return {
    kind: c.kind, label: c.label, name: c.name, tags: [...c.tags], idea: c.idea, why: c.why, because: c.because, quote: c.quote, quoteSource: c.quoteSource,
    address: c.address, lat: c.lat, lon: c.lon, stay22: c.stay22, sample: c.sample, entityId: c.entityId,
  };
}

export function loadLikes(s?: StorageLike): LikedCard[] {
  try {
    const v = JSON.parse(store(s)?.getItem(LIKES_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.id && x.card && x.chatId) : [];
  } catch { return []; }
}

export function saveLikes(list: LikedCard[], s?: StorageLike) {
  try { store(s)?.setItem(LIKES_KEY, JSON.stringify(list.slice(0, 200))); } catch { /* storage full or blocked */ }
}

export const isLiked = (list: LikedCard[], chatId: string, occasion: string, card: Pick<ResultCard, 'kind' | 'name'>) => list.some((l) => l.id === likeId(chatId, occasion, card));

/** Heart on adds the card (newest first); heart off removes it. `chatTitle` is only a fallback label: the link is the chat id. */
export function toggleLike(list: LikedCard[], card: ResultCard, chat: { id: string; title: string }, occasion: string, now = Date.now()): LikedCard[] {
  const id = likeId(chat.id, occasion, card);
  if (list.some((l) => l.id === id)) return list.filter((l) => l.id !== id);
  return [{ id, chatId: chat.id, chatTitle: chat.title, occasion, likedAt: now, card: cleanCard(card) }, ...list];
}

export const removeLike = (list: LikedCard[], id: string) => list.filter((l) => l.id !== id);
