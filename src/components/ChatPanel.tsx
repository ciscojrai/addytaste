import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileToImage, readTastes, updateChips, type Status } from '../lib/api';
import {
  applyChipUpdate, defaultTitle, lastTime, newChat, NEW_CHAT_TITLE, occasionLabel, priorGifts, runFor, runSig, upsertRun,
  type Chat, type Toggle,
} from '../lib/chats';
import { isLiked, type LikedCard } from '../lib/likes';
import { BUDGETS, exampleFor, GROUP_LABEL, OCCASIONS, occasionById, resolveOccasion, type Group, type OccasionId } from '../lib/occasions';
import { fetchRun } from '../lib/runner';
import type { ResultCard } from '../lib/types';
import { EditableTitle } from './EditableTitle';
import { ImageIcon, Menu, Send } from './Icons';
import { InferencePanel } from './InferencePanel';
import { MiniMap } from './MiniMap';
import { ResultCards } from './ResultCards';
import { TasteReview } from './TasteReview';

interface Props {
  status: Status | null;
  chat: Chat | null;
  hearts: LikedCard[];
  onHeart: (card: ResultCard, chat: { id: string; title: string }, occasion: string) => void;
  updateChat: (id: string, fn: (c: Chat) => Chat) => void;
  createChat: (c: Chat) => void;
  onRename: (id: string, name: string) => boolean;
  onMenu: () => void;
}

const fmt = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Sample chats are prepared once per chat, even if the panel remounts. */
const preparing = new Set<string>();

export function ChatPanel({ status, chat, hearts, onHeart, updateChat, createChat, onRename, onMenu }: Props) {
  const [draft, setDraft] = useState<{ occasion: OccasionId; group: Group; city: string }>({ occasion: 'birthday', group: 'friends', city: localStorage.getItem('addytaste.city') ?? '' });
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mime: string; data: string; preview: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'updating'>('');
  const [bubbles, setBubbles] = useState<{ text: string; preview: string | null }[]>([]);
  const [flash, setFlash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runKey, setRunKey] = useState(0);
  const [prep, setPrep] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const tried = useRef(new Set<string>());

  const occasion = (chat?.occasion as OccasionId) ?? draft.occasion;
  const group = chat?.group ?? draft.group;
  const city = chat?.city ?? draft.city;
  const isWE = occasion === 'white_elephant';
  const ctx = useMemo(() => resolveOccasion(occasion, isWE ? group : null), [occasion, group, isWE]);
  const def = occasionById(occasion) ?? OCCASIONS[1];
  const title = chat?.title ?? NEW_CHAT_TITLE;

  const patch = (p: Partial<Pick<Chat, 'occasion' | 'group' | 'city'>>) => {
    if (chat) updateChat(chat.id, (c) => ({ ...c, ...p }));
    else setDraft((d) => ({ ...d, ...(p as object) }));
  };
  useEffect(() => { localStorage.setItem('addytaste.city', city); }, [city]);

  const liveMode = status?.dataSource === 'live';
  const stored = chat ? runFor(chat, occasion) : undefined;
  const sig = chat ? runSig(chat, occasion) : '';
  const hasLikes = !!chat && chat.likes.length > 0;
  const onLikes = chat?.likes.filter((l) => l.on).length ?? 0;

  // Sample chats: prepare their saved occasions once (the last one is the occasion the chat opens on).
  useEffect(() => {
    if (!chat?.queue?.length || preparing.has(chat.id)) return;
    preparing.add(chat.id);
    setPrep(true);
    const id = chat.id;
    const queue = [...chat.queue];
    (async () => {
      let work = chat;
      for (const occ of queue) {
        if (runFor(work, occ)) continue;
        try {
          const run = await fetchRun({ ...work, occasion: occ }, occ);
          work = upsertRun(work, run);
          updateChat(id, (c) => upsertRun(c, run));
        } catch { /* a missing sample result is fine; the chat still opens */ }
      }
      updateChat(id, (c) => ({ ...c, queue: undefined, occasion: queue[queue.length - 1] }));
      preparing.delete(id);
      setPrep(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id, chat?.queue?.length]);

  // Live inference for the current occasion: re-reads the whole chip set after every change, debounced.
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (!chat || chat.queue?.length || !chat.likes.length) return;
    // Reopening a chat shows what was saved; a result is only remade after a change.
    // A result saved while Qloo was in sample mode is remade once live Qloo is on.
    const stale = liveMode && stored && stored.result.dataSource !== 'live' && !tried.current.has(`${chat.id}|${occasion}`);
    if (stored && !stale && (stored.sig === sig || (first && stored.sig === undefined))) { setLoading(false); return; }
    if (stale) tried.current.add(`${chat.id}|${occasion}`);
    if (!onLikes) {
      abortRef.current?.abort();
      setLoading(false);
      setError('Turn on at least one like. Qloo ranks by taste fit, so it needs something to start from.');
      return;
    }
    setError('');
    setLoading(true);
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    const timer = setTimeout(async () => {
      try {
        const run = await fetchRun(chat, occasion, ac.signal);
        if (ac.signal.aborted) return;
        updateChat(chat.id, (c) => upsertRun(c, run));
        setRunKey((k) => k + 1);
        setLoading(false);
      } catch (e) {
        if (ac.signal.aborted) return;
        setLoading(false);
        setError((e as Error).message);
      }
    }, stored ? 400 : 0);
    return () => { clearTimeout(timer); ac.abort(); };
    // sig captures the chips, city, budget and occasion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id, sig, !!chat?.queue?.length, liveMode]);

  // New chat or new first result: bring the chips and the prediction into view.
  useEffect(() => {
    const box = scroller.current;
    if (!box || !workRef.current) return;
    box.scrollTo({ top: Math.max(0, workRef.current.offsetTop - 12), behavior: 'smooth' });
  }, [chat?.id, occasion, hasLikes]);

  const clearComposer = () => { setText(''); setImage(null); };

  const submit = useCallback(async () => {
    if (busy) return;
    const t = text.trim();
    if (!t && !image) { setError('Paste or type something, or attach a screenshot.'); return; }
    if (!ctx) { setError('Pick who the White Elephant is with first.'); return; }
    setError('');
    setFlash('');
    abortRef.current?.abort();
    const sent = { text: t, preview: image?.preview ?? null };
    const img = image ? { mime: image.mime, data: image.data } : undefined;
    try {
      if (!chat || !chat.likes.length) {
        // First message: read the tastes and create the chat.
        setBusy('reading');
        setBubbles((b) => [...b, sent]);
        const r = await readTastes({ occasion, group: isWE ? group : null, ...(img ? { image: img } : { text: t }) });
        if (!r.likes.length) throw new Error('I could not find anything they like in that. Try more text or a clearer screenshot.');
        const likes: Toggle[] = r.likes.map((x) => ({ taste: x, on: true }));
        const avoids: Toggle[] = r.avoids.map((x) => ({ taste: x, on: true }));
        const base = { city: city.trim(), group, occasion, likes, avoids };
        if (chat) updateChat(chat.id, (c) => ({ ...c, ...base, title: c.titleAuto ? defaultTitle(r.likes, occasion) : c.title }));
        else createChat(newChat({ ...base, title: defaultTitle(r.likes, occasion) }));
      } else {
        // Follow-up: Gemini adds or removes chips on this chat, then the current occasion is re-run.
        setBusy('updating');
        setBubbles((b) => [...b, sent]);
        const u = await updateChips({ ...(img ? { image: img } : { text: t }), likes: chat.likes.map((x) => x.taste.item), avoids: chat.avoids.map((x) => x.taste.item) });
        const merged = applyChipUpdate(chat, u);
        if (!merged.note) setFlash(`No chip changes in that message for ${chat.title}.`);
        else {
          const note = { at: Date.now(), text: merged.note };
          updateChat(chat.id, (c) => ({ ...c, likes: merged.likes, avoids: merged.avoids, notes: [note, ...c.notes].slice(0, 20), updatedAt: note.at }));
        }
      }
      clearComposer();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }, [busy, text, image, ctx, chat, occasion, group, isWE, city, updateChat, createChat]);

  const toggle = (kind: 'like' | 'avoid', id: string) => {
    if (!chat) return;
    const f = (list: Toggle[]) => list.map((x) => (x.taste.id === id ? { ...x, on: !x.on } : x));
    updateChat(chat.id, (c) => (kind === 'like' ? { ...c, likes: f(c.likes) } : { ...c, avoids: f(c.avoids) }));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Attach an image file (PNG, JPEG or WebP).'); return; }
    setError('');
    try { setImage(await fileToImage(f)); } catch (e) { setError((e as Error).message); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const heart = (occ: string) => ({
    likedFor: (c: ResultCard) => !!chat && isLiked(hearts, chat.id, occ, c),
    onHeart: chat ? (c: ResultCard) => onHeart(c, { id: chat.id, title: chat.title }, occ) : undefined,
  });

  const result = stored?.result ?? null;
  // The badge follows the result on screen: live only when every piece of it came from Qloo.
  const shownSource = result?.dataSource ?? status?.dataSource;
  const pins = result?.pins ?? [];
  const last = chat ? lastTime(chat, occasion) : null;
  const excluded = chat ? priorGifts(chat, occasion) : [];
  const others = chat ? chat.runs.filter((r) => r.occasion !== occasion) : [];
  const hasChips = !!chat && chat.likes.length > 0;
  const placeholder = hasChips ? 'Add an update, e.g. "now into hiking"' : 'Paste what they said, or attach a screenshot.';

  return (
    <main className="glass panel" aria-label="Chat">
      <header className="panel-head">
        <div className="head-row">
          <div className="head-left">
            <button className="icon-btn menu-btn" type="button" onClick={onMenu} aria-label="Open chats"><Menu /></button>
            {chat ? <EditableTitle value={title} onSave={(n) => onRename(chat.id, n)} /> : <EditableTitle value={title} onSave={() => false} readOnly />}
          </div>
          <div className="head-badges">
            {chat?.sample && <span className="badge"><i />Sample chat</span>}
            {shownSource && (shownSource === 'live' ? <span className="badge" role="status"><i />Live Qloo data</span> : <span className="badge sample" role="status"><i />{shownSource === 'mixed' ? 'Part sample data (a Qloo call failed)' : status?.badge ?? 'Sample data, not real Qloo'}</span>)}
          </div>
        </div>
        <div className="context">
          <label className="field wide">
            <span>Occasion</span>
            <select className="ctl" value={occasion} onChange={(e) => patch({ occasion: e.target.value as OccasionId })} aria-label="Occasion">
              {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}{chat && runFor(chat, o.id) ? ' (saved)' : ''}</option>)}
            </select>
          </label>
          {isWE && (
            <div className="field">
              <span>Swap with</span>
              <div className="seg" role="radiogroup" aria-label="White Elephant group">
                {(Object.keys(BUDGETS) as Group[]).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => patch({ group: g })}>{GROUP_LABEL[g]}</button>
                ))}
              </div>
            </div>
          )}
          {isWE && ctx?.budget && <div className="budget-note">Budget {ctx.budget.label}</div>}
          <label className="field">
            <span>City</span>
            <input className="ctl" value={city} onChange={(e) => patch({ city: e.target.value })} placeholder="New Orleans" maxLength={60} aria-label="City" />
          </label>
        </div>
      </header>

      <div className="scroll" ref={scroller}>
        {!chat && !bubbles.length && (
          <div className="welcome">
            <h2>Paste what they said they like. Get a place, a gift and a backup plan.</h2>
            <p>Drop in a text, an email or a screenshot of a chat. I will pull out what they like and what to avoid. Each chat remembers its likes, so a new occasion starts with them already loaded.</p>
            <button className="btn" type="button" onClick={() => { setText(exampleFor(occasion)); if (!city.trim()) patch({ city: 'New Orleans' }); }}>Try an example for {def.label}</button>
          </div>
        )}

        {chat && chat.notes.slice(0, 3).map((n) => <p key={n.at} className="chat-note"><span>{n.text}</span><time>{fmt(n.at)}</time></p>)}

        {others.map((r) => {
          const gift = r.result.cards.find((c) => c.kind === 'gift')?.name.replace(/^\[sample\] /, '');
          const place = r.result.cards.find((c) => c.kind === 'place')?.name.replace(/^\[sample\] /, '');
          return (
            <details key={r.runId} className="past-occ">
              <summary>
                <span className="po-title">{occasionLabel(r.occasion)}</span>
                <span className="note">{fmt(r.at)}{gift ? ` · gift ${gift}` : ''}{place ? ` · ${place}` : ''}</span>
              </summary>
              <div className="past-body">
                <button className="btn small" type="button" onClick={() => patch({ occasion: r.occasion as OccasionId })}>Open {occasionLabel(r.occasion)}</button>
                <ResultCards result={r.result} {...heart(r.occasion)} />
              </div>
            </details>
          );
        })}

        {bubbles.map((b, i) => (
          <div className="bubble-user" key={i}>
            {b.preview && <img src={b.preview} alt="Screenshot you attached" />}
            {b.text ? b.text : b.preview ? 'Screenshot' : ''}
          </div>
        ))}
        {busy === 'reading' && <p className="note" role="status">Reading what they like…</p>}
        {busy === 'updating' && <p className="note" role="status">Updating the chips…</p>}
        {prep && <p className="note" role="status">Preparing the sample results…</p>}
        {flash && <p className="chat-note" role="status"><span>{flash}</span></p>}

        {hasChips && chat && (
          <>
            <div className="work" ref={workRef}>
              <TasteReview likes={chat.likes} avoids={chat.avoids} sourceKind={chat.likes.some((l) => l.taste.source === 'image') ? 'image' : 'text'} dropped={0} onToggle={toggle} />
              <InferencePanel result={result} loading={loading || prep} error={error} runKey={runKey} />
            </div>
            {last && (
              <p className="last-time">
                <b>Last time:</b> {occasionLabel(last.occasion)} ({fmt(last.at)}){last.gift ? `, gift ${last.gift}` : ''}{last.place ? `, place ${last.place}` : ''}.
                {excluded.length > 0 && ' Earlier gifts are left out here.'}
              </p>
            )}
            {result && <ResultCards result={result} {...heart(occasion)} />}
            {pins.length > 0 && (
              <section className="card mapbox" aria-label="Map">
                <header>
                  <h3>Where the places are</h3>
                  <span className="note">{result?.dataSource === 'sample' ? 'Sample pins, not real places' : 'Places Qloo matched'}</span>
                </header>
                <MiniMap pins={pins} />
              </section>
            )}
            {result && <p className="saved">Saved to “{title}” in this browser.</p>}
          </>
        )}
        {error && !hasChips && <div className="error" role="alert">{error}</div>}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {image && (
          <div className="thumb"><img src={image.preview} alt="Screenshot to read" /><span>Screenshot ready.</span><button type="button" onClick={() => setImage(null)}>Remove</button></div>
        )}
        <div className="composer-box">
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className="icon-btn" aria-label="Attach a screenshot" onClick={() => fileInput.current?.click()}><ImageIcon /></button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            placeholder={placeholder}
            aria-label={hasChips ? 'Add an update' : 'Paste what they said'}
            rows={2}
            maxLength={4000}
          />
          <button type="submit" className="btn primary" aria-label={hasChips ? 'Send update' : 'Read tastes'} disabled={!!busy || (!text.trim() && !image)}>
            <span className="lbl">{hasChips ? 'Update' : 'Read tastes'}</span> <Send />
          </button>
        </div>
      </form>
    </main>
  );
}
