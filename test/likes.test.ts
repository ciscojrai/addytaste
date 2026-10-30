import { describe, expect, it } from 'vitest';
import { isLiked, likeId, loadLikes, LIKES_KEY, removeLike, saveLikes, toggleLike } from '../src/lib/likes';
import type { ResultCard } from '../src/lib/types';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};
const card = (kind: ResultCard['kind'], name: string): ResultCard => ({ kind, label: kind, name, tags: ['a'], idea: 'idea', why: 'why', because: 'gardening', quote: 'Anything for the garden', quoteSource: 'text', sample: true });
const A = { id: 'c-a', title: 'Gardening, jazz' };
const B = { id: 'c-b', title: 'Date night ideas' };

describe('liked cards storage (v2, linked by chat id)', () => {
  it('adds a heart: stores the card with its chat id, title and occasion', () => {
    const l = toggleLike([], card('place', '[sample] Patio One'), A, 'birthday', 100);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ chatId: 'c-a', chatTitle: 'Gardening, jazz', occasion: 'birthday', likedAt: 100, card: { name: '[sample] Patio One', kind: 'place', idea: 'idea' } });
    expect(isLiked(l, 'c-a', 'birthday', card('place', '[sample] Patio One'))).toBe(true);
    expect(isLiked(l, 'c-b', 'birthday', card('place', '[sample] Patio One'))).toBe(false);
    expect(isLiked(l, 'c-a', 'holidays', card('place', '[sample] Patio One'))).toBe(false);
  });

  it('toggling again (unheart) removes it, and other hearts stay', () => {
    let l = toggleLike([], card('place', 'A'), A, 'birthday');
    l = toggleLike(l, card('gift', 'B'), A, 'birthday');
    l = toggleLike(l, card('place', 'A'), A, 'birthday');
    expect(l.map((x) => x.card.name)).toEqual(['B']);
    expect(removeLike(l, likeId('c-a', 'birthday', card('gift', 'B')))).toEqual([]);
  });

  it('persists across reloads and keeps the chat link', () => {
    const s = memory();
    let l = toggleLike([], card('place', 'A'), A, 'birthday', 1);
    l = toggleLike(l, card('backup', 'C'), B, 'date_night', 2);
    saveLikes(l, s);
    const reloaded = loadLikes(s);
    expect(reloaded.map((x) => [x.card.name, x.chatId, x.occasion])).toEqual([['C', 'c-b', 'date_night'], ['A', 'c-a', 'birthday']]);
    saveLikes(removeLike(reloaded, reloaded[0].id), s);
    expect(loadLikes(s).map((x) => x.card.name)).toEqual(['A']);
  });

  it('the same pick in two chats, or two occasions, is a separate heart', () => {
    let l = toggleLike([], card('place', 'A'), A, 'birthday');
    l = toggleLike(l, card('place', 'A'), B, 'birthday');
    l = toggleLike(l, card('place', 'A'), A, 'holidays');
    expect(l).toHaveLength(3);
  });

  it('stores only card fields: no pasted text, no image', () => {
    const s = memory();
    const dirty = { ...card('gift', 'G'), text: 'FULL PASTED TEXT', image: 'data:image/png;base64,AAAA' } as unknown as ResultCard;
    saveLikes(toggleLike([], dirty, A, 'birthday'), s);
    expect(s.raw.get(LIKES_KEY) as string).not.toMatch(/FULL PASTED TEXT|base64/);
  });

  it('survives corrupt or missing storage', () => {
    const s = memory();
    expect(loadLikes(s)).toEqual([]);
    s.setItem(LIKES_KEY, '{not json');
    expect(loadLikes(s)).toEqual([]);
    s.setItem(LIKES_KEY, JSON.stringify([{ nope: 1 }, { id: 'x', card: card('gift', 'G'), chatId: 'c-a', chatTitle: 'T', occasion: 'birthday', likedAt: 1 }]));
    expect(loadLikes(s)).toHaveLength(1);
  });
});
