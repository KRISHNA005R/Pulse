import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { loadSession } from '../lib/auth';
import { syncFriends } from '../lib/friends';
import { openInvites } from '../lib/invites';
import { peopleView, takeMeet, type PeopleView } from '../lib/people';
import { useHost } from './Friends';
import { atRest, typing } from './InstallPrompt';

// The friends hooks the whole app needs from the start, kept apart from the Friends screen so that
// screen can load only when it's opened.

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

/**
 * App-wide: say hello to a new username once, open a Meet link kept from before signing in, and put
 * friend requests and invites on the app icon (the badge, where the phone supports it).
 */
export function usePeopleNotices() {
  const store = useStore();
  const ui = useUI();
  const people = usePeople();
  const { state } = store;
  const ready = state.onboarding.done && state.mode === 'personal';
  const quiet = ui.sheets.length === 0;
  // "You're @…" waits until they're not in the middle of something (like the home-screen nudge).
  const calm = atRest(ui);
  useEffect(() => {
    if (!ready || !quiet || !loadSession()) return;
    const kept = takeMeet();
    if (kept) return ui.openSheet({ type: 'meet', token: kept });
    if (people.me?.fresh && calm && !typing()) ui.openSheet({ type: 'hello-username' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, quiet, calm, people.me?.fresh]);
  const badge = ready ? people.received.length + openInvites(state).length : 0;
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (badge > 0) void nav.setAppBadge?.(badge).catch(() => {});
      else void nav.clearAppBadge?.().catch(() => {});
    } catch {
      /* no badges here */
    }
  }, [badge]);
}

