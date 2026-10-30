import { useState } from 'react';
import { occasionLabel, type Chat } from '../lib/chats';
import type { LikedCard } from '../lib/likes';
import { Heart, Logo, Moon, Plus, Sun } from './Icons';

interface Props {
  chats: Chat[];
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

export function Sidebar({ chats, hearts, onUnheart, activeId, open, dark, onNew, onSelect, onToggleTheme, onClose }: Props) {
  const [tab, setTab] = useState<'chats' | 'likes'>('chats');
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Chats">
      <a className="brand" href="/"><span className="brand-mark"><Logo /></span>AddyTaste</a>
      <button className="new-chat" type="button" onClick={() => { onNew(); onClose(); setTab('chats'); }}><Plus /> New chat</button>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'chats'} onClick={() => setTab('chats')}>Chats</button>
        <button role="tab" aria-selected={tab === 'likes'} onClick={() => setTab('likes')}>Likes{hearts.length > 0 && <span className="count">{hearts.length}</span>}</button>
      </div>
      <div className="thread-list">
        {tab === 'chats' && chats.map((c) => (
          <button key={c.id} className="thread" aria-current={c.id === activeId} onClick={() => { onSelect(c.id); onClose(); }}>
            <b>{c.title}</b>
            <span>
              {c.sample && <em className="sample-tag">Sample</em>}
              {Math.max(c.runs.length, c.queue?.length ?? 0)} occasion{Math.max(c.runs.length, c.queue?.length ?? 0) === 1 ? '' : 's'}{c.city ? ` · ${c.city}` : ''}
            </span>
          </button>
        ))}
        {tab === 'chats' && !chats.length && <p className="side-empty">Start a chat about a person or anything else. Each chat remembers its likes and avoids, so a new occasion needs no re-paste.</p>}
        {tab === 'likes' && hearts.map((h) => {
          const chat = chats.find((c) => c.id === h.chatId);
          const name = h.card.name.replace(/^\[sample\] /, '');
          return (
            <div key={h.id} className="like-item" aria-current={h.chatId === activeId}>
              <button type="button" className="like-open" disabled={!chat} onClick={() => { onSelect(h.chatId); onClose(); }}>
                <b>{name}</b>
                <span>{h.card.label} · {chat?.title ?? h.chatTitle}{h.occasion ? ` · ${occasionLabel(h.occasion)}` : ''}{chat ? '' : ' (chat no longer saved)'}</span>
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
  );
}
