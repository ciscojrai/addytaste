import { useEffect, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { getStatus, type Status } from './lib/api';
import { loadThreads, saveThreads, threadId, type Thread } from './lib/storage';

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
  const [threads, setThreadsState] = useState<Thread[]>(loadThreads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => { getStatus().then(setStatus).catch(() => setStatus(null)); }, []);
  const setThreads = (fn: (t: Thread[]) => Thread[]) => setThreadsState((prev) => { const n = fn(prev); saveThreads(n); return n; });
  const active = threads.find((t) => t.id === activeId) ?? null;

  return (
    <>
      <Backdrop />
      <div className="shell">
        <Sidebar
          threads={threads}
          activeId={activeId}
          open={menu}
          dark={dark}
          onNew={() => { setActiveId(null); setSession((s) => s + 1); }}
          onSelect={(id) => { setActiveId(id); setSession((s) => s + 1); }}
          onToggleTheme={toggle}
          onClose={() => setMenu(false)}
        />
        <div className="stage">
          <ChatPanel key={session} status={status} threads={threads} setThreads={setThreads} active={active} onSaved={(title) => setActiveId(threadId(title))} onMenu={() => setMenu(true)} />
        </div>
      </div>
    </>
  );
}
