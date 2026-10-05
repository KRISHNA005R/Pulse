import { siInstagram, siSnapchat, siTelegram, siWhatsapp, siX } from 'simple-icons';

// The real marks of the apps people share to, from the Simple Icons set (simpleicons.org). Each
// mark belongs to its company; it is used here only to point at that company's own app.
const MARKS = { whatsapp: siWhatsapp, instagram: siInstagram, snapchat: siSnapchat, telegram: siTelegram, x: siX };
export type Brand = keyof typeof MARKS;

/** The company's own colour, for the tile behind its mark. */
export const brandColor = (name: Brand) => `#${MARKS[name].hex}`;

export function BrandIcon({ name, size = 22, className }: { name: Brand; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d={MARKS[name].path} />
    </svg>
  );
}
