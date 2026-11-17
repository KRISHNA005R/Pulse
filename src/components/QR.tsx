import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** A QR code as crisp SVG squares, in the page's ink colour. */
export function QR({ text, size = 176, label = 'QR code with your sync link' }: { text: string; size?: number; label?: string }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`} width={size} height={size} role="img" aria-label={label} className="rounded-xl bg-white p-1" shapeRendering="crispEdges">
      <path d={cells.d} fill="#17140F" />
    </svg>
  );
}
