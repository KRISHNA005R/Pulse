// The PULSE submark: P. on an ink tile. Same geometry as the app icon (logos/tile.svg).
export function Submark({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="153.6" fill="#17140F" />
      <g transform="translate(76.36 375.27) scale(0.32286 -0.32286)">
        <path fill="#FFFBF4" d="M494 750Q592 750 662 717Q733 684 770 625Q807 565 807 484Q807 404 770 344Q733 284 662 251Q592 218 494 218H173V402H479Q523 402 548 424Q572 446 572 484Q572 524 548 545Q523 566 479 566H193L298 672V0H65V750Z" />
        <path fill="#EC5B2B" transform="translate(765 0)" d="M157 -11Q122 -11 93 5Q64 22 48 51Q31 80 31 115Q31 151 48 179Q64 208 93 224Q122 241 157 241Q193 241 221 224Q250 208 266 179Q283 151 283 115Q283 80 266 51Q250 22 221 5Q193 -11 157 -11Z" />
      </g>
    </svg>
  );
}
