// Chat threads live in this browser's localStorage only. Pasted text and screenshots are never saved:
// a run keeps the chips (item + quote) and the result.
import type { InsightResult, Taste } from './types';

export interface SavedRun {
  runId: string;
  at: number;
  occasion: string;
  group: string | null;
  city: string;
  sourceKind: 'text' | 'image';
  likes: { taste: Taste; on: boolean }[];
  avoids: { taste: Taste; on: boolean }[];
  result: InsightResult;
}
export interface Thread { id: string; title: string; person: string; occasion: string; group: string | null; updatedAt: number; runs: SavedRun[] }

const KEY = 'addytaste.threads.v1';

/** Thread ids come from the title, so "Mom, birthday" is always the same thread. */
export const threadId = (title: string) => `th-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export function loadThreads(): Thread[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export function saveThreads(t: Thread[]) {
  try { localStorage.setItem(KEY, JSON.stringify(t.slice(0, 40))); } catch { /* storage full or blocked */ }
}

/** Save (or update) a run in the thread with this title. A run lives in exactly one thread. */
export function upsertRun(threads: Thread[], meta: { title: string; person: string; occasion: string; group: string | null }, run: SavedRun): Thread[] {
  const cleaned = threads.map((t) => ({ ...t, runs: t.runs.filter((r) => r.runId !== run.runId) })).filter((t) => t.runs.length || t.title === meta.title);
  let target = cleaned.find((t) => t.title === meta.title);
  if (!target) {
    target = { id: threadId(meta.title), ...meta, updatedAt: run.at, runs: [] };
    cleaned.unshift(target);
  }
  target.runs = [run, ...target.runs].slice(0, 30);
  target.updatedAt = run.at;
  return cleaned.sort((a, b) => b.updatedAt - a.updatedAt);
}
