// An in-memory stand-in for a Netlify Blobs store. Every call awaits, like the real one, so
// requests sent together interleave the way they do on the server.
export function memStore() {
  const m = new Map<string, unknown>();
  return {
    m,
    async get(key: string) {
      return m.has(key) ? structuredClone(m.get(key)) : null;
    },
    async setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }) {
      if (opts?.onlyIfNew && m.has(key)) return { modified: false };
      m.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key: string) {
      m.delete(key);
    },
    async list({ prefix }: { prefix: string }) {
      return { blobs: [...m.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}
