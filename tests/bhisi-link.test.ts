import { describe, expect, it } from 'vitest';
import { bhisiLink, bidOf, newBhisiShare, parseBhisiLink } from '../src/lib/bhisiShare';
import { sha256 } from '../src/lib/sha256';

// The bhisi invite link: short, and the key still never reaches the server (it stays after the #).

describe('sha256 (no waiting, so a new bhisi gets its id straight away)', () => {
  it('matches the browser’s own SHA-256', async () => {
    for (const s of ['', 'abc', 'pulse-bhisi:x'.repeat(40), '₹ हिंदी 🏺']) {
      const bytes = new TextEncoder().encode(s);
      const want = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(sha256(bytes)).toBe(want);
    }
  });
});

describe('invite link', () => {
  it('a new bhisi’s link is short: the address plus 22 characters', () => {
    const sh = newBhisiShare(true);
    const url = bhisiLink('https://pulsemoney.in', { name: 'Crasks ki bhisi', share: sh });
    expect(url).toMatch(/^https:\/\/pulsemoney\.in\/#b=[A-Za-z0-9_-]{22}$/);
    expect(url.length).toBeLessThan(50);
    // The id the server knows comes from the key one way only.
    expect(sh.bid).toBe(bidOf(sh.key));
    expect(url).not.toContain(sh.bid);
    expect(parseBhisiLink(url)).toEqual({ bid: sh.bid, key: sh.key, name: '' });
  });

  it('a bhisi made before keeps working, with a shorter link too', () => {
    const old = { bid: '82d6117d88aea4efb2fe087a511b6519', key: 'TJ5BwBSSAJSKg80iKeNBxfcAQlqUHcmAsQraKtLosPo', mid: '0'.repeat(16), token: 't'.repeat(32), owner: true, seats: {} };
    const url = bhisiLink('https://pulsemoney.in', { name: 'Crasks ki bhisi', share: old });
    expect(url).toMatch(/^https:\/\/pulsemoney\.in\/#b=[A-Za-z0-9_-]{65}$/);
    expect(parseBhisiLink(url)).toEqual({ bid: old.bid, key: old.key, name: '' });
  });

  it('links already sent in chats still open', () => {
    const sent = 'Join my bhisi https://pulsemoney.in/#bhisi=82d6117d88aea4efb2fe087a511b6519.TJ5BwBSSAJSKg80iKeNBxfcAQlqUHcmAsQraKtLosPo.Q3Jhc2tzIGtpIGJoaXNp';
    expect(parseBhisiLink(sent)).toEqual({ bid: '82d6117d88aea4efb2fe087a511b6519', key: 'TJ5BwBSSAJSKg80iKeNBxfcAQlqUHcmAsQraKtLosPo', name: 'Crasks ki bhisi' });
  });

  it('a pasted message with the link in it works; junk does not', () => {
    const sh = newBhisiShare(true);
    const msg = `Join my bhisi "X" on PULSE 🏺 ₹1,000 a month: ${bhisiLink('https://pulsemoney.in', { name: 'X', share: sh })} see you`;
    expect(parseBhisiLink(msg)?.bid).toBe(sh.bid);
    expect(parseBhisiLink('https://pulsemoney.in/#b=short')).toBeNull();
    expect(parseBhisiLink('hello')).toBeNull();
  });
});
