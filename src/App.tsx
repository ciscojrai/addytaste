import { useEffect, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { getStatus, type Status } from './lib/api';
import { bootstrap, renameChat, saveChats, type Chat } from './lib/chats';
import { removeLike, saveLikes, toggleLike, type LikedCard } from './lib/likes';
import type { ResultCard } from './lib/types';

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('addytaste.theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  return { dark, toggle };
}

export function Backdrop() {
  return <div className="bg" aria-hidden="true"><i /><i /><i /></div>;
}

export default function App() {
  const { dark, toggle } = useTheme();
  // Loads this browser's chats; migrates v1 chats, or seeds the sample chats when nothing is stored.
  const [boot] = useState(() => bootstrap());
  const [chats, setChatsState] = useState<Chat[]>(boot.chats);
  const [hearts, setHeartsState] = useState<LikedCard[]>(boot.likes);
  const [activeId, setActiveId] = useState<string | null>(boot.chats[0]?.id ?? null);
  const [session, setSession] = useState(0);
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => { getStatus().then(setStatus).catch(() => setStatus(null)); }, []);
  const setChats = (fn: (c: Chat[]) => Chat[]) => setChatsState((prev) => { const n = fn(prev); saveChats(n); return n; });
  const setHearts = (fn: (l: LikedCard[]) => LikedCard[]) => setHeartsState((prev) => { const n = fn(prev); saveLikes(n); return n; });
  const active = chats.find((c) => c.id === activeId) ?? null;

  const updateChat = (id: string, fn: (c: Chat) => Chat) => setChats((list) => list.map((c) => (c.id === id ? fn(c) : c)).sort((a, b) => b.updatedAt - a.updatedAt));
  const rename = (id: string, name: string) => {
    if (!renameChat(chats, id, name)) return false;
    setChats((list) => renameChat(list, id, name) ?? list);
    return true;
  };

  return (
    <>
      <Backdrop />
      <div className="shell">
        {menu && <button type="button" className="scrim" aria-label="Close chats" onClick={() => setMenu(false)} />}
        <Sidebar
          chats={chats}
          hearts={hearts}
          onUnheart={(id) => setHearts((l) => removeLike(l, id))}
          activeId={activeId}
          open={menu}
          dark={dark}
          onNew={() => { setActiveId(null); setSession((s) => s + 1); }}
          onSelect={(id) => { setActiveId(id); setSession((s) => s + 1); }}
          onToggleTheme={toggle}
          onClose={() => setMenu(false)}
        />
        <div className="stage">
          <ChatPanel
            key={session}
            status={status}
            chat={active}
            hearts={hearts}
            onHeart={(card: ResultCard, chat, occasion) => setHearts((l) => toggleLike(l, card, chat, occasion))}
            updateChat={updateChat}
            createChat={(c) => { setChats((l) => [c, ...l]); setActiveId(c.id); }}
            onRename={rename}
            onMenu={() => setMenu(true)}
          />
        </div>
      </div>
    </>
  );
}
