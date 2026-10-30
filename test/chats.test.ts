import { describe, expect, it } from 'vitest';
import {
  applyChipUpdate, bootstrap, CHATS_KEY, defaultTitle, lastTime, LIKES_KEY_V1, LIKES_KEY_V2, newChat, priorGifts, quotesText, renameChat, runFor, runSig,
  saveChats, seedChats, THREADS_KEY_V1, upsertRun, validTitle, type Chat, type ChatRun, type Toggle,
} from '../src/lib/chats';
import { isLiked, loadLikes, saveLikes, toggleLike } from '../src/lib/likes';
import type { InsightResult, ResultCard } from '../src/lib/types';
import { runInsight } from '../server/pipeline';
import { createQlooClient } from '../server/qloo';
import { like, makeSamplesDir } from './helpers';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map<string, string>(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};
const card = (kind: ResultCard['kind'], name: string, entityId?: string): ResultCard => ({ kind, label: kind, name, tags: ['a'], idea: 'i', why: 'w', because: 'b', quote: 'q', quoteSource: 'text', sample: true, entityId });
const result = (occasion: string, cards: ResultCard[]): InsightResult => ({ occasion, cards } as unknown as InsightResult);
const run = (occasion: string, at: number, cards: ResultCard[], over: Partial<ChatRun> = {}): ChatRun => ({ runId: `r-${occasion}`, at, occasion, group: null, city: 'Chicago', sourceKind: 'text', result: result(occasion, cards), ...over });
const tog = (item: string, quote = item, on = true): Toggle => ({ on, taste: { ...like(item, 'other', quote) } });
const BAD = /\b(mom|dad|partner|mother|father)\b/i;

describe('chat model and default titles', () => {
  it('title: first liked items, else the occasion, else "New chat"', () => {
    expect(defaultTitle([{ item: 'gardening' }, { item: 'jazz' }, { item: 'tea' }], 'birthday')).toBe('Gardening, jazz');
    expect(defaultTitle([{ item: 'gardening' }], 'holidays')).toBe('Gardening');
    expect(defaultTitle([], 'birthday')).toBe('Birthday ideas');
    expect(defaultTitle([], 'date_night')).toBe('Date night ideas');
    expect(defaultTitle([])).toBe('New chat');
    expect(defaultTitle([], 'nonsense')).toBe('New chat');
  });

  it('a default title never names a relation', () => {
    for (const o of ['mothers_day', 'fathers_day', 'valentines', 'anniversary', 'birthday']) expect(defaultTitle([], o)).toMatch(/ ideas$/);
    expect(defaultTitle([], 'fathers_day')).toBe("Father's Day ideas");
    expect(defaultTitle([], 'mothers_day')).toBe("Mother's Day ideas");
    expect(defaultTitle([{ item: 'x'.repeat(80) }]).length).toBeLessThanOrEqual(40);
  });

  it('newChat gets a stable id that does not come from the title', () => {
    const a = newChat({ title: 'Same' });
    const b = newChat({ title: 'Same' });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^c-/);
    expect(a).toMatchObject({ titleAuto: true, likes: [], avoids: [], runs: [], notes: [] });
  });

  it('keeps one result per occasion, newest first', () => {
    let c = newChat();
    c = upsertRun(c, run('birthday', 1, [card('gift', 'A')]));
    c = upsertRun(c, run('holidays', 2, [card('gift', 'B')]));
    c = upsertRun(c, run('birthday', 3, [card('gift', 'C')]));
    expect(c.runs.map((r) => [r.occasion, r.at])).toEqual([['birthday', 3], ['holidays', 2]]);
    expect(runFor(c, 'birthday')?.result.cards[0].name).toBe('C');
  });
});

describe('chip carryover between occasions', () => {
  it('a new occasion keeps the same chips, and the signature only changes with chips, city or budget', () => {
    const c = newChat({ likes: [tog('gardening'), tog('jazz')], avoids: [tog('candles')], city: 'Chicago' });
    const sameChips = { ...c, occasion: 'holidays' };
    expect(sameChips.likes).toBe(c.likes);
    expect(runSig(c, 'birthday')).not.toBe(runSig(c, 'holidays'));
    expect(runSig(c, 'birthday')).toBe(runSig({ ...c }, 'birthday'));
    expect(runSig({ ...c, likes: [tog('gardening'), tog('jazz', 'jazz', false)] }, 'birthday')).not.toBe(runSig(c, 'birthday'));
    expect(runSig({ ...c, city: 'Austin' }, 'birthday')).not.toBe(runSig(c, 'birthday'));
    expect(runSig({ ...c, group: 'work' }, 'birthday')).toBe(runSig(c, 'birthday'));
    expect(runSig({ ...c, group: 'work' }, 'white_elephant')).not.toBe(runSig({ ...c, group: 'family' }, 'white_elephant'));
  });

  it('carried text-sourced chips still pass the server quote check after the original paste is gone', async () => {
    const c = newChat({ likes: [tog('gardening', 'she loves gardening'), tog('jazz', 'jazz on Sundays')], avoids: [tog('candles', 'no more candles')], city: 'Chicago' });
    const text = quotesText(c);
    expect(text).toContain('she loves gardening');
    const gem = { available: true, compose: async () => { throw new Error('down'); }, read: async () => ({}) } as never;
    const r = await runInsight({ occasion: 'holidays', city: 'Chicago', text, likes: c.likes.map((t) => t.taste), avoids: c.avoids.map((t) => t.taste), runId: 'x' }, { qloo: createQlooClient({ samplesDir: makeSamplesDir() }), gemini: gem, stay22Aid: 'x' });
    expect(r.cards).toHaveLength(3);
    // without the carried quotes the same chips would be dropped
    await expect(runInsight({ occasion: 'holidays', city: 'Chicago', text: 'something else', likes: c.likes.map((t) => t.taste), avoids: [], runId: 'x' }, { qloo: createQlooClient({ samplesDir: makeSamplesDir() }), gemini: gem, stay22Aid: 'x' })).rejects.toThrow();
  });
});

describe('follow-up merge', () => {
  const c = { title: 'Birthday ideas', likes: [tog('gardening'), tog('jazz')], avoids: [tog('candles')] };

  it('adds and removes chips and writes a note with the chat title (no relation guessed)', () => {
    const r = applyChipUpdate(c, { addLikes: [like('hiking', 'activity', 'into hiking')], addAvoids: [], removeLikes: ['jazz'], removeAvoids: [] });
    expect(r.likes.map((t) => t.taste.item)).toEqual(['gardening', 'hiking']);
    expect(r.likes.every((t) => t.on)).toBe(true);
    expect(r.avoids.map((t) => t.taste.item)).toEqual(['candles']);
    expect(r.note).toBe('Updated Birthday ideas: +hiking, \u2212jazz');
    expect(r.note).not.toMatch(BAD);
  });

  it('uses the current (renamed) title, adds avoids, and returns no note when nothing changed', () => {
    const r = applyChipUpdate({ ...c, title: 'Chips' }, { addLikes: [], addAvoids: [like('perfume', 'other', 'no perfume')], removeLikes: [], removeAvoids: ['candles'] });
    expect(r.note).toBe('Updated Chips: avoid perfume, unavoid candles');
    expect(applyChipUpdate(c, { addLikes: [], addAvoids: [], removeLikes: [], removeAvoids: [] }).note).toBeNull();
  });

  it('does not duplicate a chip that is already there', () => {
    const r = applyChipUpdate(c, { addLikes: [like('Gardening')], addAvoids: [], removeLikes: [], removeAvoids: [] });
    expect(r.likes).toHaveLength(2);
  });
});

describe('last time and exclusions', () => {
  const chat = (): Chat => {
    let x = newChat({ id: 'c-1', likes: [tog('gardening')] });
    x = upsertRun(x, run('holidays', 100, [card('place', '[sample] Cafe'), card('gift', '[sample] Garden Goods', 'G-1'), card('backup', 'Movie')]));
    x = upsertRun(x, run('birthday', 200, [card('place', 'Park'), card('gift', 'Scent House', 'G-2')]));
    return x;
  };

  it('collects gift names and ids from the other occasions only', () => {
    expect(priorGifts(chat(), 'birthday')).toEqual([{ name: '[sample] Garden Goods', id: 'G-1' }]);
    expect(priorGifts(chat(), 'anniversary').map((g) => g.name)).toEqual(['Scent House', '[sample] Garden Goods']);
    expect(priorGifts(newChat(), 'birthday')).toEqual([]);
  });

  it('"Last time" is the most recent other occasion, with the sample prefix stripped', () => {
    expect(lastTime(chat(), 'holidays')).toEqual({ occasion: 'birthday', at: 200, gift: 'Scent House', place: 'Park' });
    expect(lastTime(chat(), 'birthday')).toEqual({ occasion: 'holidays', at: 100, gift: 'Garden Goods', place: 'Cafe' });
    expect(lastTime(newChat(), 'birthday')).toBeNull();
  });
});

describe('seeding sample chats', () => {
  it('seeds only when nothing is stored, with neutral titles all marked Sample', () => {
    const s = memory();
    const b = bootstrap(s);
    expect(b.how).toBe('seeded');
    expect(b.chats.map((c) => c.title)).toEqual(['Sample \u00b7 Birthday ideas', 'Sample \u00b7 Date night', 'Sample \u00b7 Holiday gifts']);
    for (const c of b.chats) { expect(c.sample).toBe(true); expect(c.title).not.toMatch(BAD); expect(c.title.startsWith('Sample')).toBe(true); expect(c.titleAuto).toBe(false); }
    expect(b.chats[0].queue).toEqual(['holidays', 'birthday']);
    expect(b.likes).toEqual([]);
    expect(s.getItem(CHATS_KEY)).not.toBeNull();
  });

  it('no seed chat id, title or chip names Mom, Dad or Partner', () => {
    expect(JSON.stringify(seedChats())).not.toMatch(/\b(mom|dad|partner)\b/i);
  });

  it('never overwrites real data', () => {
    const real = [newChat({ id: 'c-real', title: 'My chat', likes: [tog('tea')] })];
    const s = memory();
    saveChats(real, s);
    const b = bootstrap(s);
    expect(b.how).toBe('existing');
    expect(b.chats.map((c) => c.id)).toEqual(['c-real']);
    expect(JSON.parse(s.getItem(CHATS_KEY) as string).some((c: Chat) => c.sample)).toBe(false);
    // an existing but empty v2 list stays empty too: the user deleted everything on purpose
    const e = memory({ [CHATS_KEY]: '[]' });
    expect(bootstrap(e).chats).toEqual([]);
  });

  it('does not seed when only v1 data exists (it migrates instead)', () => {
    const s = memory({ [THREADS_KEY_V1]: JSON.stringify([{ id: 'th-1', title: 'Mom, birthday', person: 'Mom', occasion: 'mom_birthday', group: null, updatedAt: 5, runs: [] }]) });
    const b = bootstrap(s);
    expect(b.how).toBe('migrated');
    expect(b.chats.some((c) => c.sample)).toBe(false);
  });
});

describe('migration from v1', () => {
  const v1Result = result('mom_birthday', [card('place', 'Park'), card('gift', 'Garden Goods', 'G-1')]);
  const threads = [
    {
      id: 'th-mom-birthday', title: 'Mom, birthday', person: 'Mom', occasion: 'mom_birthday', group: null, updatedAt: 50,
      runs: [{ runId: 'r1', at: 50, occasion: 'mom_birthday', group: null, city: 'Chicago', sourceKind: 'text' as const, likes: [tog('gardening')], avoids: [tog('candles')], result: v1Result }],
    },
    { id: 'th-date', title: 'Date, summer date', person: 'Date', occasion: 'summer_date', group: null, updatedAt: 20, runs: [] },
  ];
  const likes = [
    { id: 'th-mom-birthday|gift|garden goods', threadId: 'th-mom-birthday', threadTitle: 'Mom, birthday', likedAt: 9, card: card('gift', 'Garden Goods') },
    { id: 'th-date|place|cafe', threadId: 'th-date', threadTitle: 'Date, summer date', likedAt: 8, card: card('place', 'Cafe') },
  ];

  it('keeps the v1 title as the chat title and maps the occasion', () => {
    const s = memory({ [THREADS_KEY_V1]: JSON.stringify(threads), [LIKES_KEY_V1]: JSON.stringify(likes) });
    const b = bootstrap(s);
    expect(b.how).toBe('migrated');
    const mom = b.chats.find((c) => c.id === 'th-mom-birthday') as Chat;
    expect(mom.title).toBe('Mom, birthday');
    expect(mom.titleAuto).toBe(false);
    expect(mom.occasion).toBe('birthday');
    expect(mom.city).toBe('Chicago');
    expect(mom.likes.map((t) => t.taste.item)).toEqual(['gardening']);
    expect(mom.avoids.map((t) => t.taste.item)).toEqual(['candles']);
    expect(mom.runs.map((r) => r.occasion)).toEqual(['birthday']);
    expect(mom.runs[0].result.cards[1].name).toBe('Garden Goods');
    expect(b.chats.find((c) => c.id === 'th-date')?.occasion).toBe('date_night');
  });

  it('migrated likes link to the chat by id and occasion, and show as liked', () => {
    const s = memory({ [THREADS_KEY_V1]: JSON.stringify(threads), [LIKES_KEY_V1]: JSON.stringify(likes) });
    const b = bootstrap(s);
    expect(b.likes.map((l) => [l.chatId, l.occasion, l.card.name])).toEqual([['th-mom-birthday', 'birthday', 'Garden Goods'], ['th-date', 'date_night', 'Cafe']]);
    expect(isLiked(b.likes, 'th-mom-birthday', 'birthday', card('gift', 'Garden Goods'))).toBe(true);
    expect(JSON.parse(s.getItem(LIKES_KEY_V2) as string)).toHaveLength(2);
  });

  it('keeps the v1 data readable (untouched) and does not migrate twice', () => {
    const s = memory({ [THREADS_KEY_V1]: JSON.stringify(threads), [LIKES_KEY_V1]: JSON.stringify(likes) });
    bootstrap(s);
    expect(JSON.parse(s.getItem(THREADS_KEY_V1) as string)).toEqual(threads);
    expect(JSON.parse(s.getItem(LIKES_KEY_V1) as string)).toEqual(likes);
    expect(bootstrap(s).how).toBe('existing');
  });
});

describe('rename', () => {
  it('persists, keeps the id, and rejects an empty name', () => {
    const s = memory();
    const chats = [newChat({ id: 'c-1', title: 'Birthday ideas' }), newChat({ id: 'c-2', title: 'Other' })];
    expect(renameChat(chats, 'c-1', '   ')).toBeNull();
    expect(renameChat(chats, 'c-1', '')).toBeNull();
    const renamed = renameChat(chats, 'c-1', '  Mom  ') as Chat[];
    expect(renamed[0]).toMatchObject({ id: 'c-1', title: 'Mom', titleAuto: false });
    expect(renamed[1].title).toBe('Other');
    saveChats(renamed, s);
    expect(bootstrap(s).chats.find((c) => c.id === 'c-1')?.title).toBe('Mom');
    expect(validTitle('x'.repeat(100))?.length).toBe(40);
  });

  it('likes stay linked to the chat after a rename', () => {
    const s = memory();
    const chat = newChat({ id: 'c-1', title: 'Birthday ideas' });
    const hearts = toggleLike([], card('gift', 'Garden Goods'), { id: chat.id, title: chat.title }, 'birthday', 1);
    saveChats([chat], s);
    saveLikes(hearts, s);
    const renamed = renameChat([chat], 'c-1', 'Mom') as Chat[];
    saveChats(renamed, s);
    const b = bootstrap(s);
    const reloaded = loadLikes(s);
    expect(b.chats[0].title).toBe('Mom');
    expect(reloaded[0].chatId).toBe(b.chats[0].id);
    expect(b.chats.find((c) => c.id === reloaded[0].chatId)?.title).toBe('Mom');
    expect(isLiked(reloaded, b.chats[0].id, 'birthday', card('gift', 'Garden Goods'))).toBe(true);
    // un-hearting still works with the new title
    expect(toggleLike(reloaded, card('gift', 'Garden Goods'), { id: b.chats[0].id, title: 'Mom' }, 'birthday')).toEqual([]);
  });
});
