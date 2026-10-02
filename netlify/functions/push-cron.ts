// Sends the reminders that have fallen due. Netlify runs this every 15 minutes
// (the schedule is set here and in netlify.toml).
import { getVapid, runDue } from '../lib/push';
import { makeVapid, pushStore, send } from './push';

export default async () => {
  const store = pushStore();
  const res = await runDue(store, send, await getVapid(store, makeVapid));
  console.log('reminders', JSON.stringify(res));
  return new Response(JSON.stringify(res), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '*/15 * * * *' };
