'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

/**
 * "Message <player>" anywhere a player's name appears. Writes to the same
 * inbox as /messages (private_messages). Renders nothing for your own name
 * or when signed out.
 *
 *   variant="button"  a normal button ("Message")
 *   variant="icon"    a small speech-bubble icon for roster rows and lists
 */
export default function MessageButton({
  recipientId, recipientAlias, variant = 'button', label, subject = '', className = '',
}: {
  recipientId: string | null | undefined;
  recipientAlias: string;
  variant?: 'button' | 'icon';
  label?: string;
  /** Pre-filled subject, e.g. "CTFDL match on Sun Oct 4". */
  subject?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [subj, setSubj] = useState(subject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user || !recipientId || recipientId === user.id) return null;

  const send = async () => {
    if (!body.trim()) { toast.error('Write something first'); return; }
    setSending(true);
    try {
      const { error } = await supabase.from('private_messages').insert({
        sender_id: user.id,
        recipient_id: recipientId,
        subject: subj.trim() || 'No Subject',
        content: body.trim(),
      });
      if (error) throw error;
      toast.success(`Sent to ${recipientAlias}`);
      setOpen(false);
      setBody('');
      setSubj(subject);
    } catch (e: any) {
      console.error('message send failed', e);
      toast.error(e?.message ? `Could not send: ${e.message}` : 'Could not send the message');
    } finally {
      setSending(false);
    }
  };

  const trigger = variant === 'icon' ? (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      className={`inline-flex items-center justify-center rounded p-0.5 text-[#8B98B0] hover:text-[#22D3EE] hover:bg-white/5 transition-colors ${className}`}
      title={`Message ${recipientAlias}`}
      aria-label={`Message ${recipientAlias}`}
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10 transition-colors ${className}`}
      title={`Send ${recipientAlias} a private message`}
    >
      <MessageCircle className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" /> {label || 'Message'}
    </button>
  );

  return (
    <>
      {trigger}
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={`Message ${recipientAlias}`}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#131A2B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
              <div>
                <h3 className="font-display text-xl text-[#E6EDF7]">Message {recipientAlias}</h3>
                <div className="text-xs text-[#8B98B0]">Lands in their inbox on freeinf.org. They'll see your alias, not your email.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7]" aria-label="Close">✕</button>
            </div>
            <div className="space-y-3 px-5 pb-5">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1">Subject</label>
                <input
                  type="text"
                  value={subj}
                  onChange={(e) => setSubj(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); }}
                  rows={5}
                  autoFocus
                  placeholder={`Write to ${recipientAlias}…`}
                  className="w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <span className="mr-auto text-[11px] text-[#8B98B0]">Ctrl+Enter to send</span>
                <button type="button" onClick={() => setOpen(false)} className="px-3.5 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10">Cancel</button>
                <button type="button" onClick={send} disabled={sending || !body.trim()} className="px-4 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 disabled:cursor-not-allowed">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
