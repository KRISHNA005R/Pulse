import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { loadSession } from '../lib/auth';
import { doorUrl, openDoor, syncFriends } from '../lib/friends';
import { socialTotals } from '../lib/finance';
import { reminderDeviceId } from '../lib/reminders';
import { markBhisiAutoJoin } from '../lib/bhisiShare';
import { invitedTo, openInvites } from '../lib/invites';
import { QR } from '../screens/Sync';
import { EmptyState, PersonAvatar, TopNavigation } from './ui/bits';
import { act, peopleCall, peopleView, type FriendRow, type PeopleView } from '../lib/people';
import { canon, problem } from '../../netlify/lib/username';
import { haptic, rupees } from '../lib/format';
import { copyText, shareText, useHost, type Shared } from './Friends';
import { Icon } from './ui/Icon';

// Friends: your card to share, add by @username, requests, blocked; change your @username; invite friends to a group or bhisi.

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

type Tab = 'friends' | 'requests' | 'blocked';

/** You → Friends: your card to share, add by @username, friends, requests and blocked. */
export function FriendsScreen() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const people = usePeople();
  const signedIn = !!loadSession() && state.mode === 'personal';
  const [tab, setTab] = useState<Tab>('friends');
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
  // My link is made the first time, and switched on at the server.
  useEffect(() => {
    if (state.mode === 'personal') void openDoor(store.ensureDoor(), reminderDeviceId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useMemo(() => socialTotals(state), [state]);
  const friends = useMemo(() => state.people.filter((p) => p.link?.status === 'linked').sort((a, b) => a.name.localeCompare(b.name)), [state.people]);
  const door = state.user.door;
  const myName = state.user.name || 'A friend';
  const url = door ? doorUrl(door, myName) : '';
  const me = people.me;
  const u = me?.u ?? state.user.username;
  const requests = people.received.length;

  const run = async (key: string, action: string, uid: string) => {
    setBusy(key);
    setError('');
    const r = await act(action, uid);
    setBusy('');
    if (r.error) return setError(r.error);
    haptic(10);
    if (found && found !== 'none' && found.uid === uid && r.standing) setFound({ ...found, standing: r.standing });
    const done: Record<string, string> = { request: 'Request sent.', accept: 'You’re friends now.', decline: 'Request removed.', cancel: 'Request cancelled.', unblock: 'Unblocked.' };
    if (done[action]) store.toast({ text: action === 'request' && r.standing === 'friends' ? 'You’re friends now.' : done[action], tone: 'good', emoji: '🤝' });
    await people.refresh();
  };

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = canon(q);
    if (!c) return;
    if (problem(c)) return setFound('none');
    setBusy('find');
    setError('');
    const r = await peopleCall({ action: 'find', u: c });
    setBusy('');
    if (!r) return setError('No connection. Try again.');
    if (r.status !== 200) return setError(String(r.data.error ?? 'Something went wrong.'));
    setFound(r.data.found ?? 'none');
  };
  const say = (how: Shared) => {
    if (how === 'copied') store.toast({ text: 'Link copied.', emoji: '📋' });
    else if (how === 'failed') store.toast({ text: 'Couldn’t copy here. Try again.' });
  };

  if (state.mode !== 'personal')
    return (
      <div>
        <TopNavigation title="Friends" onBack={ui.pop} />
        <EmptyState icon="users" title="Friends live in your own PULSE." body="Leave the demo to add real friends." />
      </div>
    );

  const tabs: [Tab, string, number][] = [
    ['friends', 'Friends', friends.length],
    ['requests', 'Requests', requests + people.sent.length],
    ['blocked', 'Blocked', people.blocked.length],
  ];
  return (
    <div>
      <TopNavigation title="Friends" onBack={ui.pop} />

      {/* My card: the one thing to share. Scan or open it and we're friends. */}
      <section className="rounded-3xl bg-accent p-4 text-on-accent" aria-label="Your friend card">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <PersonAvatar me size={44} />
            <p className="display mt-2 truncate text-[21px] leading-tight">{state.user.fullName || state.user.name}</p>
            {u && <p className="truncate text-[14.5px] font-semibold opacity-85">@{u}</p>}
            <p className="mt-2 text-[12.5px] opacity-75">Scan to split with me</p>
          </div>
          <div className="shrink-0">{url ? <QR text={url} size={112} label="QR code to add you as a friend" /> : <span className="block h-[112px] w-[112px] rounded-xl bg-white/20" />}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="tap flex min-h-[42px] items-center justify-center gap-2 rounded-full bg-[#FFFBF4] text-[14px] font-semibold text-[#17140F]" disabled={!url} onClick={async () => say(await shareText(`Add me on PULSE${u ? ` (@${u})` : ''} and we can split bills:`, url))}>
            <Icon name="share" size={16} /> Share
          </button>
          <button type="button" className="tap flex min-h-[42px] items-center justify-center gap-2 rounded-full bg-black/15 text-[14px] font-semibold" disabled={!url} onClick={async () => say((await copyText(url)) ? 'copied' : 'failed')}>
            <Icon name="copy" size={16} /> Copy link
          </button>
        </div>
      </section>

      {/* Add by @username */}
      {signedIn ? (
        <form onSubmit={find} className="mt-4 flex gap-2" role="search">
          <label htmlFor="fr-find" className="sr-only">
            Add by @username
          </label>
          <div className="relative min-w-0 flex-1">
            <Icon name="user-plus" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              id="fr-find"
              className="field py-2.5 pl-11"
              placeholder="Add by @username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setFound(null);
              }}
            />
          </div>
          <button type="submit" className="btn-primary shrink-0 px-5" disabled={!q.trim() || busy === 'find'}>
            {busy === 'find' ? '…' : 'Find'}
          </button>
        </form>
      ) : (
        <button type="button" className="row-btn mt-3" onClick={() => ui.resetTo('you', { name: 'account' })}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunk text-ink2">
            <Icon name="at" size={18} />
          </span>
          <span className="min-w-0 flex-1 text-left text-[15px] font-semibold">Sign in to add by @username</span>
          <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
        </button>
      )}
      {found === 'none' && <p className="mt-2 px-1 text-[13.5px] text-ink3">No one with that username.</p>}
      {found && found !== 'none' && (
        <ul className="mt-2 rounded-2xl border border-line px-3" aria-label="Found">
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
        <p className="mt-2 px-1 text-[13.5px] font-medium text-warn" role="alert">
          {error}
        </p>
      )}

      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Friends">
        {tabs.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="chip relative shrink-0" onClick={() => setTab(k)}>
            {label} <span className="opacity-60">{n}</span>
            {k === 'requests' && requests > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg" aria-label="New" />}
          </button>
        ))}
      </div>

      {tab === 'friends' &&
        (friends.length ? (
          <ul className="mt-2 flex flex-col">
            {friends.map((p) => {
              const v = t.balances.get(p.id) ?? 0;
              return (
                <li key={p.id}>
                  <button type="button" className="row-btn" onClick={() => ui.push({ name: 'person', id: p.id })}>
                    <PersonAvatar person={p} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[13px] text-ink3">{p.username ? `@${p.username}` : 'on PULSE'}</span>
                    </span>
                    <span className={`shrink-0 text-[13px] ${v > 0 ? 'font-semibold text-pos' : v < 0 ? 'font-semibold text-ink2' : 'text-ink3'}`}>{v > 0 ? `owes you ${rupees(v)}` : v < 0 ? `you owe ${rupees(-v)}` : 'settled'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 py-8 text-center text-[14.5px] text-ink3">No friends yet. Share your card.</p>
        ))}

      {tab === 'requests' && (
        <div className="mt-2 flex flex-col gap-4">
          {people.received.length > 0 && (
            <ul className="flex flex-col divide-y divide-line" aria-label="Requests">
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
          )}
          {people.sent.length > 0 && (
            <section aria-labelledby="fr-out">
              <p id="fr-out" className="eyebrow">
                Sent
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
          {!people.received.length && !people.sent.length && <p className="px-1 py-8 text-center text-[14.5px] text-ink3">No requests.</p>}
        </div>
      )}

      {tab === 'blocked' &&
        (people.blocked.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {people.blocked.map((p) => (
              <Row key={p.uid} p={p}>
                <button type="button" className="btn-ghost min-h-[38px] px-3 text-[13.5px]" disabled={!!busy} onClick={() => void run(p.uid, 'unblock', p.uid)}>
                  Unblock
                </button>
              </Row>
            ))}
          </ul>
        ) : (
          <p className="px-1 py-8 text-center text-[14.5px] text-ink3">Nobody blocked.</p>
        ))}
    </div>
  );
}

/** Invite friends to a group or a bhisi: tap who, then Invite. They get it in PULSE. */
export function InviteFriends({ k, url, name, onDone }: { k: 'g' | 'b'; url: string; name: string; onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const host = useHost();
  const already = invitedTo(store.state, url);
  const [picked, setPicked] = useState<string[]>([]);
  const friends = store.state.people.filter((p) => p.link?.status === 'linked').sort((a, b) => a.name.localeCompare(b.name));
  if (!friends.length)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-ink2">No friends on PULSE yet.</p>
        <button
          type="button"
          className="btn-accent w-full"
          onClick={() => {
            onDone();
            ui.closeAllSheets();
            ui.push({ name: 'friends' }, 'you');
          }}
        >
          <Icon name="user-plus" size={16} /> Add friends
        </button>
      </div>
    );
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <div className="flex flex-col gap-4">
      <ul className="-mx-1 flex max-h-[50vh] flex-col overflow-y-auto">
        {friends.map((p) => {
          const sent = already.has(p.id);
          const on = picked.includes(p.id);
          return (
            <li key={p.id}>
              <button type="button" className="row-btn" aria-pressed={on} onClick={() => toggle(p.id)}>
                <PersonAvatar person={p} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[13px] text-ink3">{sent ? 'Invited' : p.username ? `@${p.username}` : 'on PULSE'}</span>
                </span>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-accent bg-accent text-on-accent' : 'border-line'}`} aria-hidden="true">
                  {on && <Icon name="check" size={14} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn-accent w-full"
        disabled={!picked.length}
        onClick={() => {
          const n = store.sendInvites(k, url, name, picked);
          haptic(12);
          store.toast({ text: n === 1 ? 'Invite sent.' : `${n} invites sent.`, tone: 'good', emoji: '💌' });
          void syncFriends(host);
          onDone();
        }}
      >
        {picked.length ? `Invite ${picked.length}` : 'Pick friends'}
      </button>
    </div>
  );
}

/** Invites friends sent me, with Join. */
export function InviteCards({ k }: { k: 'g' | 'b' }) {
  const store = useStore();
  const list = openInvites(store.state, k);
  if (!list.length) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {list.slice(0, 3).map((x) => {
        const p = store.state.people.find((y) => y.id === x.from);
        return (
          <section key={x.id} className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-3" aria-label={`Invite to ${x.name}`}>
            <PersonAvatar person={p} size={36} />
            <p className="min-w-0 flex-1 text-[14px] leading-snug">
              <span className="font-semibold">{p?.short ?? 'A friend'}</span> invited you to <span className="font-semibold">{x.name}</span>
            </p>
            <button type="button" className="btn-ghost min-h-[36px] shrink-0 px-2 text-[13px]" onClick={() => store.answerInvite(x.id, 'no')}>
              Not now
            </button>
            <button
              type="button"
              className="btn-accent min-h-[36px] shrink-0 px-4 text-[13.5px]"
              onClick={() => {
                store.answerInvite(x.id, 'joined');
                if (x.k === 'b') markBhisiAutoJoin();
                location.hash = x.h;
              }}
            >
              Join
            </button>
          </section>
        );
      })}
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
