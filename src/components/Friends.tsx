import { useEffect, useRef, useState } from 'react';
import type { FriendLink, Group, Person } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic, rupees } from '../lib/format';
import { reminderDeviceId } from '../lib/reminders';
import {
  clearFriendNews,
  clearJoinLink,
  createChannel,
  createGroupChannel,
  doorUrl,
  friendNews,
  groupUrl,
  inGroupOnPulse,
  inviteUrl,
  joinChannel,
  joinGroupChannel,
  knock,
  leaveChannel,
  leaveGroupChannel,
  lockGroup,
  newLink,
  newUid,
  openDoor,
  parseInvite,
  removeFromGroup,
  syncFriends,
  takeJoinLink,
  type FriendHost,
  type FriendNews,
  type GroupJoin as GroupJoinResult,
  type Invite,
} from '../lib/friends';
import { Field, PersonAvatar, StatusPill, Toggle } from './ui/bits';
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
    knocked: (name, link, uid) => ref.current.friendKnocked(name, link, uid),
    applyGroup: (id, view) => ref.current.applyGroupView(id, view),
    groupLeft: (id) => ref.current.unshareGroup(id),
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
  // Anything to keep in step: a connected friend, a shared group, or my own link that people may have opened.
  const linked = state.people.some((p) => p.link) || state.groups.some((g) => g.shared) || !!state.user.door;

  // The id other people's apps know me by.
  useEffect(() => {
    if (ready && !state.user.uid) store.updateUser({ uid: newUid() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.user.uid]);

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
  const mine = linked
    ? JSON.stringify([
        state.splits.filter((x) => !x.remote).map((x) => [x.id, x.amount, x.paidBy, x.shares, x.group, x.description, x.date]),
        state.settlements.filter((x) => !x.remote),
        state.people.map((p) => p.link?.chan),
        state.groups.map((g) => [g.id, g.name, g.emoji, g.members, g.shared?.gid, g.shared?.claim]),
        state.user.name,
        state.user.door?.id,
      ])
    : '';
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

type Shared = 'shared' | 'copied' | 'cancelled' | 'failed';
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
/** Hand a link to WhatsApp or whatever the phone offers; copy it where there's no share sheet. */
async function shareText(text: string, url: string): Promise<Shared> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: `${text} ${url}` });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(`${text} ${url}`)) ? 'copied' : 'failed';
}
const shareInvite = (myName: string, link: FriendLink) => shareText(`${myName} wants to split bills with you on PULSE. Open this to connect, and you'll see what you owe each other:`, inviteUrl(link, myName));

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

  // I opened their personal link: nothing to send, their phone picks it up.
  if (link.status === 'invited' && link.door)
    return (
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Connect on PULSE">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold">Almost connected</p>
          <StatusPill status="close">Waiting</StatusPill>
        </div>
        <p className="mt-1 text-[13.5px] text-ink3">You opened {person.short}'s PULSE link. You're connected as soon as {person.short} opens PULSE. You can already split with them; it reaches them then.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-quiet min-h-[40px] px-4 text-[14px]" onClick={() => void syncFriends(host)}>
            Check now
          </button>
          <button type="button" className="btn-ghost min-h-[40px] px-3 text-[14px] text-neg" onClick={() => disconnect('Cancel connecting?', `${person.short} won't be connected with you.`, 'Cancel')}>
            Cancel
          </button>
        </div>
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

/** Sheet: my own PULSE link (one link for everybody), or an invite for one person I already split with. */
export function FriendInvite({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const { invite, busy, myName } = useInvite();
  const door = store.state.user.door;
  const others = store.state.people.filter((p) => !p.link);
  // The link is made the first time this sheet is opened, and switched on at the server.
  useEffect(() => {
    void openDoor(store.ensureDoor(), reminderDeviceId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const url = door ? doorUrl(door, myName) : '';
  const say = (how: Shared) => {
    if (how === 'copied') store.toast({ text: 'Link copied. Paste it anywhere.', emoji: '📋' });
    else if (how === 'failed') store.toast({ text: 'Couldn’t copy here. Long-press the link to copy it.' });
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[15px] font-semibold">Your PULSE link</p>
        <p className="mt-1 text-[13.5px] text-ink3">One link for everyone. Send it to a friend, a group chat, anywhere. Whoever opens it is connected with you, and what you split shows up in both apps.</p>
      </div>
      <p className="num min-h-[40px] select-all break-all rounded-xl bg-sunk px-3 py-2 text-[12.5px] text-ink2" aria-label="Your PULSE link">
        {url || 'Making your link…'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-accent" disabled={!url} onClick={async () => say(await shareText(`Split bills with me on PULSE. Open this and we're connected:`, url))}>
          <Icon name="share" size={17} /> Share my link
        </button>
        <button type="button" className="btn-quiet" disabled={!url} onClick={async () => say((await copyText(url)) ? 'copied' : 'failed')}>
          <Icon name="copy" size={16} /> Copy
        </button>
      </div>
      <p className="text-[12.5px] text-ink3">
        People who don't have PULSE yet set it up first, then they're connected. Shared it somewhere you didn't mean to?{' '}
        <button
          type="button"
          className="font-semibold text-accent-ink underline-offset-2 hover:underline"
          onClick={() =>
            ui.openSheet({
              type: 'confirm',
              title: 'Make a new link?',
              body: 'Your old link stops working. Friends who already connected stay connected.',
              confirm: 'Make a new link',
              run: () => {
                void openDoor(store.resetDoor(), reminderDeviceId());
                store.toast({ text: 'New link ready. The old one no longer works.' });
              },
            })
          }
        >
          Make a new link
        </button>
      </p>
      {others.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink2">Or invite someone already in your list</p>
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
          <p className="mt-2 text-[12.5px] text-ink3">This makes a link just for them, so what you already split with them comes along.</p>
        </div>
      )}
      <button type="button" className="btn-ghost w-full" onClick={() => ui.replaceSheet({ type: 'friend-join' })}>
        I have a link from a friend
      </button>
    </div>
  );
}

/** Sheet: open a link from a friend (an invite, their personal link, or a group's link), from the address bar or pasted in. */
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
  const door = inv?.kind === 'door';
  const mine = inv ? state.people.find((p) => (door ? p.link?.door === inv.chan : p.link?.chan === inv.chan)) : undefined;
  const myOwn = !!inv && door && state.user.door?.id === inv.chan;
  const close = () => {
    clearJoinLink();
    onDone();
  };

  if (state.mode !== 'personal')
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink2">Connecting with friends uses your own splits. Start with your own money first, then open the link again.</p>
        <button type="button" className="btn-primary w-full" onClick={onDone}>
          Okay
        </button>
      </div>
    );

  if (inv?.kind === 'group') return <GroupJoin inv={inv} onDone={close} />;

  const settled = myOwn ? 'This is your own PULSE link. Send it to your friends; they open it on their phones.' : mine ? (mine.link?.status === 'linked' ? `You're already connected with ${mine.short}.` : door ? `You've already opened ${mine.short}'s link. You're connected as soon as they open PULSE.` : 'This is your own invite. Send it to your friend, they open it on their phone.') : '';

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
        <Field label="Paste the link" htmlFor="fr-code" hint="A friend's link or a group's link. The whole message works too. On iPhone: copy the link, then paste it here.">
          <textarea id="fr-code" className="field min-h-[88px] text-[14px]" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="https://pulsemoney.in/#…" />
        </Field>
      )}
      {inv && settled ? (
        <p className="text-[14.5px] text-ink2">{settled}</p>
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
      {inv && settled ? (
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
              const fresh = store.personalState() ?? state;
              const res = door ? await knock(inv, fresh, reminderDeviceId()) : await joinChannel(inv, state.today, reminderDeviceId());
              setBusy(false);
              if (!res.ok) return setError(res.error);
              const id = store.linkPerson(target || null, inv.name || 'Friend', res.link);
              haptic(16);
              store.toast(door ? { text: `Done. You're connected as soon as ${inv.name || 'your friend'} opens PULSE.`, tone: 'good', emoji: '🤝' } : { text: `You and ${inv.name || 'your friend'} are connected.`, tone: 'good', emoji: '🤝' });
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

/** Inside the same sheet: a group's link. Join, and say which name in the group is you, if any. */
function GroupJoin({ inv, onDone }: { inv: Invite; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const host = useHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<Extract<GroupJoinResult, { ok: true }> | null>(null);
  const name = found?.name ?? (inv.name || 'this group');
  const already = state.groups.find((g) => g.shared?.gid === inv.chan);
  // Joined at the server but closed the sheet before choosing: give the seat back.
  const pending = useRef<Extract<GroupJoinResult, { ok: true }> | null>(null);
  useEffect(
    () => () => {
      if (pending.current) void leaveGroupChannel(pending.current.share);
    },
    [],
  );

  const finish = (res: Extract<GroupJoinResult, { ok: true }>, claim?: string) => {
    pending.current = null;
    const id = store.joinGroup(res.name, res.emoji, { ...res.share, ...(claim ? { claim } : {}) });
    haptic(16);
    store.toast({ text: `You're in ${res.name}.`, tone: 'good', emoji: res.emoji });
    onDone();
    ui.resetTo('plans', { name: 'group', id });
    window.setTimeout(() => void syncFriends(host), 300);
  };

  if (already)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink2">You're already in {already.name}.</p>
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => {
            onDone();
            ui.resetTo('plans', { name: 'group', id: already.id });
          }}
        >
          Open the group
        </button>
      </div>
    );

  if (found) {
    const first = (state.user.name || '').trim().toLowerCase();
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[15px] font-semibold">Is one of these you?</p>
          <p className="mt-1 text-[13.5px] text-ink3">These names were added to {name} by hand. If one is you, pick it and your share so far comes with you.</p>
        </div>
        <div className="flex flex-col gap-2" role="group" aria-label="Names in the group">
          {found.ghosts.map((g) => (
            <button key={g.id} type="button" className={`row-btn min-h-[48px] rounded-xl border ${g.name.split(' ')[0].toLowerCase() === first ? 'border-ink' : 'border-line'}`} onClick={() => finish(found, g.id)}>
              <span className="flex-1 text-[15px] font-medium">I'm {g.name}</span>
              <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary w-full" onClick={() => finish(found)}>
          None of these, I'm new
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-sunk p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-[22px]" aria-hidden="true">
          👥
        </span>
        <p className="min-w-0 text-[15px]">
          You're invited to <span className="font-semibold">{name}</span> on PULSE.
        </p>
      </div>
      <p className="text-[13.5px] text-ink3">Everyone in the group sees its expenses and who owes what, each in their own PULSE. Nothing else from your PULSE is shared.</p>
      {error && (
        <p className="text-[13.5px] font-medium text-warn" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn-accent w-full disabled:opacity-40"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await joinGroupChannel(inv, state.today, reminderDeviceId());
          setBusy(false);
          if (!res.ok) return setError(res.error);
          if (!res.ghosts.length) return finish(res);
          pending.current = res;
          setFound(res);
        }}
      >
        {busy ? 'Joining…' : `Join ${name}`}
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onDone}>
        Not now
      </button>
    </div>
  );
}

/** On a group's page: share it with a link, see who has joined, leave. */
export function GroupShareCard({ group }: { group: Group }) {
  const store = useStore();
  const ui = useUI();
  const host = useHost();
  const [busy, setBusy] = useState(false);
  if (store.state.mode !== 'personal') return null;
  const sh = group.shared;
  const me = store.state.user.name || 'A friend';
  const send = async (g: Group) => {
    const how = await shareText(`${me} added you to "${g.name}" on PULSE. Open this to join and see who owes what:`, groupUrl(g));
    if (how === 'copied') store.toast({ text: 'Group link copied. Paste it in your group chat.', emoji: '📋' });
    else if (how === 'failed') store.toast({ text: 'Couldn’t copy here. Long-press the link to copy it.' });
  };

  if (!sh)
    return (
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Invite to group">
        <p className="text-[15px] font-semibold">Invite people with a link</p>
        <p className="mt-1 text-[13.5px] text-ink3">Send one link to your group chat. Everyone who opens it joins this group in their own PULSE: they appear here by themselves, see every expense, and can add their own.</p>
        <button
          type="button"
          className="btn-primary mt-3 min-h-[40px] px-4 text-[14px]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const share = store.shareGroup(group.id);
            if (share) await createGroupChannel(share, reminderDeviceId());
            setBusy(false);
            haptic(12);
            if (share) await send({ ...group, shared: share });
            void syncFriends(host);
          }}
        >
          <Icon name="share" size={16} /> {busy ? 'Making the link…' : 'Share group link'}
        </button>
      </section>
    );

  const joined = group.members.filter((m) => m !== 'me' && inGroupOnPulse(group, m));
  const people = store.state.people;
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Shared group">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">Shared group</p>
        <StatusPill status={joined.length ? 'good' : 'close'}>{joined.length ? `${joined.length + 1} on PULSE` : 'Waiting for people'}</StatusPill>
      </div>
      <p className="mt-1 text-[13.5px] text-ink3">Everyone who opens this link joins from their own PULSE and shows up here by themselves.{sh.closed ? ' New people can’t join right now.' : ''}</p>
      <p className="num mt-3 select-all break-all rounded-xl bg-sunk px-3 py-2 text-[12.5px] text-ink2">{groupUrl(group)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary min-h-[40px] px-4 text-[14px]" onClick={() => void send(group)}>
          <Icon name="share" size={16} /> Share link
        </button>
        <button type="button" className="btn-quiet min-h-[40px] px-4 text-[14px]" onClick={() => void syncFriends(host)}>
          Check now
        </button>
      </div>
      {sh.owner && (
        <div className="mt-3 border-t border-line pt-1">
          <Toggle
            label="New people can join"
            sub="Switch off once everyone is in."
            checked={!sh.closed}
            onChange={async (open) => {
              if (await lockGroup(sh, !open)) store.setGroupClosed(group.id, !open);
              else store.toast({ text: 'Couldn’t change that. Check your internet and try again.' });
            }}
          />
          {joined.length > 0 && (
            <ul className="mt-1 flex flex-col">
              {joined.map((pid) => {
                const p = people.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <li key={pid} className="flex items-center gap-3 px-2 py-1.5">
                    <PersonAvatar person={p} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[14.5px]">{p.name}</span>
                    <button
                      type="button"
                      className="btn-ghost min-h-[36px] px-2 text-[13.5px] text-neg"
                      onClick={() =>
                        ui.openSheet({
                          type: 'confirm',
                          title: `Remove ${p.short} from ${group.name}?`,
                          body: `${p.short} stops seeing this group, and the expenses ${p.short} added are taken out for everyone.${sh.closed ? '' : ' To keep them from joining again with the link, also switch off "New people can join".'}`,
                          confirm: 'Remove',
                          run: async () => {
                            if (await removeFromGroup(sh, pid)) void syncFriends(host);
                            else store.toast({ text: 'Couldn’t remove them. Check your internet and try again.' });
                          },
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <p className="mt-2 flex items-start gap-2 text-[12.5px] text-ink3">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        <span>Only this group is shared, locked so PULSE's server can't read it. Anyone with the link can join, so share it only with the group.</span>
      </p>
    </section>
  );
}

/** Sheet: two names in the list are the same person. */
export function PersonMerge({ personId, onDone }: { personId: string; onDone: () => void }) {
  const store = useStore();
  const ui = useUI();
  const p = store.state.people.find((x) => x.id === personId);
  if (!p) return null;
  // Two people who are each connected on PULSE are two different people.
  const others = store.state.people.filter((x) => x.id !== p.id && !(x.link && p.link));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14.5px] text-ink2">Is {p.short} in your list twice? Pick the other name. Everything you split with them moves to {p.name}.</p>
      {others.length ? (
        <ul className="flex flex-col">
          {others.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="row-btn"
                onClick={() =>
                  ui.replaceSheet({
                    type: 'confirm',
                    title: `Merge ${o.name} into ${p.name}?`,
                    body: `Everything recorded with ${o.name} moves to ${p.name}, and ${o.name} leaves your list. This can't be undone.`,
                    confirm: 'Merge',
                    run: () => store.mergePeople(o.id, p.id),
                  })
                }
              >
                <PersonAvatar person={o} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{o.name}</span>
                  {o.link?.status === 'linked' && <span className="block text-[12.5px] text-ink3">on PULSE</span>}
                </span>
                <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink3">There's nobody else to merge with.</p>
      )}
      <button type="button" className="btn-ghost w-full" onClick={onDone}>
        Cancel
      </button>
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
          const g = n.group ? store.state.groups.find((x) => x.id === n.group) : undefined;
          return (
            <li key={i}>
              <button
                type="button"
                className="row-btn"
                onClick={() => {
                  done();
                  if (g) ui.resetTo('plans', { name: 'group', id: g.id });
                  else if (p) ui.resetTo('plans', { name: 'person', id: p.id });
                }}
              >
                {p || !g ? (
                  <PersonAvatar person={p} size={40} />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunk text-[20px]" aria-hidden="true">
                    {g.emoji}
                  </span>
                )}
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

/** A friend marked a payment between us: say which of my accounts it moved through. */
export function FriendPayments({ person }: { person: Person }) {
  const store = useStore();
  const { state } = store;
  const open = state.settlements.filter((s) => s.remote && !s.banked && ((s.from === person.id && s.to === 'me') || (s.from === 'me' && s.to === person.id)));
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
