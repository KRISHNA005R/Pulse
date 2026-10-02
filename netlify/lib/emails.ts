// The two emails PULSE sends about feedback, in PULSE's own look:
//   ownerEmail  -> to the person who builds PULSE, with the message and one-tap actions
//   thanksEmail -> to the user who left an email address, to say it landed
//
// Email apps run no scripts, so "interactive" here means real buttons and links.
// Everything is tables and inline styles, because that's what Gmail and Outlook keep.
import type { Feedback } from '../functions/feedback';

export const SITE = 'https://pulsemoney.in';
const INSTAGRAM = 'https://www.instagram.com/pulsemoney.in';

const C = { bg: '#F6F5F2', card: '#FFFFFF', sunk: '#EDEBE6', line: '#E4E1DA', ink: '#17140F', ink2: '#57524A', ink3: '#746F67', accent: '#EC5B2B', soft: '#F5E1D8', pos: '#1F7A4D' };
const DISPLAY = "'Unbounded','Arial Black','Segoe UI',Arial,sans-serif";
const BODY = "'Onest',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const TYPES: Record<string, [string, string]> = {
  bug: ['🐞', 'Something broke'],
  idea: ['💡', 'Build this pls'],
  confusing: ['😵‍💫', "I'm confused"],
  love: ['❤️', 'Just vibes'],
};
export const WANTS: Record<string, string> = {
  widget: 'Home screen widget',
  upi: 'Auto-read UPI spends',
  reminders: 'Bill reminders',
  challenges: 'Savings challenges',
  friends: 'Compete with friends',
  hindi: 'Hindi and more languages',
};
export const VIBES: [string, string][] = [['💀', 'Nah'], ['😬', 'Mid'], ['😐', 'Okay'], ['😎', 'Solid'], ['🔥', 'Obsessed']];
export const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Mail {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------
const button = (label: string, href: string, kind: 'accent' | 'dark' | 'quiet' = 'accent') => {
  const bg = kind === 'accent' ? C.accent : kind === 'dark' ? C.ink : C.sunk;
  const fg = kind === 'dark' ? '#FFFFFF' : C.ink;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr><td style="border-radius:999px;background:${bg}">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${BODY};font-size:15px;font-weight:700;color:${fg};text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`;
};

const chip = (text: string, on = false) =>
  `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;font-family:${BODY};font-size:13px;font-weight:600;background:${on ? C.ink : C.sunk};color:${on ? '#FFFFFF' : C.ink2}">${text}</span>`;

/** The five vibes in a row, with the chosen one lit up. */
const vibeMeter = (rating: number | null) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed"><tr>${VIBES.map(([emoji, label], i) => {
    const on = rating === i + 1;
    return `<td align="center" style="padding:0 3px"><div style="border-radius:16px;padding:10px 2px 8px;border:2px solid ${on ? C.accent : C.line};background:${on ? C.soft : C.card}">
<div style="font-size:24px;line-height:1.1${on ? '' : ';opacity:.45'}">${emoji}</div>
<div style="font-family:${BODY};font-size:11px;font-weight:700;color:${on ? C.accent : C.ink3};margin-top:3px">${label}</div></div></td>`;
  }).join('')}</tr></table>`;

/** Page frame: dark PULSE header, a white card, a quiet footer. */
function shell(opts: { preheader: string; tag: string; body: string; footer: string }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<style>@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Onest:wght@400;600;700&display=swap');
@media (max-width:520px){.pad{padding:22px 18px !important}.h1{font-size:24px !important}}</style></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${opts.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:${C.ink};border-radius:24px 24px 0 0;padding:20px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${DISPLAY};font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF">PULSE<span style="color:${C.accent}">.</span></td>
    <td align="right" style="font-family:${BODY};font-size:12.5px;font-weight:600;color:#BDB8AE">${opts.tag}</td>
  </tr></table>
</td></tr>
<tr><td class="pad" style="background:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 24px 24px;padding:28px 26px">${opts.body}</td></tr>
<tr><td style="padding:18px 12px 0;font-family:${BODY};font-size:12px;line-height:1.6;color:${C.ink3};text-align:center">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const h1 = (t: string) => `<h1 class="h1" style="margin:0 0 10px;font-family:${DISPLAY};font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-0.6px;color:${C.ink}">${t}</h1>`;
const p = (t: string, color = C.ink2) => `<p style="margin:0 0 14px;font-family:${BODY};font-size:16px;line-height:1.55;color:${color}">${t}</p>`;
const label = (t: string) => `<p style="margin:22px 0 8px;font-family:${BODY};font-size:11.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.ink3}">${t}</p>`;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const deviceOf = (fb: Feedback) => `${{ ios: 'iPhone', android: 'Android', desktop: 'Computer' }[fb.meta.platform] ?? 'Device'} · ${fb.meta.installed ? 'installed app' : 'browser'}`;

// ---------------------------------------------------------------------------------------------
// 1. To the person who builds PULSE
// ---------------------------------------------------------------------------------------------
export function ownerEmail(fb: Feedback): Mail {
  const [emoji, name] = TYPES[fb.type];
  const time = when(fb.at);
  const wants = fb.wants.map((w) => WANTS[w]);
  const isEmail = EMAIL.test(fb.contact);
  const handle = !isEmail && /^@?[A-Za-z0-9._]{2,30}$/.test(fb.contact) ? fb.contact.replace(/^@/, '') : '';
  const replySubject = encodeURIComponent(`Re: your PULSE feedback (#${fb.ref})`);

  const actions =
    (isEmail ? button('Reply to them ↩', `mailto:${encodeURIComponent(fb.contact).replace(/%40/g, '@')}?subject=${replySubject}`) : '') +
    (handle ? button(`Open @${esc(handle)} on Instagram`, `https://www.instagram.com/${encodeURIComponent(handle)}`) : '') +
    button('See all feedback', `${SITE}/stats/feedback/`, isEmail || handle ? 'quiet' : 'accent');

  const body =
    `<p style="margin:0 0 8px;font-family:${BODY};font-size:13px;color:${C.ink3}">#${esc(fb.ref)} · ${esc(time)}</p>` +
    h1(`${emoji} ${esc(name)}`) +
    (fb.message
      ? `<div style="margin:16px 0 4px;background:${C.bg};border-left:4px solid ${C.accent};border-radius:6px 16px 16px 6px;padding:16px 18px;font-family:${BODY};font-size:17px;line-height:1.5;color:${C.ink};white-space:pre-wrap">${esc(fb.message)}</div>`
      : p('No message this time, just taps.', C.ink3)) +
    label('Their vibe') +
    (fb.rating ? vibeMeter(fb.rating) : p('Not given', C.ink3)) +
    (wants.length ? label('Wants next') + `<div>${wants.map((w) => chip(esc(w), true)).join('')}</div>` : '') +
    label('From') +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${BODY};font-size:14.5px;color:${C.ink}">
<tr><td style="padding:3px 16px 3px 0;color:${C.ink3}">Contact</td><td style="padding:3px 0"><b>${fb.contact ? esc(fb.contact) : 'Not given'}</b></td></tr>
<tr><td style="padding:3px 16px 3px 0;color:${C.ink3}">Device</td><td style="padding:3px 0">${esc(deviceOf(fb))}</td></tr>
<tr><td style="padding:3px 16px 3px 0;color:${C.ink3}">Version</td><td style="padding:3px 0">${esc(fb.meta.ver.replace('T', ' ')) || 'Unknown'}</td></tr></table>` +
    `<div style="margin-top:24px">${actions}</div>`;

  const text = [
    `${emoji} ${name}  (#${fb.ref}, ${time})`,
    '',
    fb.message || '(no message, just taps)',
    '',
    `Vibe: ${fb.rating ? `${VIBES[fb.rating - 1].join(' ')} (${fb.rating}/5)` : 'Not given'}`,
    wants.length ? `Wants next: ${wants.join(', ')}` : '',
    `Contact: ${fb.contact || 'Not given'}`,
    `Device: ${deviceOf(fb)}`,
    `All feedback: ${SITE}/stats/feedback/`,
  ].filter((l, i) => l !== '' || i === 1 || i === 3).join('\n');

  return {
    // The reference and time keep every subject different, so Gmail never folds two messages together.
    subject: `PULSE feedback #${fb.ref} · ${emoji} ${name}${fb.rating ? ` · ${fb.rating}/5` : ''} · ${time}`,
    html: shell({
      preheader: esc((fb.message || `${name}${wants.length ? `, wants ${wants.join(', ')}` : ''}`).slice(0, 110)),
      tag: 'New feedback',
      body,
      footer: `Sent by your PULSE feedback form.${isEmail ? ' Hitting Reply also goes straight to this person.' : ''}`,
    }),
    text,
    replyTo: isEmail ? fb.contact : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// 2. To the user who left their email: "it landed"
// ---------------------------------------------------------------------------------------------
const THANKS: Record<string, { subject: string; emoji: string; title: string; line: string }> = {
  bug: { subject: 'bug spotted. we’re on it 🛠️', emoji: '🛠️', title: 'Bug spotted. We’re on it.', line: 'That thing that broke? It’s now sitting in front of the person who fixes things. If it broke for you, it’s probably breaking for others too, so you just did everyone a solid.' },
  idea: { subject: 'ok that idea kinda slaps 💡', emoji: '💡', title: 'Okay, that idea kinda slaps.', line: 'It’s gone straight to the person who decides what gets built. No promises on dates, but the best stuff in PULSE started exactly like this: someone typing what they wished it did.' },
  confusing: { subject: 'if it confused you, that’s on us 🫠', emoji: '🫠', title: 'If it confused you, that’s on us.', line: 'Not a you problem. An us problem. We’ll go make that part make sense. Thanks for saying it instead of quietly closing the app.' },
  love: { subject: 'you just made our whole week 🧡', emoji: '🧡', title: 'You just made our whole week.', line: 'Fr. Messages like yours are why PULSE exists. We’ll keep making it better.' },
};

export function thanksEmail(fb: Feedback): Mail {
  const t = THANKS[fb.type] ?? THANKS.idea;
  const wants = fb.wants.map((w) => WANTS[w]);
  const low = fb.rating !== null && fb.rating <= 2;
  const shareText = encodeURIComponent(`This app tells you how much you can spend till payday. Free, no bank login 👉 ${SITE}`);

  const steps = [
    ['📥', 'It’s in the builder’s inbox', 'Landed the second you hit send.'],
    ['👀', 'A real human reads it', wants.length ? 'Every message, and every vote. No bots deciding what matters.' : 'Every message. No bots deciding what matters.'],
    ['🚀', 'If it ships, it just shows up', 'PULSE updates itself. Nothing to download.'],
  ];

  const body =
    `<div style="font-size:44px;line-height:1;margin:0 0 14px">${t.emoji}</div>` +
    h1(t.title) +
    p('Heyy 👋 your message landed. Yes, this email is automatic (we’re fast like that), but a real human reads every single message.') +
    p(t.line) +
    (low ? p('Also: sorry PULSE wasn’t it for you this time. We’d rather hear “mid” than hear nothing. 🤝') : '') +
    (fb.rating ? label('Your vibe') + vibeMeter(fb.rating) : '') +
    (wants.length ? label('You voted for') + `<div>${wants.map((w) => chip(`✓ ${esc(w)}`, true)).join('')}</div>` + `<p style="margin:6px 0 0;font-family:${BODY};font-size:13px;color:${C.ink3}">Every vote is counted.</p>` : '') +
    label('What happens now') +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${steps
      .map(
        ([e, a, b]) =>
          `<tr><td width="44" valign="top" style="padding:0 0 12px"><div style="width:36px;height:36px;line-height:36px;text-align:center;font-size:18px;background:${C.sunk};border-radius:12px">${e}</div></td>
<td valign="top" style="padding:0 0 12px;font-family:${BODY}"><div style="font-size:15px;font-weight:700;color:${C.ink}">${a}</div><div style="font-size:13.5px;color:${C.ink3}">${b}</div></td></tr>`,
      )
      .join('')}</table>` +
    `<div style="margin-top:18px">${button('Open PULSE', `${SITE}/?source=thanks`)}${button('Send PULSE to your broke friend 💸', `https://wa.me/?text=${shareText}`, 'dark')}${button('Follow @pulsemoney.in', INSTAGRAM, 'quiet')}</div>` +
    `<p style="margin:18px 0 0;font-family:${BODY};font-size:14.5px;line-height:1.5;color:${C.ink2}">Got more to say? Just hit reply. It goes to a human, not a void.</p>` +
    `<p style="margin:14px 0 0;font-family:${BODY};font-size:15px;font-weight:700;color:${C.ink}">Team PULSE 🧡</p>`;

  const text = [
    t.title,
    '',
    'Heyy, your message landed. Yes, this email is automatic (we’re fast like that), but a real human reads every single message.',
    t.line,
    wants.length ? `\nYou voted for: ${wants.join(', ')}. Every vote is counted.` : '',
    '',
    'What happens now:',
    ...steps.map(([, a, b]) => `- ${a}. ${b}`),
    '',
    `Open PULSE: ${SITE}`,
    `Follow us: ${INSTAGRAM}`,
    '',
    'Got more to say? Just hit reply.',
    'Team PULSE',
    '',
    `You got this because someone sent feedback from PULSE with this email address (ref #${fb.ref}). Not you? Ignore it, you won't hear from us again.`,
  ].join('\n');

  return {
    subject: `${t.subject}`,
    html: shell({
      preheader: 'Your feedback landed. Here’s what happens now.',
      tag: 'Feedback received ✓',
      body,
      footer: `You got this because someone sent feedback from PULSE with this email address (ref #${esc(fb.ref)}).<br>Not you? Ignore this, you won’t hear from us again. · <a href="${SITE}" style="color:${C.ink3}">pulsemoney.in</a>`,
    }),
    text,
  };
}
