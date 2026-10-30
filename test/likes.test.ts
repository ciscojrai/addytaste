import { describe, expect, it } from 'vitest';
import { isLiked, likeId, loadLikes, LIKES_KEY, removeLike, saveLikes, toggleLike } from '../src/lib/likes';
import type { ResultCard } from '../src/lib/types';

// A tiny in-memory Storage, so a "reload" is just reading it again with a fresh load.
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};
const card = (kind: ResultCard['kind'], name: string): ResultCard => ({ kind, label: kind, name, tags: ['a'], idea: 'idea', why: 'why', because: 'gardening', quote: 'Anything for the garden', quoteSource: 'text', sample: true });

describe('liked cards storage', () => {
  it('adds a heart: stores the card with its chat name', () => {
    const l = toggleLike([], card('place', '[sample] Patio One'), 'Mom, birthday', 100);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ threadTitle: 'Mom, birthday', threadId: 'th-mom-birthday', likedAt: 100, card: { name: '[sample] Patio One', kind: 'place', idea: 'idea' } });
    expect(isLiked(l, 'Mom, birthday', card('place', '[sample] Patio One'))).toBe(true);
    expect(isLiked(l, 'Date, summer date', card('place', '[sample] Patio One'))).toBe(false);
  });

  it('toggling again (unheart) removes it, and other hearts stay', () => {
    let l = toggleLike([], card('place', 'A'), 'Mom, birthday');
    l = toggleLike(l, card('gift', 'B'), 'Mom, birthday');
    l = toggleLike(l, card('place', 'A'), 'Mom, birthday');
    expect(l.map((x) => x.card.name)).toEqual(['B']);
    expect(removeLike(l, likeId('Mom, birthday', card('gift', 'B')))).toEqual([]);
  });

  it('persists across reloads and keeps the chat name', () => {
    const s = memory();
    let l = toggleLike([], card('place', 'A'), 'Mom, birthday', 1);
    l = toggleLike(l, card('backup', 'C'), 'Date, summer date', 2);
    saveLikes(l, s);
    const reloaded = loadLikes(s);
    expect(reloaded.map((x) => [x.card.name, x.threadTitle, x.threadId])).toEqual([['C', 'Date, summer date', 'th-date-summer-date'], ['A', 'Mom, birthday', 'th-mom-birthday']]);
    saveLikes(removeLike(reloaded, reloaded[0].id), s);
    expect(loadLikes(s).map((x) => x.card.name)).toEqual(['A']);
  });

  it('the same pick in two chats is two separate hearts', () => {
    let l = toggleLike([], card('place', 'A'), 'Mom, birthday');
    l = toggleLike(l, card('place', 'A'), 'Partner, anniversary');
    expect(l).toHaveLength(2);
  });

  it('stores only card fields: no pasted text, no image', () => {
    const s = memory();
    const dirty = { ...card('gift', 'G'), text: 'FULL PASTED TEXT', image: 'data:image/png;base64,AAAA' } as unknown as ResultCard;
    saveLikes(toggleLike([], dirty, 'Mom, birthday'), s);
    const raw = s.raw.get(LIKES_KEY) as string;
    expect(raw).not.toMatch(/FULL PASTED TEXT|base64/);
  });

  it('survives corrupt or missing storage', () => {
    const s = memory();
    expect(loadLikes(s)).toEqual([]);
    s.setItem(LIKES_KEY, '{not json');
    expect(loadLikes(s)).toEqual([]);
    s.setItem(LIKES_KEY, JSON.stringify([{ nope: 1 }, { id: 'x', card: card('gift', 'G'), threadTitle: 'T', threadId: 't', likedAt: 1 }]));
    expect(loadLikes(s)).toHaveLength(1);
  });
});
