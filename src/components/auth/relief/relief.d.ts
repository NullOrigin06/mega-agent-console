export interface ReliefOptions {
  scene?: number;
  side?: number;
  zoom?: number;
  center?: [number, number];
  plaster?: string;
  tint?: string;
  grid?: [number, number];
  restDepth?: number;
  falloff?: number;
  /** Trail fade per frame at 60 Hz; closer to 1 lingers longer. */
  dissipation?: number;
  /** 0 keeps the sheen in the tint colour; higher mixes in a hue shift. */
  rainbow?: number;
  fluid?: boolean;
  idleSweep?: boolean;
  scrollFactor?: number;
  tilt?: number;
  onState?: (state: { paused: boolean; available: boolean }) => void;
}

export interface Relief {
  isPaused(): boolean;
  setPaused(paused: boolean): void;
  destroy(): void;
}

/** Returns null when WebGL2 is not available. */
export function createRelief(canvas: HTMLCanvasElement, opts?: ReliefOptions): Relief | null;
