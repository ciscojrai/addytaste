import { describe, expect, it } from 'vitest';
import { threadId, upsertRun, type SavedRun, type Thread } from '../src/lib/storage';
import type { InsightResult } from '../src/lib/types';

const result = {} as InsightResult;
const run = (runId: string, at: number): SavedRun => ({ runId, at, occasion: 'mom_birthday', group: null, city: 'X', sourceKind: 'text', likes: [], avoids: [], result });
const meta = (title: string) => ({ title, person: 'Mom', occasion: 'mom_birthday', group: null });

describe('chat threads', () => {
  it('saves a result into the person thread and keeps the id stable', () => {
    const t = upsertRun([], meta('Mom, birthday'), run('a', 1));
    expect(t).toHaveLength(1);
    expect(t[0].id).toBe(threadId('Mom, birthday'));
    expect(t[0].id).toBe('th-mom-birthday');
    expect(t[0].runs.map((r) => r.runId)).toEqual(['a']);
  });

  it('updating the same run replaces it instead of adding a duplicate', () => {
    let t: Thread[] = upsertRun([], meta('Mom, birthday'), run('a', 1));
    t = upsertRun(t, meta('Mom, birthday'), run('a', 1));
    t = upsertRun(t, meta('Mom, birthday'), run('b', 2));
    expect(t[0].runs.map((r) => r.runId)).toEqual(['b', 'a']);
  });

  it('changing the occasion moves the run to the new thread and drops the empty old one', () => {
    let t = upsertRun([], meta('Date, summer date'), run('a', 1));
    t = upsertRun(t, meta('Partner, anniversary'), run('a', 2));
    expect(t.map((x) => x.title)).toEqual(['Partner, anniversary']);
  });
});
