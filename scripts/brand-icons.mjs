// Puts the real Instagram and LinkedIn marks into the founder page (a plain HTML file, so the
// icons are written into it rather than imported). Run after changing that page's links:
//   node scripts/brand-icons.mjs
// Instagram comes from Simple Icons, LinkedIn from Font Awesome Free (CC BY 4.0). Each mark belongs
// to its company and is used only to point at that company's own site.
import fs from 'node:fs';
import { siInstagram } from 'simple-icons';
import { faLinkedinIn } from '@fortawesome/free-brands-svg-icons';

const file = new URL('../public/founder/index.html', import.meta.url);
let html = fs.readFileSync(file, 'utf8');
const [w, h, , , d] = faLinkedinIn.icon;
const svg = (viewBox, path) => `<i aria-hidden="true"><svg viewBox="${viewBox}" width="22" height="22" fill="currentColor" focusable="false"><path d="${path}"/></svg></i>`;
const marks = { instagram: svg('0 0 24 24', siInstagram.path), linkedin: svg(`0 0 ${w} ${h}`, Array.isArray(d) ? d.join(' ') : d) };

let n = 0;
html = html.replace(/(<a class="link" href="https:\/\/www\.(instagram|linkedin)\.com\/[^"]*"[^>]*>\s*)<i aria-hidden="true">[\s\S]*?<\/i>/g, (_, open, brand) => {
  n++;
  return open + marks[brand];
});
fs.writeFileSync(file, html);
console.log(`founder page: ${n} marks written`);
