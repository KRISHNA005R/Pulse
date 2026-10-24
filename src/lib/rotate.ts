// Fresh suggestions without anything random: the date decides which one shows.
//   Home: a different suggestion every day (urgent ones always first).
//   PULSE AI: the suggested questions take a new order every 2 days.
// Everything stays on the phone and comes from the person's own data.
import type { Insight } from '../types';

/** Days since 1 Jan 1970 for a YYYY-MM-DD date: the same all day, +1 at midnight. */
export const dayIndex = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 864e5);

const turn = <T>(list: T[], by: number): T[] => {
  const n = list.length;
  if (!n) return [];
  const k = ((by % n) + n) % n;
  return [...list.slice(k), ...list.slice(0, k)];
};

/** Today's suggestion for Home: an urgent one if there is one, otherwise the next one in turn. */
export function pickDaily(list: Insight[], today: string): Insight | undefined {
  if (!list.length) return undefined;
  const urgent = list.filter((i) => i.urgent).sort((a, b) => b.priority - a.priority);
  if (urgent.length) return urgent[0];
  // A fixed order (most important first), so the turn doesn't depend on how the list was built.
  const ordered = [...list].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return ordered[dayIndex(today) % ordered.length];
}

/** The same list, starting from a new place every 2 days. */
export function everyOtherDay<T>(list: T[], today: string): T[] {
  return turn(list, Math.floor(dayIndex(today) / 2));
}
