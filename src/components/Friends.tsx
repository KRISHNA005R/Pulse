import { useEffect, useRef, useState } from 'react';
import type { FriendLink, Person } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic, rupees } from '../lib/format';
import { reminderDeviceId } from '../lib/reminders';
import { clearFriendNews, clearJoinLink, createChannel, friendNews, inviteUrl, joinChannel, leaveChannel, newLink, parseInvite, syncFriends, takeJoinLink, type FriendHost, type FriendNews } from '../lib/friends';
import { Field, PersonAvatar, StatusPill } from './ui/bits';
import { Icon } from './ui/Icon';

// Friends on PULSE: the screens. How the sharing works is in lib/friends.ts.

/** The store, in the shape the sync needs. */
function useHost(): FriendHost {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  return useRef<FriendHost>({
    state: () => (ref.current.state.mode === 'personal' ? ref.current.personalState() : null),
    apply: (id, box) => ref.current.applyFriendBox(id, box),
    joined: (id) => ref.current.markFriendJoined(id),
    left: (id) => ref.current.unlinkPerson(id),
    toast: (text) => ref.current.toast({ text, emoji: '🤝' }),
    dev: reminderDeviceId,
  }).current;
}

/**
 * Keeps this phone and each connected friend's phone in step, and opens the accept screen when the
 * app is opened from an invite link. Call once from the app shell.
 */
export function useFriends() {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const host = useHost();
  const ready = state.onboarding.done && state.mode === 'personal';
  const linked = state.people.some((p) => p.link);

  // An invite link: wait until the person is set up, then ask.
  useEffect(() => {
    const check = () => {
      const code = takeJoinLink();
      if (code && ready) ui.openSheet({ type: 'friend-join', code });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // What I've recorded with friends, as one string: when it changes, publish soon.
  const mine = linked ? JSON.stringify([state.splits.filter((x) => !x.remote).map((x) => [x.id, x.amount, x.paidBy, x.shares]), state.settlements.filter((x) => !x.remote), state.people.map((p) => p.link?.chan), state.user.name]) : '';
  useEffect(() => {
    if (!ready || !linked) return;
    const t = window.setTimeout(() => void syncFriends(host), 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, linked, mine]);

  // And look for what friends have added: when the app comes to the front, and every minute while it's open.
  useEffect(() => {
    if (!ready || !linked) return;
    const go = () => document.visibilityState === 'visible' && void syncFriends(host);
    const every = window.setInterval(go, 60_000);
    document.addEventListener('visibilitychange', go);
    window.addEventListener('online', go);
    return () => {
      window.clearInterval(every);
      document.removeEventListener('visibilitychange', go);
      window.removeEventListener('online', go);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, linked]);
}

/** Hand the invite to WhatsApp or whatever the phone offers; copy it where there's no share sheet. */
async function shareInvite(myName: string, link: FriendLink): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = inviteUrl(link, myName);
  const text = `${myName} wants to split bills with you on PULSE. Open this to connect, and you'll see what you owe each other:`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: `${text} ${url}` });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function useInvite() {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const myName = store.state.user.name || 'A friend';
  /** Make an invite for a person (or a new person with this name) and share it. */
  const invite = async (personId: string | null, name: string): Promise<string | null> => {
    setBusy(true);
    const link = newLink(store.state.today);
    const ok = await createChannel(link, reminderDeviceId());
    setBusy(false);
    if (!ok) {
      store.toast({ text: 'Couldn’t make the invite. Check your internet and try again.' });
      return null;
    }
    const id = store.linkPerson(personId, name, link);
    haptic(12);
    const how = await shareInvite(myName, link);
    if (how === 'copied') store.toast({ text: 'Invite copied. Paste it in a chat with them.', emoji: '📋' });
    else if (how === 'failed') store.toast({ text: 'Invite is ready. Open their page to share it.' });
    return id;
  };
  const again = async (link: FriendLink) => {
    const how = await shareInvite(myName, link);
    if (how === 'copied') store.toast({ text: 'Invite copied. Paste it in a chat with them.', emoji: '📋' });
    else if (how === 'failed') store.toast({ text: 'Couldn’t copy here. Long-press the link to copy it.' });
  };
  return { invite, again, busy, myName };
}

/** On a person's page: connect, see that it's waiting, or disconnect. */
export function FriendConnect({ person }: { person: Person }) {
  const store = useStore();
  const ui = useUI();
  const { invite, again, busy, myName } = useInvite();
  const host = useHost();
  if (store.state.mode !== 'personal') return null;
  const link = person.link;

  const disconnect = (title: string, body: string, confirm: string) =>
    ui.openSheet({
      type: 'confirm',
      title,
      body,
      confirm,
      run: () => {
        if (link) void leaveChannel(link);
        store.unlinkPerson(person.id);
      },
    });

  if (!link)
    return (
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Connect on PULSE">
        <p className="text-[15px] font-semibold">Connect with {person.short} on PULSE</p>
        <p className="mt-1 text-[13.5px] text-ink3">What you split with {person.short} shows up in their app too, with a notification. When either of you settles up, both update.</p>
        <button type="button" className="btn-primary mt-3 min-h-[40px] px-4 text-[14px]" disabled={busy} onClick={() => void invite(person.id, person.name)}>
          <Icon name="share" size={16} /> {busy ? 'Making the invite…' : `Invite ${person.short}`}
        </button>
      </section>
    );

  if (link.status === 'invited')
    return (
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Connect on PULSE">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold">Invite sent</p>
          <StatusPill status="close">Waiting</StatusPill>
        </div>
        <p className="mt-1 text-[13.5px] text-ink3">Once {person.short} opens the link in PULSE, you're connected. The link works for one person only.</p>
        <p className="num mt-3 select-all break-all rounded-xl bg-sunk px-3 py-2 text-[12.5px] text-ink2">{inviteUrl(link, myName)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => void again(link)}>
            <Icon name="share" size={16} /> Share again
          </button>
          <button type="button" className="btn-quiet min-h-[40px] px-4 text-[14px]" onClick={() => void syncFriends(host)}>
            Check now
          </button>
          <button type="button" className="btn-ghost min-h-[40px] px-3 text-[14px] text-neg" onClick={() => disconnect('Cancel this invite?', `The link you sent ${person.short} will stop working.`, 'Cancel invite')}>
            Cancel invite
          </button>
        </div>
      </section>
    );

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Connected on PULSE">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">Connected on PULSE</p>
        <StatusPill status="good">Connected</StatusPill>
      </div>
      <p className="mt-1 text-[13.5px] text-ink3">
        {link.theirName ?? person.short} sees what you split with them, and you see what they add. Each of you can only change your own entries.
      </p>
      <p className="mt-2 flex items-start gap-2 text-[12.5px] text-ink3">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        <span>Only splits and settle-ups between you two are shared, locked so PULSE's server can't read them. The notification text passes through the server and isn't kept.</span>
      </p>
      <button type="button" className="btn-ghost mt-2 min-h-[38px] px-0 text-[13.5px] text-neg" onClick={() => disconnect(`Disconnect from ${person.short}?`, 'Nothing more will be shared. What you already shared stays in both histories.', 'Disconnect')}>
        Disconnect
      </button>
    </section>
  );
}

/** Sheet: name a new friend and send them an invite. */
export function FriendInvite({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const { invite, busy } = useInvite();
  const [name, setName] = useState('');
  const others = store.state.people.filter((p) => !p.link);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14.5px] text-ink2">Send a friend a link. When they open it in PULSE, what you split with each other shows up in both apps.</p>
      <Field label="Friend's name" htmlFor="fr-name">
        <input id="fr-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul" autoComplete="off" />
      </Field>
      <button
        type="button"
        className="btn-accent w-full disabled:opacity-40"
        disabled={!name.trim() || busy}
        onClick={async () => {
          const id = await invite(null, name);
          if (!id) return;
          onDone();
          ui.push({ name: 'person', id }, 'plans');
        }}
      >
        <Icon name="share" size={17} /> {busy ? 'Making the invite…' : 'Create invite link'}
      </button>
      {others.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink2">Or invite someone you already split with</p>
          <div className="flex flex-wrap gap-2">
            {others.slice(0, 12).map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip pl-1"
                disabled={busy}
                onClick={async () => {
                  const id = await invite(p.id, p.name);
                  if (!id) return;
                  onDone();
                  ui.push({ name: 'person', id }, 'plans');
                }}
              >
                <PersonAvatar person={p} size={26} /> {p.short}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="btn-ghost w-full" onClick={() => ui.replaceSheet({ type: 'friend-join' })}>
        I have an invite from a friend
      </button>
    </div>
  );
}

/** Sheet: accept an invite, from a link or pasted in. */
export function FriendJoin({ code, onDone }: { code?: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const host = useHost();
  const [text, setText] = useState(code ?? '');
  const [as, setAs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inv = parseInvite(text);
  const who = inv?.name || 'Your friend';
  // Someone already in the list with the same first name is probably the same person.
  const guess = inv?.name ? state.people.find((p) => !p.link && p.short.toLowerCase() === inv.name.split(' ')[0].toLowerCase()) : undefined;
  const target = as || guess?.id || '';
  const mine = inv ? state.people.find((p) => p.link?.chan === inv.chan) : undefined;
  const close = () => {
    clearJoinLink();
    onDone();
  };

  if (state.mode !== 'personal')
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink2">Connecting with a friend uses your own splits. Start with your own money first, then open the invite again.</p>
        <button type="button" className="btn-primary w-full" onClick={onDone}>
          Okay
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {inv ? (
        <div className="flex items-center gap-3 rounded-2xl bg-sunk p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-[22px]" aria-hidden="true">
            🤝
          </span>
          <p className="min-w-0 text-[15px]">
            <span className="font-semibold">{who}</span> wants to split bills with you on PULSE.
          </p>
        </div>
      ) : (
        <Field label="Paste the invite link" htmlFor="fr-code" hint="The whole message works too. On iPhone: copy the link your friend sent, then paste it here.">
          <textarea id="fr-code" className="field min-h-[88px] text-[14px]" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="https://pulsemoney.in/#join=…" />
        </Field>
      )}
      {inv && mine ? (
        <p className="text-[14.5px] text-ink2">{mine.link?.status === 'invited' ? 'This is your own invite. Send it to your friend, they open it on their phone.' : `You're already connected with ${mine.short}.`}</p>
      ) : (
        inv && (
          <>
            <p className="text-[13.5px] text-ink3">What the two of you split shows up in both apps, and each gets a notification. Nothing else from your PULSE is shared.</p>
            {state.people.some((p) => !p.link) && (
              <Field label={`Who is ${who} in your list?`} htmlFor="fr-as">
                <select id="fr-as" className="field" value={target} onChange={(e) => setAs(e.target.value)}>
                  <option value="">Someone new: add {who}</option>
                  {state.people.filter((p) => !p.link).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )
      )}
      {error && (
        <p className="text-[13.5px] font-medium text-warn" role="alert">
          {error}
        </p>
      )}
      {inv && mine ? (
        <button type="button" className="btn-primary w-full" onClick={close}>
          Okay
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn-accent w-full disabled:opacity-40"
            disabled={!inv || busy}
            onClick={async () => {
              if (!inv) return;
              setBusy(true);
              const res = await joinChannel(inv, state.today, reminderDeviceId());
              setBusy(false);
              if (!res.ok) return setError(res.error);
              const id = store.linkPerson(target || null, inv.name || 'Friend', res.link);
              haptic(16);
              store.toast({ text: `You and ${inv.name || 'your friend'} are connected.`, tone: 'good', emoji: '🤝' });
              close();
              ui.resetTo('plans', { name: 'person', id });
              window.setTimeout(() => void syncFriends(host), 300);
            }}
          >
            {busy ? 'Connecting…' : inv ? `Connect with ${who}` : 'Connect'}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={close}>
            Not now
          </button>
        </>
      )}
    </div>
  );
}

/** Home: what friends have added since this phone last looked. */
export function FriendNewsCard() {
  const store = useStore();
  const ui = useUI();
  const [news, setNews] = useState<FriendNews[]>(friendNews);
  useEffect(() => {
    const on = () => setNews(friendNews());
    window.addEventListener('pulse-friends', on);
    return () => window.removeEventListener('pulse-friends', on);
  }, []);
  if (!news.length || store.state.mode !== 'personal') return null;
  const done = () => {
    clearFriendNews();
    setNews([]);
  };
  return (
    <section aria-label="From your friends" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">From your friends</h2>
        <button type="button" className="text-[13.5px] font-semibold text-accent-ink" onClick={done}>
          Got it
        </button>
      </div>
      <ul className="mt-2 flex flex-col">
        {news.slice(0, 4).map((n, i) => {
          const p = store.state.people.find((x) => x.id === n.person);
          return (
            <li key={i}>
              <button
                type="button"
                className="row-btn"
                onClick={() => {
                  done();
                  if (p) ui.resetTo('plans', { name: 'person', id: p.id });
                }}
              >
                <PersonAvatar person={p} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{n.title}</span>
                  <span className="block truncate text-[13px] text-ink3">{n.body}</span>
                </span>
                <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
              </button>
            </li>
          );
        })}
      </ul>
      {news.length > 4 && <p className="mt-1 px-2 text-[13px] text-ink3">and {news.length - 4} more</p>}
    </section>
  );
}

/** A friend marked a payment between you: say which of your accounts it moved through. */
export function FriendPayments({ person }: { person: Person }) {
  const store = useStore();
  const { state } = store;
  const open = state.settlements.filter((s) => s.remote && !s.banked && (s.from === person.id || s.to === person.id));
  if (!open.length) return null;
  const accounts = state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash');
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Payments to confirm">
      <p className="text-[15px] font-semibold">Update your balance</p>
      <ul className="mt-2 flex flex-col gap-3">
        {open.map((s) => {
          const toMe = s.to === 'me';
          return (
            <li key={s.id}>
              <p className="text-[14px] text-ink2">{toMe ? `${person.short} marked ${rupees(s.amount)} as paid to you. Where did it land?` : `${person.short} marked your ${rupees(s.amount)} as received. Where did you pay from?`}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <button key={a.id} type="button" className="chip" onClick={() => store.bankSettlement(s.id, a.id)}>
                    {a.type === 'cash' ? '💵' : '🏦'} {a.name}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
