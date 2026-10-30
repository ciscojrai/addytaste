import type { InsightResult, ResultCard } from '../lib/types';
import { External } from './Icons';

function Card({ c }: { c: ResultCard }) {
  const shown = c.name.replace(/^\[sample\] /, '');
  return (
    <article className="card rc" aria-label={c.label}>
      <div className="kind">
        <span>{c.label}</span>
        {c.sample && <span className="sample-tag">Sample</span>}
      </div>
      <h4>{c.sample ? <><span className="note">[sample]</span> {shown}</> : shown}</h4>
      {c.tags.length > 0 && <div className="tagrow">{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
      <p className="idea">{c.idea}</p>
      <p className="why">{c.why}</p>
      <p className="src">
        <b>Because you like {c.because}</b>
        {c.quoteSource === 'text' ? <q>{c.quote}</q> : <>Read from your screenshot: <q>{c.quote}</q></>}
      </p>
      {c.address && <p className="note">{c.address}</p>}
      {c.stay22 && (
        <div className="actions">
          <a className="btn small" href={c.stay22} target="_blank" rel="noopener noreferrer sponsored">Stay nearby on Stay22 <External /></a>
        </div>
      )}
    </article>
  );
}

export function ResultCards({ result }: { result: InsightResult }) {
  const kinds = new Set(result.cards.map((c) => c.kind));
  return (
    <div className="cards">
      {result.cards.map((c) => <Card key={c.kind} c={c} />)}
      {!kinds.has('place') && (
        <div className="card empty-card"><div>{result.city ? 'Qloo did not return a place for this mix. Try another like.' : 'Add a city above to get a place for this plan.'}</div></div>
      )}
    </div>
  );
}
