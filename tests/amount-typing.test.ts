import { afterEach, describe, expect, it } from 'vitest';
import { setCurrency } from '../src/lib/currency';
import { caretAfterDigits, groupTyped } from '../src/lib/currency';

// Amount boxes group digits while you type (₹25000 → 25,000; Indian lakhs: 1,00,000), and the
// caret stays next to the digit you just typed.

afterEach(() => setCurrency('INR'));

describe('grouping what is typed', () => {
  it('Indian grouping for rupees', () => {
    expect(groupTyped('25000')).toBe('25,000');
    expect(groupTyped('100000')).toBe('1,00,000');
    expect(groupTyped('12345678')).toBe('1,23,45,678');
    expect(groupTyped('999')).toBe('999');
    expect(groupTyped('')).toBe('');
  });

  it('decimals are left as typed, including a trailing dot', () => {
    expect(groupTyped('25000.')).toBe('25,000.');
    expect(groupTyped('25000.5')).toBe('25,000.5');
    expect(groupTyped('1234.56')).toBe('1,234.56');
    expect(groupTyped('0.75')).toBe('0.75');
  });

  it('other currencies group in threes', () => {
    setCurrency('USD');
    expect(groupTyped('1000000')).toBe('1,000,000');
  });
});

describe('the caret after grouping', () => {
  it('stays after the same digit', () => {
    // Typed "2500|0" → shown "25,00|0": 4 digits before the caret → position 5.
    expect(caretAfterDigits('25,000', 4)).toBe(5);
    expect(caretAfterDigits('1,00,000', 1)).toBe(1);
    expect(caretAfterDigits('1,00,000', 6)).toBe(8);
    expect(caretAfterDigits('25,000.5', 7)).toBe(8); // the dot counts as a typed character
    expect(caretAfterDigits('', 0)).toBe(0);
  });
});
