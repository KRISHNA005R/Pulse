import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { loadSession } from '../lib/auth';
import { syncFriends } from '../lib/friends';
import { act, peopleCall, peopleView, type FriendRow, type PeopleView } from '../lib/people';
import { canon, problem } from '../../netlify/lib/username';
import { haptic } from '../lib/format';
import { useHost } from './Friends';
import { Icon } from './ui/Icon';

// Friends by @username: find someone, send a request, answer requests, change your own @username.

/** The friends list and requests, kept fresh. */
export function usePeople(): PeopleView & { refresh: () => Promise<void> } {
  const host = useHost();
  const [v, setV] = useState(peopleView());
  useEffect(() => {
    const on = () => setV(peopleView());
    window.addEventListener('pulse-people', on);
    return () => window.removeEventListener('pulse-people', on);
  }, []);
  return { ...v, refresh: () => syncFriends(host) };
}

const Initial = ({ name }: { name: string }) => (
  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent-ink" aria-hidden="true">
    {(name.trim()[0] ?? '?').toUpperCase()}
  </span>
);

function Row({ p, children }: { p: Pick<FriendRow, 'name' | 'u'>; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Initial name={p.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{p.name}</span>
        <span className="block truncate text-[13px] text-ink3">@{p.u}</span>
      </span>
      {children}
    </li>
  );
}

export function FriendsHub({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const people = usePeople();
  const signedIn = !!loadSession() && store.state.mode === 'personal';
  const [q, setQ] = useState('');
  const [found, setFound] = useState<(FriendRow & { standing: string; me?: boolean }) | null | 'none'>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const asked = useRef(false);

  useEffect(() => {
    if (signedIn && !asked.current) {
      asked.current = true;
      void people.refresh();
    }
  }, [signedIn, people]);

  if (!signedIn)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink2">Sign in to add friends by @username.</p>
        <button
          type="button"
          className="btn-accent w-full"
          onClick={() => {
            onDone();
            ui.resetTo('you', { name: 'account' });
          }}
        >
          Sign in
        </button>
        <button type="button" className="btn-quiet w-full" onClick={() => ui.openSheet({ type: 'friend-invite' })}>
          Invite with a link
        </button>
      </div>
    );

  const run = async (key: string, action: string, uid: string) => {
    setBusy(key);
    setError('');
    const r = await act(action, uid);
    setBusy('');
    if (r.error) return setError(r.error);
    haptic(10);
    if (found && found !== 'none' && found.uid === uid && r.standing) setFound({ ...found, standing: r.standing });
    const done: Record<string, string> = { request: 'Request sent.', accept: 'You’re friends now.', decline: 'Request removed.', cancel: 'Request cancelled.' };
    if (done[action]) store.toast({ text: action === 'request' && r.standing === 'friends' ? 'You’re friends now.' : done[action], tone: 'good', emoji: '🤝' });
    await people.refresh();
  };

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = canon(q);
    if (!u) return;
    if (problem(u)) return setFound('none');
    setBusy('find');
    setError('');
    const r = await peopleCall({ action: 'find', u });
    setBusy('');
    if (!r) return setError('No connection. Try again.');
    if (r.status !== 200) return setError(String(r.data.error ?? 'Something went wrong.'));
    setFound(r.data.found ?? 'none');
  };

  const me = people.me;
  return (
    <div className="flex flex-col gap-5">
      {me && (
        <div className="flex items-center gap-3 rounded-2xl bg-sunk px-4 py-3">
          <span className="min-w-0 flex-1 text-[14.5px]">
            You’re <span className="font-semibold">@{me.u}</span>
          </span>
          <button type="button" className="btn-ghost min-h-[36px] px-3 text-[13.5px]" onClick={() => ui.openSheet({ type: 'username' })}>
            Change
          </button>
        </div>
      )}

      <form onSubmit={find} className="flex gap-2" role="search">
        <label htmlFor="fr-find" className="sr-only">
          Find by @username
        </label>
        <input
          id="fr-find"
          className="field flex-1"
          placeholder="@username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setFound(null);
          }}
        />
        <button type="submit" className="btn-primary shrink-0 px-5" disabled={!q.trim() || busy === 'find'}>
          {busy === 'find' ? '…' : 'Find'}
        </button>
      </form>
      {found === 'none' && <p className="-mt-3 text-[13.5px] text-ink3">No one with that username.</p>}
      {found && found !== 'none' && (
        <ul className="-mt-2 rounded-2xl border border-line px-3" aria-label="Found">
          <Row p={found}>
            {found.me ? (
              <span className="text-[13px] text-ink3">That’s you</span>
            ) : found.standing === 'friends' ? (
              <span className="flex items-center gap-1 text-[13.5px] font-semibold text-pos">
                <Icon name="check" size={15} /> Friends
              </span>
            ) : found.standing === 'sent' ? (
              <button type="button" className="btn-ghost min-h-[38px] px-3 text-[13.5px]" disabled={!!busy} onClick={() => void run('f', 'cancel', found.uid)}>
                Requested
              </button>
            ) : found.standing === 'received' ? (
              <button type="button" className="btn-accent min-h-[38px] px-4 text-[13.5px]" disabled={!!busy} onClick={() => void run('f', 'accept', found.uid)}>
                Accept
              </button>
            ) : found.standing === 'blocked' ? (
              <span className="text-[13px] text-ink3">Blocked</span>
            ) : (
              <button type="button" className="btn-accent min-h-[38px] px-4 text-[13.5px]" disabled={!!busy} onClick={() => void run('f', 'request', found.uid)}>
                Add friend
              </button>
            )}
          </Row>
        </ul>
      )}
      {error && (
        <p className="-mt-2 text-[13.5px] font-medium text-warn" role="alert">
          {error}
        </p>
      )}

      {people.received.length > 0 && (
        <section aria-labelledby="fr-in">
          <p id="fr-in" className="eyebrow">
            Requests · {people.received.length}
          </p>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {people.received.map((p) => (
              <Row key={p.uid} p={p}>
                <button type="button" className="btn-ghost min-h-[38px] px-3 text-[13.5px]" disabled={!!busy} onClick={() => void run(p.uid, 'decline', p.uid)}>
                  Decline
                </button>
                <button type="button" className="btn-accent min-h-[38px] px-4 text-[13.5px]" disabled={!!busy} onClick={() => void run(p.uid, 'accept', p.uid)}>
                  Accept
                </button>
              </Row>
            ))}
          </ul>
        </section>
      )}

      {people.sent.length > 0 && (
        <section aria-labelledby="fr-out">
          <p id="fr-out" className="eyebrow">
            Sent · {people.sent.length}
          </p>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {people.sent.map((p) => (
              <Row key={p.uid} p={p}>
                <button type="button" className="btn-ghost min-h-[38px] px-3 text-[13.5px]" disabled={!!busy} onClick={() => void run(p.uid, 'cancel', p.uid)}>
                  Cancel
                </button>
              </Row>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="btn-quiet w-full" onClick={() => ui.openSheet({ type: 'friend-invite' })}>
        <Icon name="link" size={16} /> Invite with a link
      </button>
    </div>
  );
}

/** Change your @username: any free one; a few ideas from your name. */
export function UsernameSheet({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const people = usePeople();
  const now = people.me?.u ?? store.state.user.username ?? '';
  const [u, setU] = useState(now);
  const [state, setState] = useState<{ free?: boolean; why?: string; checking?: boolean }>({});
  const [ideas, setIdeas] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void peopleCall({ action: 'ideas' }).then((r) => r?.status === 200 && setIdeas((r.data.ideas as string[]) ?? []));
  }, []);
  useEffect(() => {
    const c = canon(u);
    if (!c || c === now) return setState({});
    const why = problem(c);
    if (why) return setState({ free: false, why });
    setState({ checking: true });
    const t = window.setTimeout(async () => {
      const r = await peopleCall({ action: 'check', u: c });
      if (r?.status === 200) {
        setState({ free: !!r.data.free, why: r.data.why });
        if (r.data.ideas?.length) setIdeas(r.data.ideas);
      } else setState({});
    }, 350);
    return () => window.clearTimeout(t);
  }, [u, now]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await peopleCall({ action: 'rename', u: canon(u) });
    setBusy(false);
    if (!r) return setError('No connection. Try again.');
    if (r.status !== 200) return setError(String(r.data.error ?? 'Something went wrong.'));
    haptic(12);
    store.toast({ text: `You’re @${r.data.me.u} now.`, tone: 'good', emoji: '✨' });
    await people.refresh();
    onDone();
  };

  const c = canon(u);
  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      <div>
        <label htmlFor="un-input" className="text-[13px] font-semibold text-ink2">
          Username
        </label>
        <div className="field mt-1.5 flex items-center gap-0.5 focus-within:ring-2">
          <span className="text-ink3">@</span>
          <input id="un-input" className="min-w-0 flex-1 bg-transparent outline-none" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={24} value={u} onChange={(e) => setU(e.target.value.replace(/^@+/, ''))} />
        </div>
        <p className={`mt-1.5 text-[13px] ${state.free ? 'text-pos' : state.why ? 'text-warn' : 'text-ink3'}`} aria-live="polite" data-testid="un-status">
          {c === now ? 'Your username now.' : state.checking ? 'Checking…' : state.free ? 'It’s free.' : (state.why ?? ' ')}
        </p>
      </div>
      {ideas.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ideas">
          {ideas.map((x) => (
            <button key={x} type="button" className="rounded-full border border-line px-3 py-1.5 text-[13.5px] font-medium hover:bg-sunk" onClick={() => setU(x)}>
              @{x}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="text-[13.5px] font-medium text-warn" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-accent w-full" disabled={busy || !state.free || c === now}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {people.me && <p className="-mt-2 text-center text-[12.5px] text-ink3">You can change it {people.me.renamesLeft === 1 ? 'once more' : 'twice'} in 14 days.</p>}
    </form>
  );
}
