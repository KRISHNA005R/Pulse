import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authCall, authOn, cachedConfig, fetchConfig, forgetAccount, isFresh, loadSession, saveSession, setFresh, takeAuthReturn, type Account, type AuthConfig, type Session } from '../lib/auth';
import { loadBase, loadSync, newSyncCode, sameData } from '../lib/sync';
import { useStore } from './store';

// Who is signed in, and what signing in or out does to the data on this device.
// How accounts work: lib/auth.ts (here) and netlify/lib/auth.ts (the server).

interface AuthValue {
  /** Sign-in is switched on for this site. */
  on: boolean;
  /** Still finding out whether it is (only on the very first visit). */
  loading: boolean;
  cfg: AuthConfig | null;
  session: Session | null;
  /** A sign-in is being finished: shown as "Signing you in…". */
  busy: boolean;
  error: string;
  clearError(): void;
  /** What the last sign-in found: nothing anywhere ('new'), saved data ('restored'), or data on this device ('kept'). */
  outcome: 'new' | 'restored' | 'kept' | null;
  /** A brand-new account that hasn't seen its welcome yet. */
  fresh: boolean;
  seenWelcome(): void;
  google(credential: string): Promise<void>;
  /** Email a code. Returns what went wrong, or null. */
  emailStart(email: string): Promise<string | null>;
  emailVerify(email: string, code: string): Promise<string | null>;
  rename(name: string): void;
  signOut(): Promise<string | null>;
  deleteAccount(): Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  const [cfg, setCfg] = useState<AuthConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(() => cachedConfig() === null);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<AuthValue['outcome']>(null);
  const [fresh, setFreshState] = useState(isFresh);
  /** Signing out or deleting the account is under way: nothing should start saving again. */
  const leaving = useRef(false);

  /** The server said who this is: remember them and connect this device's data to their account. */
  const finish = useCallback(async (data: Record<string, unknown>): Promise<string | null> => {
    const token = String(data.token ?? '');
    let account = data.account as Account;
    if (!token || !account?.uid) return 'Something went wrong. Try again.';
    // The first device to sign in decides where the data is kept: the code it already syncs with, or a new one.
    if (!account.code) {
      const r = await authCall({ action: 'code', code: loadSync()?.code ?? newSyncCode() }, token);
      if (!r.ok) return r.error;
      account = r.data.account as Account;
    }
    const out = await ref.current.attachAccount(account.code);
    if (out === 'offline') return 'You’re signed in, but we couldn’t load your data. Check your internet and try again.';
    const s = ref.current.personalState();
    // Someone who signed in by email has no name on the account yet: use the one they already go by.
    if (!account.name && s?.user.name) {
      const r = await authCall({ action: 'name', name: s.user.fullName || s.user.name }, token);
      if (r.ok) account = r.data.account as Account;
    }
    saveSession({ token, account });
    setSession({ token, account });
    setOutcome(out);
    if (data.fresh === true) {
      setFresh(true);
      setFreshState(true);
    } else if (out === 'kept') ref.current.toast({ text: 'Signed in. Your money is saved to your account.', tone: 'good', emoji: '✅' });
    return null;
  }, []);

  const run = useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      setBusy(true);
      setError('');
      const r = await authCall(body);
      const problem = r.ok ? await finish(r.data) : r.error;
      setBusy(false);
      if (problem) setError(problem);
      return problem;
    },
    [finish],
  );

  // Is sign-in on? Ask once per visit; the last answer is used meanwhile.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => live && setLoading(false), 4000);
    void fetchConfig().then((c) => {
      if (!live) return;
      if (c) setCfg(c);
      setLoading(false);
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Back from Google's full-page sign-in.
  useEffect(() => {
    const back = takeAuthReturn();
    if (back.failed) setError('Google sign-in didn’t finish. Try again.');
    else if (back.once) void run({ action: 'exchange', once: back.once });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed out somewhere else, or the account was deleted: this device stops claiming to be signed in.
  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    void authCall({ action: 'me' }, s.token).then((r) => {
      if (r.ok) {
        const account = r.data.account as Account;
        saveSession({ token: s.token, account });
        setSession({ token: s.token, account });
      } else if (r.status === 401) {
        saveSession(null);
        setSession(null);
      }
    });
  }, []);

  // Signed in, but this device's data isn't being saved to the account (set up again after a reset,
  // say): connect it. Being signed in must always mean the data is saved.
  const personalNow = store.state.mode === 'personal' && store.state.onboarding.done;
  useEffect(() => {
    if (session?.account.code && personalNow && !store.sync.enabled && !busy && !leaving.current) void ref.current.attachAccount(session.account.code);
  }, [session, personalNow, store.sync.enabled, busy]);

  const value = useMemo<AuthValue>(
    () => ({
      on: authOn(cfg),
      loading,
      cfg,
      session,
      busy,
      error,
      clearError: () => setError(''),
      outcome,
      fresh,
      seenWelcome: () => {
        setFresh(false);
        setFreshState(false);
      },
      google: async (credential) => void (await run({ action: 'google', credential })),
      emailStart: async (email) => {
        setError('');
        const r = await authCall({ action: 'email-start', email });
        return r.ok ? null : r.error;
      },
      emailVerify: (email, code) => run({ action: 'email-verify', email, code }),
      rename: (name) => {
        const s = loadSession();
        if (!s || !name.trim() || s.account.name) return;
        void authCall({ action: 'name', name }, s.token).then((r) => {
          if (!r.ok) return;
          const next = { token: s.token, account: r.data.account as Account };
          saveSession(next);
          setSession(next);
        });
      },
      signOut: async () => {
        const s = loadSession();
        if (!navigator.onLine) return 'You’re offline. Connect to the internet first, so your latest changes are saved before you sign out.';
        await ref.current.syncNow();
        // The phone is cleared on sign-out, so everything must have reached the account first.
        const mine = ref.current.personalState();
        if (mine && loadSync() && !sameData(mine, loadBase())) return 'Couldn’t save your latest changes to your account just now. Try again in a moment.';
        if (s) await authCall({ action: 'signout' }, s.token);
        forgetAccount();
        setSession(null);
        setOutcome(null);
        setFreshState(false);
        ref.current.eraseAll();
        ref.current.toast({ text: 'Signed out. Your money is safe in your account.', tone: 'good' });
        return null;
      },
      deleteAccount: async () => {
        const s = loadSession();
        if (!s) return 'You’re not signed in.';
        if (!navigator.onLine) return 'You’re offline. Connect to the internet to delete your account.';
        // The saved copy of the data first, then the account itself, then what's on this device.
        leaving.current = true;
        const problem = await ref.current.disableSync(true);
        if (problem) {
          leaving.current = false;
          return 'Couldn’t reach the server to delete your data. Try again in a moment.';
        }
        const r = await authCall({ action: 'delete' }, s.token);
        if (!r.ok && r.status !== 401) {
          leaving.current = false;
          return r.error;
        }
        forgetAccount();
        setSession(null);
        setOutcome(null);
        setFreshState(false);
        ref.current.eraseAll();
        leaving.current = false;
        ref.current.toast({ text: 'Your account and its data are deleted.' });
        return null;
      },
    }),
    [cfg, loading, session, busy, error, outcome, fresh, run],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
