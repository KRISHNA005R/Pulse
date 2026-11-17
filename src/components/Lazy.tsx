import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';

// Screens and sheets load when they're first opened, not all at the start, so PULSE opens faster.
// The installed app keeps every piece on the phone (the service worker), so this works offline too.
//
// If a piece can't be fetched (no internet in the browser, or PULSE was updated while open and the
// old piece is gone), it's tried once more; after an update the page reloads into the new version
// once; otherwise a small "Couldn't open this" with Try again shows instead of a blank screen.

const RELOADED = 'pulse-chunk-reload';

/** Is this error a piece of the app that failed to download? */
export const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically|Loading chunk|ChunkLoadError/i.test(String((e as Error)?.message ?? e));

async function load<M>(get: () => Promise<M>): Promise<M> {
  try {
    const m = await get();
    try {
      sessionStorage.removeItem(RELOADED);
    } catch {
      /* fine */
    }
    return m;
  } catch (e) {
    if (!isChunkError(e)) throw e;
    await new Promise((r) => setTimeout(r, 700));
    try {
      return await get();
    } catch (e2) {
      // Online but the piece is gone: PULSE was updated. Reload into the new version, once.
      let again = false;
      try {
        again = sessionStorage.getItem(RELOADED) === '1';
        if (navigator.onLine && !again) sessionStorage.setItem(RELOADED, '1');
      } catch {
        again = true;
      }
      if (navigator.onLine && !again) location.reload();
      throw e2;
    }
  }
}

/** A named export of a module, loaded when first shown: lazyNamed(() => import('./x'), 'Thing'). */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(get: () => Promise<M>, key: K): M[K] {
  return lazy(() => load(get).then((m) => ({ default: m[key] as unknown as ComponentType<unknown> }))) as unknown as M[K];
}

/** Shown for the moment a screen is loading. */
export function Loading({ tall }: { tall?: boolean }) {
  return (
    <div className={`grid place-items-center ${tall ? 'min-h-[50vh]' : 'min-h-[120px]'}`} role="status" aria-label="Loading">
      <span className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-line border-t-accent motion-reduce:animate-none" aria-hidden="true" />
    </div>
  );
}

/** Catches a piece that couldn't be loaded and offers Try again (any other error is passed on). */
export class ChunkBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    // Not a download problem: let it go on up, as it would without this.
    if (!isChunkError(this.state.error)) throw this.state.error;
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
        <p className="text-[15px] font-semibold">Couldn’t open this.</p>
        <p className="text-[13.5px] text-ink3">Check your internet and try again.</p>
        <button type="button" className="btn-accent min-h-[40px] px-5" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
}

/** Loading spinner while a piece downloads; Try again if it can't. */
export function Lazy({ children, tall }: { children: ReactNode; tall?: boolean }) {
  return (
    <ChunkBoundary>
      <Suspense fallback={<Loading tall={tall} />}>{children}</Suspense>
    </ChunkBoundary>
  );
}
