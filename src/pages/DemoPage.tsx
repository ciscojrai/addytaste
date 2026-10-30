import { useEffect, useState } from 'react';
import { Backdrop, useTheme } from '../App';
import { Logo, Moon, Play, Sun } from '../components/Icons';

const CLIPS = [
  { file: '/clips/clip1.mp4', title: 'Paste a chat', note: 'Paste what someone said they like and tap Read tastes. Likes and avoids appear as chips, each with its exact quote.' },
  { file: '/clips/clip2.mp4', title: 'Or drop a screenshot', note: 'Attach a screenshot of a chat or an invite. Gemini reads the image and turns it into the same chips.' },
  { file: '/clips/clip3.mp4', title: 'Turn tastes on and off', note: 'Toggle a chip and the Predictive inference rewrites itself from the tags Qloo returns for that exact mix.' },
  { file: '/clips/clip4.mp4', title: 'Switch the occasion', note: "A birthday, a date night, an anniversary or a White Elephant with its budget. The chat's likes carry over. The place, the gift brand and the backup plan update." },
];

function ClipSlot({ file, title, note }: { file: string; title: string; note: string }) {
  // The dev server answers unknown paths with the app shell (200, text/html), so check the content type.
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(file, { method: 'HEAD' })
      .then((r) => { if (live) setExists(r.ok && (r.headers.get('content-type') ?? '').startsWith('video')); })
      .catch(() => { if (live) setExists(false); });
    return () => { live = false; };
  }, [file]);
  return (
    <figure className="clip glass" style={{ margin: 0 }}>
      <h3>{title}</h3>
      <div className="vwrap">
        <video controls preload="metadata" playsInline src={file} aria-label={title} />
        {exists !== true && (
          <div className="soon" role="img" aria-label={`${title}: clip coming soon`}>
            <Play />
            <b>Clip coming soon</b>
            <span>{file.replace(/^\//, 'public/')}</span>
          </div>
        )}
      </div>
      <p>{note}</p>
    </figure>
  );
}

export default function DemoPage() {
  const { dark, toggle } = useTheme();
  return (
    <div className="demo">
      <Backdrop />
      <nav className="demo-nav" aria-label="Primary">
        <a className="brand" href="/demo"><span className="brand-mark"><Logo /></span>AddyTaste</a>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a className="btn small primary" href="/">Open the app</a>
          <button className="icon-btn" type="button" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun /> : <Moon />}</button>
        </div>
      </nav>
      <main>
        <header className="hero">
          <div className="eyebrow">Gifts, dates and plans</div>
          <h1>Know what to get, and where to go, from what they actually said.</h1>
          <p>Paste a message or drop a screenshot. AddyTaste reads what someone likes and what to avoid, predicts what else they would love, and suggests a place, a gift brand and a backup plan.</p>
          <a className="btn primary" href="/">Try it now</a>
        </header>

        <section aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol className="steps">
            <li className="glass"><div className="n">1</div><h3>Paste or screenshot</h3><p>Drop in what they said, or a screenshot of the chat. Every like and avoid comes back with the exact words it came from.</p></li>
            <li className="glass"><div className="n">2</div><h3>Pick the tastes</h3><p>Turn chips on or off and choose the occasion. The Predictive inference rewrites itself each time, using only tags Qloo returned.</p></li>
            <li className="glass"><div className="n">3</div><h3>Get three picks</h3><p>A place with a map pin and a stay-nearby link, a gift brand with a gift idea in budget, and a backup plan for a rainy day.</p></li>
          </ol>
        </section>

        <section aria-labelledby="clips">
          <h2 id="clips">See it in action</h2>
          <div className="clips">{CLIPS.map((c) => <ClipSlot key={c.file} {...c} />)}</div>
        </section>

        <section aria-labelledby="built">
          <h2 id="built">Built on Qloo</h2>
          <div className="built glass">
            <p>The taste predictions in this project come from Qloo&apos;s Taste AI API. For each request we send the likes you turn on, the avoids you turn off, the city and the occasion, and Qloo returns places, brands, films and the tags that connect them.</p>
            <ul>
              <li>Entities and tags for each like are looked up with Qloo search.</li>
              <li>Places, brands and films are ranked by taste fit, with avoids excluded and a price level set by the occasion.</li>
              <li>Gemini writes the short explanation, using only the tags and names Qloo returned.</li>
            </ul>
            <p>This is an independent project made for the Qloo Agentic Hackathon. It is not an official Qloo product.</p>
          </div>
        </section>
        <p className="foot">Pasted text and screenshots are processed in memory and are not stored. Saved chats stay in your own browser.</p>
      </main>
    </div>
  );
}
