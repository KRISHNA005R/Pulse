// Usernames for everyone: once a day, an account that hasn't been given a username yet (signed up
// before usernames, and hasn't opened PULSE since) gets one. The app makes one the first time it
// asks too, so this only catches people who haven't been back. Safe to run any number of times.
import { getStore } from '@netlify/blobs';
import { backfillProfiles, type PeopleStore } from '../lib/people';

export default async () => {
  const store = getStore({ name: 'pulse-accounts', consistency: 'strong' }) as unknown as PeopleStore;
  const res = await backfillProfiles(store);
  console.log('usernames', JSON.stringify(res));
  return new Response(JSON.stringify(res), { headers: { 'content-type': 'application/json', 'x-content-type-options': 'nosniff' } });
};

export const config = { schedule: '17 3 * * *' };
