// Google Analytics on PULSE's public pages only (welcome, about, privacy, terms, founder). Never in
// the app itself, where people see their money.
//
// It counts visits, where people come from, and taps on "Open PULSE". Ad cookies (so PULSE's ads can
// be measured and shown again to past visitors) are only used after someone taps OK on the small
// cookie note. In Europe, the UK and Switzerland nothing is stored at all until they tap OK.
// The choice is remembered on this device ("pulse-cookies": "yes" or "no").
(function () {
  var ID = 'G-5KQNRVH81T';
  var KEY = 'pulse-cookies';
  var EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH'];
  var w = window;
  var d = document;
  w.dataLayer = w.dataLayer || [];
  function gtag() {
    w.dataLayer.push(arguments);
  }
  w.gtag = gtag;

  var choice = null;
  try {
    choice = localStorage.getItem(KEY);
  } catch (e) {
    /* private mode: ask every time */
  }
  var NO = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
  var ALL = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };
  // Before anyone chooses: Europe nothing; elsewhere visits are counted, ads stay off.
  gtag('consent', 'default', Object.assign({ region: EU, wait_for_update: 500 }, NO));
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  if (choice === 'yes') gtag('consent', 'update', ALL);
  if (choice === 'no') gtag('consent', 'update', NO);
  gtag('js', new Date());
  gtag('config', ID);

  var s = d.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  d.head.appendChild(s);

  // "Open PULSE" (any link into the app): counted, so ads can be judged by who actually opens it.
  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var u;
    try {
      u = new URL(a.getAttribute('href'), location.href);
    } catch (err) {
      return;
    }
    if (u.origin === location.origin && (u.pathname === '/' || u.pathname === '/index.html')) {
      gtag('event', 'open_app', { link_text: (a.textContent || '').trim().slice(0, 40), page_path: location.pathname });
    }
  });

  if (choice === 'yes' || choice === 'no') return;

  // The cookie note: one line, OK or No thanks.
  function ask() {
    var box = d.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookies');
    box.setAttribute('data-testid', 'cookie-note');
    box.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:520px;margin:0 auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
      'padding:12px 14px;border-radius:18px;background:#17140F;color:#FFFBF4;box-shadow:0 10px 30px rgba(0,0,0,.25);font:500 14px/1.4 Inter,system-ui,sans-serif';
    var p = d.createElement('p');
    p.style.cssText = 'margin:0;flex:1 1 260px';
    p.textContent = 'We use cookies to count visits and measure our ads. ';
    var more = d.createElement('a');
    more.href = '/privacy/#cookies';
    more.textContent = 'Privacy';
    more.style.cssText = 'color:#FFFBF4;opacity:.7;text-decoration:underline';
    p.appendChild(more);
    function btn(label, primary, pick) {
      var b = d.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'min-height:40px;padding:0 16px;border-radius:999px;border:0;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;' +
        (primary ? 'background:#EC5B2B;color:#17140F;padding:0 22px' : 'background:transparent;color:#FFFBF4;opacity:.8');
      b.addEventListener('click', function () {
        try {
          localStorage.setItem(KEY, pick);
        } catch (e) {
          /* remembered for this visit only */
        }
        gtag('consent', 'update', pick === 'yes' ? ALL : NO);
        box.remove();
      });
      return b;
    }
    // Text on top, the two buttons together on the right (side by side on wide screens).
    var row = d.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-left:auto';
    row.appendChild(btn('No thanks', false, 'no'));
    row.appendChild(btn('OK', true, 'yes'));
    box.appendChild(p);
    box.appendChild(row);
    d.body.appendChild(box);
  }
  if (d.body) ask();
  else d.addEventListener('DOMContentLoaded', ask);
})();
