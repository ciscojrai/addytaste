import { useEffect, useRef, useState } from 'react';
import { Pencil } from './Icons';

interface Props {
  value: string;
  /** Return false to reject the name. */
  onSave: (name: string) => boolean;
  /** Not editable (a chat that has not been created yet). */
  readOnly?: boolean;
}

/** A chat name you can rename: pencil button or double-click. Enter saves, Esc cancels, an empty name is rejected. */
export function EditableTitle({ value, onSave, readOnly }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  const start = () => { if (readOnly) return; setDraft(value); setError(''); setEditing(true); };
  const commit = () => {
    if (!draft.trim()) { setError('A chat needs a name.'); return; }
    if (onSave(draft)) { setEditing(false); setError(''); } else setError('A chat needs a name.');
  };
  const cancel = () => { setEditing(false); setError(''); setDraft(value); };

  if (editing) {
    return (
      <div className="title-edit">
        <input
          ref={input}
          className="ctl title-input"
          value={draft}
          maxLength={40}
          aria-label="Chat name"
          aria-invalid={!!error}
          onChange={(e) => { setDraft(e.target.value); setError(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          onBlur={() => { if (draft.trim()) commit(); else cancel(); }}
        />
        {error && <div className="title-error" role="alert">{error}</div>}
      </div>
    );
  }
  return (
    <div className="title-row">
      <h1 onDoubleClick={start} title={readOnly ? undefined : 'Double-click to rename'}>{value}</h1>
      {!readOnly && (
        <button type="button" className="icon-btn small" aria-label={`Rename chat ${value}`} onClick={start}><Pencil /></button>
      )}
    </div>
  );
}
