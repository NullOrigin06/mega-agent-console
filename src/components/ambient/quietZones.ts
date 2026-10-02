/**
 * DOM measurement for the ambient engine: the canvas rect (sidebar edge to
 * viewport right, ambient top to bottom), the hero "stage" beside the page
 * header, the content column, and the quiet cores - the text that sits
 * directly on the background, which the engine renders as exact base.
 *
 * Quiet cores are line boxes (Range.getClientRects) for running text and
 * block rects for headings and controls, inflated QUIET_INFLATE and merged
 * down to at most QUIET_MAX. They're stored in doc px, so the engine follows
 * scroll with one uniform and no layout reads.
 */
import type { AmbientLayout, Rect } from "../../ambient/types";

const QUIET_MAX = 12;
const QUIET_INFLATE = { x: 16, y: 12 };
/** Headings (the gradient title) and controls get one block rect, not line boxes. */
const BLOCK_SELECTOR = "h1, h2, button, a, input, select, textarea, svg, img, .segmented-control, .search-box";
const CONTROL_SELECTOR = "button, a, input, select, textarea, svg, img";
/** Routes with no registered core get this much of the canvas suppressed (spec "fallback guard"). */
const GUARD = { h: 140, wFrac: 0.6 };

function toRect(r: DOMRect): Rect {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function inflate(r: Rect): Rect {
  return { x: r.x - QUIET_INFLATE.x, y: r.y - QUIET_INFLATE.y, w: r.w + 2 * QUIET_INFLATE.x, h: r.h + 2 * QUIET_INFLATE.y };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Union overlapping rects, then merge the cheapest pairs until at most `max` remain. */
export function mergeRects(input: Rect[], max = QUIET_MAX): Rect[] {
  const rects = input.slice();
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i], rects[j])) {
        rects[i] = union(rects[i], rects[j]);
        rects.splice(j, 1);
        j = i; // restart the scan for the grown rect
      }
    }
  }
  while (rects.length > max) {
    let best = [0, 1];
    let bestCost = Infinity;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const u = union(rects[i], rects[j]);
        const cost = u.w * u.h - rects[i].w * rects[i].h - rects[j].w * rects[j].h;
        if (cost < bestCost) {
          bestCost = cost;
          best = [i, j];
        }
      }
    }
    rects[best[0]] = union(rects[best[0]], rects[best[1]]);
    rects.splice(best[1], 1);
  }
  return rects;
}

/**
 * Viewport-px line boxes of the visible text inside one element. Elements
 * matching `blocks` contribute one bounding rect instead (or nothing, when
 * `includeBlocks` is false).
 */
function textBoxes(el: Element, blocks: string, includeBlocks: boolean): Rect[] {
  const out: Rect[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      const elem = node as Element;
      if (elem.getAttribute("aria-hidden") === "true") return NodeFilter.FILTER_REJECT;
      if (elem !== el && elem.matches(blocks)) {
        if (includeBlocks) out.push(toRect(elem.getBoundingClientRect()));
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n);
    // Range geometry is missing in some non-browser DOMs (jsdom).
    const rects = typeof range.getClientRects === "function" ? range.getClientRects() : [];
    for (const r of rects) out.push(toRect(r));
  }
  return out.filter((r) => r.w > 0 && r.h > 0);
}

function rectOf(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0 ? toRect(r) : null;
}

export interface MeasuredLayout {
  layout: AmbientLayout;
  /** No quiet element was found; the fallback guard rect was used instead. */
  guarded: boolean;
}

/** Measure everything the engine needs. `root` is the fixed .ambient-root (its top = --ambient-top). */
export function measureAmbientLayout(root: HTMLElement): MeasuredLayout {
  const scrollY = window.scrollY;
  const viewportW = document.documentElement.clientWidth || window.innerWidth;
  const viewportH = window.innerHeight;
  const rootRect = root.getBoundingClientRect();

  // Desktop sidebar is sticky in-flow; below 900 px it's a fixed off-canvas drawer.
  const sidebar = document.querySelector(".sidebar");
  const sidebarRight = sidebar && getComputedStyle(sidebar).position !== "fixed" ? Math.max(0, sidebar.getBoundingClientRect().right) : 0;
  const canvas: Rect = { x: sidebarRight, y: rootRect.top, w: Math.max(0, viewportW - sidebarRight), h: rootRect.height };

  /** Viewport px (now) -> canvas px at scroll 0. */
  const toCanvas = (r: Rect): Rect => ({ x: r.x - canvas.x, y: r.y + scrollY - canvas.y, w: r.w, h: r.h });

  let columnVp = rectOf(document.querySelector("[data-ambient-column]"));
  if (!columnVp) {
    const main = document.querySelector(".main-content");
    const r = rectOf(main);
    if (main && r) {
      const cs = getComputedStyle(main);
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      columnVp = { x: r.x + pl, y: r.y, w: r.w - pl - pr, h: r.h };
    }
  }
  const column = columnVp ? toCanvas(columnVp) : null;

  let stage: Rect | null = null;
  const header = document.querySelector("[data-ambient-header]");
  if (header && column) {
    const text = textBoxes(header, CONTROL_SELECTOR, false);
    const textRight = text.length ? Math.max(...text.map((r) => r.x + r.w)) - canvas.x : column.x;
    // The stage ends at the first header control right of the text (e.g. "+ New Generation Job").
    let controlLeft = Infinity;
    header.querySelectorAll("button, a, input, select").forEach((c) => {
      const left = c.getBoundingClientRect().left - canvas.x;
      if (left > textRight) controlLeft = Math.min(controlLeft, left);
    });
    const next = rectOf(header.nextElementSibling);
    const left = Math.max(textRight + 40, column.x + 0.5 * column.w);
    const right = Math.min(canvas.w - 12, controlLeft - 16);
    const bottom = next ? toCanvas(next).y - 12 : toCanvas(rectOf(header) ?? column).y + 160;
    if (right - left > 0 && bottom > 0) stage = { x: left, y: 0, w: right - left, h: bottom };
  }

  const boxes: Rect[] = [];
  document.querySelectorAll("[data-ambient-quiet]").forEach((el) => {
    for (const r of textBoxes(el, BLOCK_SELECTOR, true)) boxes.push(inflate(r));
  });
  const guarded = boxes.length === 0;
  const quietVp = guarded ? [{ x: canvas.x, y: canvas.y - scrollY, w: canvas.w * GUARD.wFrac, h: GUARD.h }] : mergeRects(boxes);
  const quiet = quietVp.map((r) => ({ x: r.x, y: r.y + scrollY, w: r.w, h: r.h }));

  let coarsePointer = false;
  try {
    coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  } catch {
    // Older engines without matchMedia - treat as a fine pointer.
  }

  return {
    layout: {
      viewportW,
      viewportH,
      canvas,
      stage,
      column,
      quiet,
      devicePixelRatio: window.devicePixelRatio || 1,
      narrow: canvas.w < 900,
      coarsePointer,
    },
    guarded,
  };
}

export interface AmbientLayoutTracker {
  /** Call after a route commit: re-measures next frame, then checks the fallback guard at 500 ms. */
  routeChanged(routeKey: string): void;
  dispose(): void;
}

/**
 * Re-measures the layout whenever the chrome, sidebar or main content
 * resizes or mutates (and after each route commit), coalesced to one
 * measurement per frame. Calls `onLayout` only when something changed.
 */
export function trackAmbientLayout(root: HTMLElement, onLayout: (layout: AmbientLayout) => void): AmbientLayoutTracker {
  let raf = 0;
  let last = "";
  let guardTimer = 0;
  const measure = () => {
    raf = 0;
    const { layout } = measureAmbientLayout(root);
    const key = JSON.stringify(layout);
    if (key === last) return;
    last = key;
    onLayout(layout);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(measure);
  };

  const ro = new ResizeObserver(schedule);
  for (const sel of [".sidebar", ".main-content", ".console-header", ".pipeline-rail"]) {
    const el = document.querySelector(sel);
    if (el) ro.observe(el);
  }
  ro.observe(root);
  const mo = new MutationObserver(schedule);
  const main = document.querySelector(".main-content");
  if (main) mo.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", schedule, { passive: true });
  document.fonts?.ready.then(schedule).catch(() => {});
  schedule();

  return {
    routeChanged(routeKey) {
      schedule();
      window.clearTimeout(guardTimer);
      guardTimer = window.setTimeout(() => {
        schedule();
        if (import.meta.env.DEV && measureAmbientLayout(root).guarded) {
          console.warn(`[ambient] route "${routeKey}" registered no [data-ambient-quiet] element; using the fallback guard.`);
        }
      }, 500);
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(guardTimer);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    },
  };
}
