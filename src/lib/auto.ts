// Entries PULSE records by itself on a date: SIP debits (sip-), paydays (pay-), insurance premiums
// (ins-), loan EMIs (emi-) and bills or subscriptions (due-). Their ids are built from what they
// are and the date, so every synced device makes the same id and the entry is never duplicated.
export const AUTO_ID = /^(sip|pay|ins|emi|due)-/;

/** Recorded by PULSE, not something the person logged. */
export const isAuto = (t: { id: string }) => AUTO_ID.test(t.id);
