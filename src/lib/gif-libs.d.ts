// The two small libraries behind GIF profile photos ship without types.
declare module 'gifuct-js' {
  export interface GifFrame {
    image?: unknown;
    gce?: { delay?: number };
  }
  export interface ParsedGif {
    lsd?: { width: number; height: number };
    gct: unknown;
    frames?: GifFrame[];
  }
  export interface FramePatch {
    dims: { top: number; left: number; width: number; height: number };
    patch: Uint8ClampedArray;
    delay?: number;
    disposalType?: number;
  }
  export function parseGIF(buffer: ArrayBuffer): ParsedGif;
  export function decompressFrame(frame: GifFrame, gct: unknown, buildImagePatch: boolean): FramePatch | undefined;
}
declare module 'gifenc' {
  export type Palette = number[][];
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: Palette; delay?: number; transparent?: boolean; transparentIndex?: number; dispose?: number; repeat?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' }): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array;
}
