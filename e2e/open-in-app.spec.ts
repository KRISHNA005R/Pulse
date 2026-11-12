import { expect, test } from '@playwright/test';

// Invite links open in the installed PULSE app when there is one (else the website): the app
// says it handles its links and reuses its open window.
test('the app handles its own links (invites open in the installed app)', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m.scope).toBe('/');
  expect(m.handle_links).toBe('preferred');
  expect(m.launch_handler).toEqual({ client_mode: ['navigate-existing', 'auto'] });
});
