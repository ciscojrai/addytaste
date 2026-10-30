import { Fragment } from 'react';
import type { InsightResult } from '../lib/types';

interface Props { result: InsightResult | null; loading: boolean; error: string; runKey: number }

export function InferencePanel({ result, loading, error, runKey }: Props) {
  let i = 0;
  return (
    <section className="card infer" aria-labelledby="inf-h" aria-live="polite">
      <div className={`bar${loading ? ' on' : ''}`} />
      <h3 id="inf-h"><span className="step">2</span> Predictive inference <span className="info">Grounded by Qloo</span></h3>
      <div className="grounded">Additional tastes inferred from this combination</div>
      {error && !result && <div className="error" role="alert">{error}</div>}
      {!result && !error && <p className="infer-text updating">Reading these tastes together…</p>}
      {result && (
        <>
          <p className={`infer-text${loading ? ' updating' : ''}`} key={runKey}>
            {result.inference.segments.map((s, si) => {
              const lead = s.text.match(/^\s*/)?.[0] ?? '';
              const words = s.text.trimStart().split(/(\s+)/).filter(Boolean).map((w) => {
                const idx = i++;
                return <span key={idx} className="w" style={{ ['--i' as string]: idx }}>{w}</span>;
              });
              return (
                <Fragment key={si}>
                  {lead && <span className="w" style={{ ['--i' as string]: i }}>{lead}</span>}
                  {s.tag ? <mark className="hl-phrase" title={`Qloo tag: ${s.tag}`}>{words}</mark> : words}
                </Fragment>
              );
            })}
          </p>
          <div className="legend"><span><i />{result.inference.legend[0]}</span></div>
          <div className="by">{result.inference.writtenBy}{result.inference.viaTagCall ? '' : ' (tags taken from the places and brands Qloo returned)'}</div>
          {error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
        </>
      )}
    </section>
  );
}
