'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DraftChatMessage } from '@/lib/ctfdl-draft';

interface Props {
  draftId: string;
  /** Viewer's own user id, to right-align their messages. */
  meId: string | null;
  authHeaders: () => Promise<Record<string, string>>;
}

/**
 * Private draft-room chat for staff + captains. Only rendered for them; the
 * server refuses everyone else and Realtime delivery respects the same rule.
 */
export default function DraftChat({ draftId, meId, authHeaders }: Props) {
  const [messages, setMessages] = useState<DraftChatMessage[]>([]);
  const [open, setOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ctfdl/draft/chat?draft=${encodeURIComponent(draftId)}`, { headers: await authHeaders(), cache: 'no-store' });
      if (!res.ok) { setError(res.status === 403 ? 'Captains and staff only' : 'Chat unavailable'); return; }
      const json = await res.json();
      setMessages((prev) => {
        const next: DraftChatMessage[] = json.messages || [];
        if (!openRef.current && next.length > prev.length) setUnread((u) => u + (next.length - prev.length));
        return next;
      });
      setError(null);
    } catch {
      setError('Chat unavailable');
    }
  }, [draftId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  // Realtime: any insert for this draft → reload (RLS filters delivery server-side).
  useEffect(() => {
    const ch = supabase
      .channel(`ctfdl-draft-chat-${draftId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ctfdl_draft_messages', filter: `draft_id=eq.${draftId}` }, () => { load(); })
      .subscribe();
    const poll = setInterval(load, 7000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [draftId, load]);

  // Stick to the bottom on new messages while open.
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => { if (open) setUnread(0); }, [open]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/ctfdl/draft/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ draft_id: draftId, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      setText('');
      setMessages((prev) => (prev.some((m) => m.id === json.message.id) ? prev : [...prev, json.message]));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="font-display text-lg text-[#E6EDF7]">Draft room chat</span>
        <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">Captains + staff only</span>
        {!open && unread > 0 && <span className="rounded-full bg-[#22D3EE] px-2 py-0.5 text-[10px] font-semibold text-[#0B0F1A]">{unread} new</span>}
        <span className="ml-auto text-xs text-[#8B98B0]">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4">
          <div ref={listRef} className="max-h-64 space-y-1 overflow-y-auto py-3 text-sm">
            {error && <p className="text-xs text-[#F87171]">{error}</p>}
            {!error && messages.length === 0 && <p className="text-xs text-[#8B98B0]">Nothing yet. Only captains in this draft and league staff can read this.</p>}
            {messages.map((m) =>
              m.kind === 'system' ? (
                <div key={m.id} className="flex items-center gap-2 text-[11px] text-[#8B98B0]">
                  <span className="tabular-nums">{time(m.created_at)}</span>
                  <span className="italic">{m.body}</span>
                </div>
              ) : (
                <div key={m.id} className={`flex flex-col ${m.sender_id === meId ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8B98B0]">
                    <span className="font-medium text-[#E6EDF7]">{m.sender_alias || 'Unknown'}</span>
                    {m.sender_is_staff && <span className="rounded bg-[#F59E0B]/15 px-1 text-[9px] font-semibold uppercase text-[#F59E0B]">Staff</span>}
                    {m.sender_tag && <span className="text-[#22D3EE]">[{m.sender_tag}]</span>}
                    <span className="tabular-nums">{time(m.created_at)}</span>
                  </div>
                  <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 ${m.sender_id === meId ? 'bg-[#22D3EE]/15 text-[#E6EDF7]' : 'bg-[#0B0F1A] text-[#E6EDF7]'}`}>{m.body}</div>
                </div>
              ),
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message captains and staff…"
              maxLength={1000}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none"
            />
            <button type="submit" disabled={sending || !text.trim()} className="rounded-md bg-[#22D3EE] px-3 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
