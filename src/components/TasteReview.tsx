import type { Taste } from '../lib/types';
import { Check, Minus, Plus } from './Icons';

export interface Toggle { taste: Taste; on: boolean }

interface Props {
  likes: Toggle[];
  avoids: Toggle[];
  sourceKind: 'text' | 'image';
  dropped: number;
  onToggle: (kind: 'like' | 'avoid', id: string) => void;
}

export function TasteReview({ likes, avoids, sourceKind, dropped, onToggle }: Props) {
  return (
    <section className="card" aria-labelledby="pick-h">
      <h3 id="pick-h"><span className="step">1</span> Pick tastes</h3>
      <p className="sub">Tap to turn any on or off. The write-up updates as you go.</p>
      <div className="group-label">Likes</div>
      <div className="chips" role="group" aria-label="Likes">
        {likes.map((l) => (
          <button key={l.taste.id} type="button" className="chip like" aria-pressed={l.on} title={l.taste.quote} onClick={() => onToggle('like', l.taste.id)}>
            {l.on ? <Check /> : <Plus />}
            <span className="t">{l.taste.item}</span>
          </button>
        ))}
        {!likes.length && <span className="note">No likes found.</span>}
      </div>
      <div className="group-label">Avoids</div>
      <div className="chips" role="group" aria-label="Avoids">
        {avoids.map((a) => (
          <button key={a.taste.id} type="button" className="chip avoid" aria-pressed={a.on} title={a.taste.quote} onClick={() => onToggle('avoid', a.taste.id)}>
            {a.on ? <Minus /> : <Plus />}
            <span className="t">{a.taste.item}</span>
          </button>
        ))}
        {!avoids.length && <span className="note">Nothing to avoid was mentioned.</span>}
      </div>
      <details className="quotes">
        <summary>{sourceKind === 'text' ? 'Exact quotes' : 'As read from the screenshot'}</summary>
        <ul>
          {[...likes.map((l) => ({ ...l, kind: 'Likes' })), ...avoids.map((a) => ({ ...a, kind: 'Avoids' }))].map((t) => (
            <li key={t.taste.id}>
              <b>{t.taste.item}</b> ({t.kind.toLowerCase()}): <q>{t.taste.quote}</q>
            </li>
          ))}
        </ul>
        {dropped > 0 && <p className="note">{dropped} reading{dropped === 1 ? '' : 's'} left out because the quote was not in your text.</p>}
      </details>
    </section>
  );
}
