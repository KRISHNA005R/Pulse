import { describe, expect, it } from 'vitest';
import { handle } from '../netlify/functions/feedback';
import { memStore } from './memstore';

const env = { to: 'owner@example.com', from: 'x@example.com', keyHash: '', canThank: false, fetch };

const post = (store: ReturnType<typeof memStore>, ip: string) =>
  handle(
    new Request('https://pulsemoney.in/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
      body: JSON.stringify({ type: 'idea', message: 'Love the app' }),
    }),
    store,
    env,
  );

describe('feedback', () => {
  it('takes 10 messages an hour from one sender, then says to wait', async () => {
    const store = memStore();
    for (let i = 0; i < 10; i++) expect((await post(store, '1.2.3.4')).status).toBe(200);
    expect((await post(store, '1.2.3.4')).status).toBe(429);
    // Someone else is not affected.
    expect((await post(store, '5.6.7.8')).status).toBe(200);
  });
});
