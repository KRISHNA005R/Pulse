import { describe, expect, it } from 'vitest';
import { canon, ideas, nameStem, problem } from '../netlify/lib/username';

describe('one form for every username', () => {
  it('capitals and an @ don’t matter', () => {
    expect(canon('@Krishna.Kharcha')).toBe('krishna.kharcha');
  });
  it('look-alike letters become the Latin ones, so nobody can pose as someone else', () => {
    expect(canon('krishnа')).toBe('krishna'); // Cyrillic а
    expect(canon('ｋrishna')).toBe('krishna'); // full-width ｋ
    expect(canon('kriѕhnа')).toBe('krishna');
  });
});

describe('rules', () => {
  it('good ones pass', () => {
    for (const u of ['krishna.kharcha', 'chai.krishna', 'riya_2026', 'abc']) expect(problem(u), u).toBe('');
  });
  it('bad ones say why, in a few words', () => {
    expect(problem('ab')).toMatch(/3/);
    expect(problem('a'.repeat(21))).toMatch(/20/);
    expect(problem('krish na')).toMatch(/Only/);
    expect(problem('.krishna')).toMatch(/Start and end/);
    expect(problem('krishna.')).toMatch(/Start and end/);
    expect(problem('kri..shna')).toMatch(/two dots/);
    expect(problem('12345')).toMatch(/letter/);
    expect(problem('PULSE')).toMatch(/taken/);
    expect(problem('pul.se')).toMatch(/taken/);
  });
});

describe('ideas from your name', () => {
  it('made from the first name, with a fun word, all valid and different', () => {
    const xs = ideas('Krishna Rao', 'u1');
    expect(xs.length).toBe(12);
    expect(new Set(xs).size).toBe(12);
    for (const u of xs) {
      expect(problem(u), u).toBe('');
      expect(u).toContain('krishna');
    }
  });
  it('the same person gets the same ideas; someone else gets others', () => {
    expect(ideas('Krishna', 'u1')).toEqual(ideas('Krishna', 'u1'));
    expect(ideas('Krishna', 'u1')).not.toEqual(ideas('Krishna', 'u2'));
  });
  it('accents and odd names still work', () => {
    expect(nameStem('Zoë Fernandes')).toBe('zoe');
    expect(nameStem('')).toBe('pulse');
    expect(ideas('🙂', 'x')[0]).toContain('pulse');
  });
});
