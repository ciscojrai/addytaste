import { useState } from 'react';
import type { LikedCard } from '../lib/likes';
import type { Thread } from '../lib/storage';
import { Heart, Logo, Moon, Plus, Sun } from './Icons';

interface Props {
  threads: Thread[];
  hearts: LikedCard[];
  onUnheart: (id: string) => void;
  activeId: string | null;
  open: boolean;
  dark: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function Sidebar({ threads, hearts, onUnheart, activeId, open, dark, onNew, onSelect, onToggleTheme, onClose }: Props) {
  const [tab, setTab] = useState<'chats' | 'likes'>('chats');
  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Chats">
        <a className="brand" href="/"><span className="brand-mark"><Logo /></span>AddyTaste</a>
        <button className="new-chat" type="button" onClick={() => { onNew(); onClose(); }}><Plus /> New chat</button>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'chats'} onClick={() => setTab('chats')}>Chats</button>
          <button role="tab" aria-selected={tab === 'likes'} onClick={() => setTab('likes')}>Likes{hearts.length > 0 && <span className="count">{hearts.length}</span>}</button>
        </div>
        <div className="thread-list">
          {tab === 'chats' && threads.map((t) => (
            <button key={t.id} className="thread" aria-current={t.id === activeId} onClick={() => { onSelect(t.id); onClose(); }}>
              <b>{t.title}</b>
              <span>{t.runs.length} saved result{t.runs.length === 1 ? '' : 's'}{t.runs[0]?.city ? ` · ${t.runs[0].city}` : ''}</span>
            </button>
          ))}
          {tab === 'chats' && !threads.length && <p className="side-empty">Each person gets a chat, like “Mom, birthday”. Results you generate are saved here, in this browser only.</p>}
          {tab === 'likes' && hearts.map((h) => {
            const exists = threads.some((t) => t.id === h.threadId);
            const name = h.card.name.replace(/^\[sample\] /, '');
            return (
              <div key={h.id} className="like-item" aria-current={h.threadId === activeId}>
                <button type="button" className="like-open" disabled={!exists} onClick={() => { onSelect(h.threadId); onClose(); }}>
                  <b>{name}</b>
                  <span>{h.card.label} · {h.threadTitle}{exists ? '' : ' (chat no longer saved)'}</span>
                </button>
                <button type="button" className="like-remove" aria-label={`Remove ${name} from Likes`} onClick={() => onUnheart(h.id)}><Heart filled /></button>
              </div>
            );
          })}
          {tab === 'likes' && !hearts.length && <p className="side-empty">Tap the heart on any idea to save it here.</p>}
        </div>
        <div className="side-foot">
          <a href="/demo">Demo and how it works</a>
          <button className="icon-btn" type="button" onClick={onToggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun /> : <Moon />}</button>
        </div>
      </aside>
    </>
  );
}
