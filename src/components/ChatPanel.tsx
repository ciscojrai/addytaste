import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileToImage, getInsight, readTastes, type Status } from '../lib/api';
import { BUDGETS, GROUP_LABEL, OCCASIONS, occasionById, resolveOccasion, threadTitle, type Group, type OccasionId } from '../lib/occasions';
import { upsertRun, type SavedRun, type Thread } from '../lib/storage';
import type { InsightResult, Taste } from '../lib/types';
import { ImageIcon, Menu, Send } from './Icons';
import { InferencePanel } from './InferencePanel';
import { MiniMap } from './MiniMap';
import { ResultCards } from './ResultCards';
import { TasteReview, type Toggle } from './TasteReview';

interface Props {
  status: Status | null;
  threads: Thread[];
  setThreads: (fn: (t: Thread[]) => Thread[]) => void;
  active: Thread | null;
  onSaved: (title: string) => void;
  onMenu: () => void;
}

const newRunId = () => `run${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fmt = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ChatPanel({ status, setThreads, active, onSaved, onMenu }: Props) {
  const [occasion, setOccasion] = useState<OccasionId>('mom_birthday');
  const [group, setGroup] = useState<Group>('work');
  const [person, setPerson] = useState('');
  const [city, setCity] = useState(() => localStorage.getItem('addytaste.city') ?? '');
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mime: string; data: string; preview: string } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'reading' | 'ready'>('idle');
  const [sent, setSent] = useState<{ text: string; preview: string | null } | null>(null);
  const [likes, setLikes] = useState<Toggle[]>([]);
  const [avoids, setAvoids] = useState<Toggle[]>([]);
  const [readText, setReadText] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<'text' | 'image'>('text');
  const [dropped, setDropped] = useState(0);
  const [runId, setRunId] = useState('');
  const [runAt, setRunAt] = useState(0);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runKey, setRunKey] = useState(0);
  const [savedTitle, setSavedTitle] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const firstCall = useRef(true);

  const ctx = useMemo(() => resolveOccasion(occasion, occasion === 'white_elephant' ? group : null)!, [occasion, group]);
  const def = occasionById(occasion)!;
  const title = threadTitle(person, ctx);
  const isWE = occasion === 'white_elephant';
  const titleRef = useRef({ title: '', person: '' });
  titleRef.current = { title, person: person.trim() || def.person };

  useEffect(() => { localStorage.setItem('addytaste.city', city); }, [city]);

  const likesKey = likes.filter((l) => l.on).map((l) => l.taste.id).join('|');
  const avoidsKey = avoids.filter((l) => l.on).map((l) => l.taste.id).join('|');

  // Live inference: re-reads the whole chip set after every change, debounced.
  useEffect(() => {
    if (phase !== 'ready') return;
    const onLikes = likes.filter((l) => l.on).map((l) => l.taste);
    if (!onLikes.length) {
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
    const wait = firstCall.current ? 0 : 400;
    firstCall.current = false;
    const timer = setTimeout(async () => {
      try {
        const r = await getInsight(
          { occasion, group: isWE ? group : null, city: city.trim(), text: readText, likes: onLikes, avoids: avoids.filter((a) => a.on).map((a) => a.taste), runId },
          ac.signal,
        );
        if (ac.signal.aborted) return;
        setResult(r);
        setRunKey((k) => k + 1);
        setLoading(false);
        const run: SavedRun = { runId, at: runAt, occasion, group: isWE ? group : null, city: city.trim(), sourceKind, likes, avoids, result: r };
        const tt = titleRef.current;
        setThreads((t) => upsertRun(t, { title: tt.title, person: tt.person, occasion, group: isWE ? group : null }, run));
        setSavedTitle(tt.title);
        onSaved(tt.title);
      } catch (e) {
        if (ac.signal.aborted) return;
        setLoading(false);
        setError((e as Error).message);
      }
    }, wait);
    return () => { clearTimeout(timer); ac.abort(); };
    // likes/avoids arrays are represented by likesKey/avoidsKey (their "on" ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, likesKey, avoidsKey, occasion, group, city, runId]);

  // New read: bring the chips and the prediction into view (top of the workspace), not the bottom of the page.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (phase === 'ready' && workRef.current) box.scrollTo({ top: Math.max(0, workRef.current.offsetTop - 12), behavior: 'smooth' });
    else if (phase === 'reading') box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [phase, runId]);

  const submit = useCallback(async () => {
    if (phase === 'reading') return;
    const t = text.trim();
    if (!t && !image) { setError('Paste some text or attach a screenshot first.'); return; }
    setError('');
    abortRef.current?.abort();
    setPhase('reading');
    setResult(null);
    setSent({ text: t, preview: image?.preview ?? null });
    try {
      const r = await readTastes({ occasion, group: isWE ? group : null, ...(image ? { image: { mime: image.mime, data: image.data } } : { text: t }) });
      if (!r.likes.length) throw new Error('I could not find anything they like in that. Try more text or a clearer screenshot.');
      setLikes(r.likes.map((x) => ({ taste: x, on: true })));
      setAvoids(r.avoids.map((x) => ({ taste: x, on: true })));
      setReadText(image ? null : t);
      setSourceKind(r.sourceKind);
      setDropped(r.dropped);
      firstCall.current = true;
      setRunAt(Date.now());
      setRunId(newRunId());
      setText('');
      setImage(null);
      setPhase('ready');
    } catch (e) {
      setPhase('idle');
      setSent(null);
      setError((e as Error).message);
    }
  }, [phase, text, image, occasion, group, isWE]);

  const reopen = (run: SavedRun) => {
    abortRef.current?.abort();
    const asText = run.sourceKind === 'text' ? [...run.likes, ...run.avoids].map((x) => x.taste.quote).join('\n') : null;
    setOccasion(run.occasion as OccasionId);
    if (run.group) setGroup(run.group as Group);
    setCity(run.city);
    setLikes(run.likes);
    setAvoids(run.avoids);
    setReadText(asText);
    setSourceKind(run.sourceKind);
    setDropped(0);
    setSent(null);
    firstCall.current = true;
    setRunAt(run.at);
    setRunId(run.runId);
    setResult(run.result);
    setPhase('ready');
  };

  const toggle = (kind: 'like' | 'avoid', id: string) => {
    const f = (list: Toggle[]) => list.map((x) => (x.taste.id === id ? { ...x, on: !x.on } : x));
    if (kind === 'like') setLikes(f); else setAvoids(f);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Attach an image file (PNG, JPEG or WebP).'); return; }
    setError('');
    try { setImage(await fileToImage(f)); } catch (e) { setError((e as Error).message); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const past = (active?.runs ?? []).filter((r) => r.runId !== runId);
  const showWelcome = phase === 'idle' && !past.length;
  const sample = status?.dataSource === 'sample';
  const pins = result?.pins ?? [];

  return (
    <main className="glass panel" aria-label="Chat">
      <header className="panel-head">
        <div className="head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button className="icon-btn menu-btn" type="button" onClick={onMenu} aria-label="Open chats"><Menu /></button>
            <h1>{phase === 'idle' && active ? active.title : title}</h1>
          </div>
          {status && (sample ? <span className="badge sample" role="status"><i />{status.badge}</span> : <span className="badge" role="status"><i />Live Qloo data</span>)}
        </div>
        <div className="context">
          <label className="field wide">
            <span>Occasion</span>
            <select className="ctl" value={occasion} onChange={(e) => setOccasion(e.target.value as OccasionId)} aria-label="Occasion">
              {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          {isWE && (
            <div className="field">
              <span>Swap with</span>
              <div className="seg" role="radiogroup" aria-label="White Elephant group">
                {(Object.keys(BUDGETS) as Group[]).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>
                ))}
              </div>
            </div>
          )}
          {isWE && ctx.budget && <div className="budget-note">Budget {ctx.budget.label}</div>}
          <label className="field">
            <span>Who is it for</span>
            <input className="ctl" value={person} onChange={(e) => setPerson(e.target.value)} placeholder={def.person} maxLength={30} aria-label="Who is it for" />
          </label>
          <label className="field">
            <span>City</span>
            <input className="ctl" value={city} onChange={(e) => setCity(e.target.value)} placeholder="New Orleans" maxLength={60} aria-label="City" />
          </label>
        </div>
      </header>

      <div className="scroll" ref={scroller}>
        {past.map((r) => <PastRun key={r.runId} run={r} onReopen={() => reopen(r)} />)}

        {showWelcome && (
          <div className="welcome">
            <h2>Paste what they said they like. Get a place, a gift and a backup plan.</h2>
            <p>Drop in a text, an email or a screenshot of a chat. I will pull out what they like and what to avoid, then you can switch each one on or off and watch the prediction change.</p>
            <button className="btn" type="button" onClick={() => { setText(def.example); if (!city.trim()) setCity(def.exampleCity); }}>Try an example for {def.label}</button>
          </div>
        )}

        {sent && (
          <div className="bubble-user">
            {sent.preview && <img src={sent.preview} alt="Screenshot you attached" />}
            {sent.text ? sent.text : sent.preview ? 'Screenshot' : ''}
          </div>
        )}
        {phase === 'reading' && <p className="note" role="status">Reading what they like…</p>}

        {phase === 'ready' && (
          <>
            <div className="work" ref={workRef}>
              <TasteReview likes={likes} avoids={avoids} sourceKind={sourceKind} dropped={dropped} onToggle={toggle} />
              <InferencePanel result={result} loading={loading} error={error} runKey={runKey} />
            </div>
            {result && <ResultCards result={result} />}
            {pins.length > 0 && (
              <section className="card mapbox" aria-label="Map">
                <header>
                  <h3>Where the places are</h3>
                  <span className="note">{result?.dataSource === 'sample' ? 'Sample pins, not real places' : 'Places Qloo matched'}</span>
                </header>
                <MiniMap pins={pins} />
              </section>
            )}
            {savedTitle && result && <p className="saved">Saved to the chat “{savedTitle}” in this browser.</p>}
          </>
        )}
        {error && phase !== 'ready' && <div className="error" role="alert">{error}</div>}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {image && (
          <div className="thumb"><img src={image.preview} alt="Screenshot to read" /><span>Screenshot ready to read.</span><button type="button" onClick={() => setImage(null)}>Remove</button></div>
        )}
        <div className="composer-box">
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className="icon-btn" aria-label="Attach a screenshot" onClick={() => fileInput.current?.click()}><ImageIcon /></button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            placeholder={def.placeholder}
            aria-label="Paste what they said"
            rows={2}
            maxLength={4000}
          />
          <button type="submit" className="btn primary" aria-label="Read tastes" disabled={phase === 'reading' || (!text.trim() && !image)}>
            <span className="lbl">Read tastes</span> <Send />
          </button>
        </div>
      </form>
    </main>
  );
}

function PastRun({ run, onReopen }: { run: SavedRun; onReopen: () => void }) {
  const def = occasionById(run.occasion);
  const taste = (l: { taste: Taste; on: boolean }[]) => l.filter((x) => x.on).map((x) => x.taste.item).join(', ');
  return (
    <section className="past" aria-label={`Saved result from ${fmt(run.at)}`}>
      <div className="past-head">
        <span className="note"><b>{def?.label ?? run.occasion}</b> · {fmt(run.at)}{run.city ? ` · ${run.city}` : ''}</span>
        <button className="btn small" type="button" onClick={onReopen}>Reopen chips</button>
      </div>
      <div className="bubble-user">Likes: {taste(run.likes) || 'none'}{taste(run.avoids) ? `. Avoids: ${taste(run.avoids)}` : ''}</div>
      <section className="card">
        <p className="infer-text" style={{ minHeight: 0 }}>
          {run.result.inference.segments.map((s, i) => (s.tag ? <mark key={i} className="hl-phrase">{s.text}</mark> : <span key={i}>{s.text}</span>))}
        </p>
        <div className="by">{run.result.inference.writtenBy}</div>
      </section>
      <ResultCards result={run.result} />
    </section>
  );
}
