import { useState } from 'react';
import type { Thread } from '../lib/storage';
import { Logo, Moon, Plus, Sun } from './Icons';

interface Props {
  threads: Thread[];
  activeId: string | null;
  open: boolean;
  dark: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function Sidebar({ threads, activeId, open, dark, onNew, onSelect, onToggleTheme, onClose }: Props) {
  const [tab, setTab] = useState<'chats' | 'ideas'>('chats');
  const ideas = threads.flatMap((t) => t.runs.slice(0, 1).flatMap((r) => r.result.cards.map((c) => ({ t, c }))));
  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Chats">
        <a className="brand" href="/"><span className="brand-mark"><Logo /></span>AddyTaste</a>
        <button className="new-chat" type="button" onClick={() => { onNew(); onClose(); }}><Plus /> New chat</button>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'chats'} onClick={() => setTab('chats')}>Chats</button>
          <button role="tab" aria-selected={tab === 'ideas'} onClick={() => setTab('ideas')}>Ideas</button>
        </div>
        <div className="thread-list">
          {tab === 'chats' && threads.map((t) => (
            <button key={t.id} className="thread" aria-current={t.id === activeId} onClick={() => { onSelect(t.id); onClose(); }}>
              <b>{t.title}</b>
              <span>{t.runs.length} saved result{t.runs.length === 1 ? '' : 's'}{t.runs[0]?.city ? ` · ${t.runs[0].city}` : ''}</span>
            </button>
          ))}
          {tab === 'chats' && !threads.length && <p className="side-empty">Each person gets a chat, like “Mom, birthday”. Results you generate are saved here, in this browser only.</p>}
          {tab === 'ideas' && ideas.map(({ t, c }) => (
            <button key={t.id + c.kind} className="thread" onClick={() => { onSelect(t.id); onClose(); }}>
              <b>{c.name.replace(/^\[sample\] /, '')}</b>
              <span>{c.label} · {t.title}</span>
            </button>
          ))}
          {tab === 'ideas' && !ideas.length && <p className="side-empty">Places, gifts and backup plans from your latest result in each chat show up here.</p>}
        </div>
        <div className="side-foot">
          <a href="/demo">Demo and how it works</a>
          <button className="icon-btn" type="button" onClick={onToggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun /> : <Moon />}</button>
        </div>
      </aside>
    </>
  );
}
