import type { InsightResult, ReadResult, Taste } from './types';

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}

export interface Status { dataSource: 'live' | 'sample'; badge: string | null; gemini: boolean }
export const getStatus = async (): Promise<Status> => (await fetch('/api/status')).json();

export const readTastes = (b: { occasion: string; group: string | null; text?: string; image?: { mime: string; data: string } }) => post<ReadResult>('/api/read', b);

export interface ChipUpdateResult { addLikes: Taste[]; addAvoids: Taste[]; removeLikes: string[]; removeAvoids: string[]; dropped: number; sourceKind: 'text' | 'image' }
export const updateChips = (b: { text?: string; image?: { mime: string; data: string }; likes: string[]; avoids: string[] }) => post<ChipUpdateResult>('/api/update', b);

export const getInsight = (b: { occasion: string; group: string | null; city: string; text: string | null; likes: Taste[]; avoids: Taste[]; runId: string; exclude?: { name: string; id?: string }[] }, signal?: AbortSignal) =>
  post<InsightResult>('/api/insight', b, signal);

/** Downscale a screenshot in the browser (max 1600px, JPEG) so the upload stays small. Nothing is stored. */
export async function fileToImage(file: File): Promise<{ mime: string; data: string; preview: string }> {
  const toB64 = (s: string) => s.slice(s.indexOf(',') + 1);
  const readRaw = () => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(file); });
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.86);
    return { mime: 'image/jpeg', data: toB64(url), preview: url };
  } catch {
    const raw = await readRaw();
    return { mime: file.type || 'image/png', data: toB64(raw), preview: raw };
  }
}
