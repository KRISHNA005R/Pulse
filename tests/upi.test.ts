import { describe, expect, it } from 'vitest';
import { cleanVpa, okVpa, upiAppLink, upiLink } from '../src/lib/upi';

const pay = { vpa: 'rahul.k@okaxis', name: 'Rahul Mehta', amount: 620 };

describe('UPI pay links', () => {
  it('checks UPI IDs', () => {
    expect(okVpa('rahul.k@okaxis')).toBe(true);
    expect(okVpa('9876543210@ybl')).toBe(true);
    expect(okVpa('rahul')).toBe(false);
    expect(okVpa('rahul@')).toBe(false);
    expect(cleanVpa(' Rahul.K@OkAxis ')).toBe('rahul.k@okaxis');
  });

  it('fills in the amount with two decimals and keeps the @', () => {
    expect(upiLink(pay)).toBe('upi://pay?pa=rahul.k@okaxis&pn=Rahul%20Mehta&am=620.00&cu=INR&tn=Settle%20up%20via%20PULSE');
  });

  it('opens one exact app on Android and iPhone', () => {
    expect(upiAppLink('gpay', pay, 'android')).toMatch(/^intent:\/\/pay\?pa=rahul\.k@okaxis&.*am=620\.00.*#Intent;scheme=upi;package=com\.google\.android\.apps\.nbu\.paisa\.user;end$/);
    expect(upiAppLink('phonepe', pay, 'ios')).toMatch(/^phonepe:\/\/pay\?pa=rahul\.k@okaxis&.*am=620\.00/);
    expect(upiAppLink('paytm', pay, 'ios')).toMatch(/^paytmmp:\/\/upi\/pay\?/);
    expect(upiAppLink('gpay', pay, 'ios')).toMatch(/^tez:\/\/upi\/pay\?/);
  });
});
