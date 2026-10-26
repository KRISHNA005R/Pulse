// The walking buddy on Home (beta): a character on the payday line. He walks from the left (just
// after payday) to the right (payday), and his pose changes with the stage of the month. Always calm
// or happy, never stressed: the pose follows the days, never how much money is left.

export type Pose = 'fresh' | 'easy' | 'phone' | 'focus' | 'almost' | 'payday';

/**
 * @param since    days since the last payday (0 = payday is today)
 * @param left     days until the next payday
 * @param progress how far along the pay cycle the line is (0 to 1)
 */
export function walker(since: number, left: number, progress: number): { pose: Pose; at: number } {
  if (since === 0) return { pose: 'payday', at: 1 };
  const at = Math.min(1, Math.max(0, progress));
  const pose: Pose = left <= 2 ? 'almost' : left <= 7 ? 'focus' : since <= 3 ? 'fresh' : at >= 0.4 ? 'phone' : 'easy';
  return { pose, at };
}

/** The picture for each pose (public/illustrations/walker-*.webp). */
export const WALKER_ART: Record<Pose, string> = {
  fresh: '/illustrations/walker-fresh.webp',
  easy: '/illustrations/walker-easy.webp',
  phone: '/illustrations/walker-phone.webp',
  focus: '/illustrations/walker-focus.webp',
  almost: '/illustrations/walker-almost.webp',
  payday: '/illustrations/walker-payday.webp',
};
