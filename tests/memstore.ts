// An in-memory stand-in for a Netlify Blobs store. Every call awaits, like the real one, so
// requests sent together interleave the way they do on the server. `jitter` adds a small random
// wait to every call, so requests sent together really do read before each other's writes.
// Like the real store, each blob has an etag, and a write can be made only if it is unchanged.
export function memStore(opts: { jitter?: boolean } = {}) {
  const m = new Map<string, unknown>();
  const tags = new Map<string, string>();
  let n = 0;
  const wait = () => (opts.jitter ? new Promise((r) => setTimeout(r, Math.random() * 6)) : Promise.resolve());
  return {
    m,
    async get(key: string) {
      await wait();
      return m.has(key) ? structuredClone(m.get(key)) : null;
    },
    async getWithMetadata(key: string) {
      await wait();
      return m.has(key) ? { data: structuredClone(m.get(key)), etag: tags.get(key)!, metadata: {} } : null;
    },
    async setJSON(key: string, value: unknown, o?: { onlyIfNew?: boolean; onlyIfMatch?: string }) {
      await wait();
      if (o?.onlyIfNew && m.has(key)) return { modified: false };
      if (o?.onlyIfMatch !== undefined && tags.get(key) !== o.onlyIfMatch) return { modified: false };
      m.set(key, structuredClone(value));
      const etag = `"${++n}"`;
      tags.set(key, etag);
      return { modified: true, etag };
    },
    async delete(key: string) {
      await wait();
      m.delete(key);
      tags.delete(key);
    },
    async list({ prefix }: { prefix: string }) {
      await wait();
      return { blobs: [...m.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}
