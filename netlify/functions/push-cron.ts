// Sends the reminders that have fallen due, and the daily message from 10 am India time.
// Netlify runs this every 15 minutes (the schedule is set here and in netlify.toml).
import { getVapid, runDue } from '../lib/push';
import { runBlasts, runDaily } from '../lib/daily';
import { makeVapid, pushStore, send } from './push';

export default async () => {
  const store = pushStore();
  const vapid = await getVapid(store, makeVapid);
  const res = await runDue(store, send, vapid);
  console.log('reminders', JSON.stringify(res));
  // After the personal reminders, so a slow daily send never delays a bill reminder.
  const daily = await runDaily(store, send, vapid).catch((e) => ({ error: String(e) }));
  console.log('daily', JSON.stringify(daily));
  // Finish any "send now" message that didn't reach everyone in its own call.
  const now = await runBlasts(store, send, vapid).catch((e) => ({ error: String(e) }));
  if (Array.isArray(now) ? now.length : true) console.log('send-now', JSON.stringify(now));
  return new Response(JSON.stringify({ ...res, daily, now }), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '*/15 * * * *' };
