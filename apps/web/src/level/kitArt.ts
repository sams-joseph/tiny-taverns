import { PROP_KINDS, type LevelPropKind } from "@taverns/api";
import { css, type LevelColour, type Palette, type Rgb } from "./palette";

/**
 * The prop kit, drawn in code: each kind inked on a 2D canvas, 128 pixels a
 * square, Hades-ish, as the approved prototype drew it. The renderer turns
 * each canvas into one texture its kind's instances share, and the tray shows
 * the same canvas as a thumbnail.
 *
 * Shapes and strokes are the art; every colour is the palette's.
 */

/** Pixels a square on a prop's canvas. */
export const PROP_PX = 128;
const S = PROP_PX;

type Ctx = CanvasRenderingContext2D;

interface Brush {
  readonly c: Ctx;
  /** A palette colour, with an alpha. */
  readonly k: (name: LevelColour, alpha?: number) => string;
  readonly ink: string;
  readonly shade: (alpha: number) => string;
}

const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};
const circ = (c: Ctx, x: number, y: number, r: number) => {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
};
const inked = (b: Brush, fill: string, lw = 7) => {
  const { c } = b;
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = b.ink;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.stroke();
};
/** A light catching the top-left of a shape and shadow at its foot. */
const rim = (b: Brush, path: () => void, w: number, h: number, hi?: string) => {
  const { c } = b;
  c.save();
  path();
  c.clip();
  const g = c.createLinearGradient(0, 0, w * 0.7, h);
  g.addColorStop(0, hi ?? b.k("rim", 0.28));
  g.addColorStop(0.45, b.shade(0));
  g.addColorStop(1, b.shade(0.42));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.restore();
};
const seeded = (start: number) => {
  let seed = start;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};
const line = (c: Ctx, x1: number, y1: number, x2: number, y2: number, col: string, lw: number) => {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.stroke();
};
const blobs = (
  b: Brush,
  circles: ReadonlyArray<readonly [number, number, number]>,
  fills: ReadonlyArray<string>,
  hiFill: string,
) => {
  const { c } = b;
  for (const [x, y, r] of circles) {
    circ(c, x, y, r);
    c.lineWidth = 14;
    c.strokeStyle = b.ink;
    c.stroke();
  }
  circles.forEach(([x, y, r], i) => {
    circ(c, x, y, r);
    c.fillStyle = fills[i % fills.length]!;
    c.fill();
  });
  for (const [x, y, r] of circles) {
    circ(c, x - r * 0.25, y - r * 0.25, r * 0.55);
    c.fillStyle = hiFill;
    c.fill();
  }
};

const ART: Readonly<Record<LevelPropKind, (b: Brush) => void>> = {
  crate(b) {
    const { c, k } = b;
    const p = () => rr(c, 12, 12, 104, 104, 6);
    p();
    inked(b, k("crate"));
    rim(b, p, S, S);
    for (const y of [46, 82]) line(c, 16, y, 112, y, k("crate-slat"), 4);
    line(c, 22, 22, 106, 106, b.ink, 16);
    line(c, 22, 22, 106, 106, k("crate-brace"), 9);
    p();
    c.lineWidth = 7;
    c.strokeStyle = b.ink;
    c.stroke();
  },
  barrel(b) {
    const { c, k } = b;
    const p = () => circ(c, 64, 64, 52);
    p();
    inked(b, k("barrel"));
    rim(b, p, S, S);
    circ(c, 64, 64, 44);
    c.lineWidth = 6;
    c.strokeStyle = k("barrel-hoop");
    c.stroke();
    const q = () => circ(c, 64, 64, 32);
    q();
    inked(b, k("barrel-lid"), 4);
    c.save();
    q();
    c.clip();
    for (const x of [48, 64, 80]) line(c, x, 30, x, 98, k("grain", 0.6), 3);
    c.restore();
  },
  table(b) {
    const { c, k } = b;
    const p = () => rr(c, 10, 14, 236, 100, 10);
    p();
    inked(b, k("table"));
    rim(b, p, 2 * S, S);
    for (const y of [47, 81]) line(c, 16, y, 240, y, k("table-seam"), 3);
    for (const [x, y] of [
      [60, 50],
      [190, 76],
    ] as const) {
      circ(c, x, y, 12);
      inked(b, k("brass"), 4);
      circ(c, x, y, 6);
      c.fillStyle = k("wood-dark");
      c.fill();
    }
    circ(c, 128, 64, 20);
    inked(b, k("plate"), 4);
  },
  chair(b) {
    const { c, k } = b;
    const p = () => rr(c, 32, 34, 64, 62, 8);
    p();
    inked(b, k("chair"), 6);
    rim(b, p, S, S);
    rr(c, 30, 24, 68, 18, 5);
    inked(b, k("chair-back"), 6);
  },
  pillar(b) {
    const { c, k } = b;
    rr(c, 10, 10, 108, 108, 8);
    inked(b, k("pillar-base"), 7);
    const p = () => circ(c, 64, 64, 46);
    p();
    inked(b, k("pillar"), 8);
    rim(b, p, S, S, k("rim-stone", 0.35));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      circ(c, 64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36, 3.5);
      c.fillStyle = b.shade(0.35);
      c.fill();
    }
    circ(c, 64, 64, 26);
    c.lineWidth = 3;
    c.strokeStyle = b.shade(0.3);
    c.stroke();
    line(c, 50, 40, 62, 58, b.shade(0.45), 3);
  },
  statue(b) {
    const { c, k } = b;
    const p = () => rr(c, 10, 10, 108, 108, 6);
    p();
    inked(b, k("statue-base"));
    rim(b, p, S, S);
    c.beginPath();
    c.ellipse(64, 72, 38, 22, 0, 0, Math.PI * 2);
    inked(b, k("statue"), 6);
    circ(c, 64, 60, 17);
    inked(b, k("statue-head"), 6);
    line(c, 92, 40, 100, 100, b.ink, 9);
    line(c, 92, 40, 100, 100, k("statue-staff"), 4);
  },
  brazier(b) {
    const { c, k } = b;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      line(c, 64, 64, 64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56, b.ink, 12);
      line(c, 64, 64, 64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, k("brazier-leg"), 6);
    }
    circ(c, 64, 64, 44);
    inked(b, k("brazier"), 8);
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 34);
    g.addColorStop(0, k("flame-core"));
    g.addColorStop(0.35, k("flame"));
    g.addColorStop(0.7, k("flame-deep"));
    g.addColorStop(1, k("ember"));
    circ(c, 64, 64, 34);
    c.fillStyle = g;
    c.fill();
    const r = seeded(9);
    for (let i = 0; i < 9; i++) {
      circ(c, 64 + (r() - 0.5) * 44, 64 + (r() - 0.5) * 44, 3 + r() * 4);
      c.fillStyle = k("coal", 0.8);
      c.fill();
    }
  },
  rubble(b) {
    const { c, k } = b;
    const r = seeded(4);
    for (let i = 0; i < 7; i++) {
      const cx = 22 + r() * 84;
      const cy = 22 + r() * 84;
      const rad = 10 + r() * 16;
      const n = 5 + Math.floor(r() * 3);
      c.beginPath();
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + r();
        const reach = rad * (0.7 + r() * 0.4);
        c.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
      }
      c.closePath();
      inked(b, i % 2 ? k("rubble") : k("rubble-dark"), 5);
    }
    for (let i = 0; i < 14; i++) {
      circ(c, 10 + r() * 108, 10 + r() * 108, 2 + r() * 2);
      c.fillStyle = k("grit", 0.5);
      c.fill();
    }
  },
  chest(b) {
    const { c, k } = b;
    const p = () => rr(c, 14, 28, 100, 72, 8);
    p();
    inked(b, k("chest"));
    rim(b, p, S, S);
    for (const x of [30, 86]) {
      rr(c, x, 28, 12, 72, 2);
      inked(b, k("gold-dull"), 3);
    }
    rr(c, 56, 56, 16, 18, 3);
    inked(b, k("gold-bright"), 3);
  },
  bookshelf(b) {
    const { c, k } = b;
    rr(c, 8, 18, 240, 92, 6);
    inked(b, k("shelf"));
    const cols = [
      k("cloth-red"),
      k("book-blue"),
      k("book-green"),
      k("gold-dull"),
      k("book-violet"),
      k("book-tan"),
      k("book-teal"),
    ];
    const r = seeded(11);
    let x = 18;
    while (x < 236) {
      const w = 8 + r() * 10;
      c.fillStyle = cols[Math.floor(r() * cols.length)]!;
      c.fillRect(x, 30, Math.min(w, 238 - x), 56 - r() * 10);
      line(c, x, 30, x, 86, b.shade(0.6), 2);
      x += w;
    }
    line(c, 12, 96, 244, 96, b.ink, 6);
    line(c, 12, 97, 244, 97, k("shelf-lip"), 3);
  },
  bed(b) {
    const { c, k } = b;
    rr(c, 12, 10, 104, 236, 10);
    inked(b, k("wood-dark"));
    rr(c, 22, 22, 84, 212, 8);
    inked(b, k("linen"), 4);
    rr(c, 30, 30, 68, 36, 10);
    inked(b, k("linen-light"), 4);
    const p = () => rr(c, 20, 92, 88, 144, 8);
    p();
    inked(b, k("cloth-red"), 5);
    rim(b, p, S, 2 * S);
    line(c, 24, 104, 104, 104, k("blanket-sheen", 0.35), 3);
  },
  altar(b) {
    const { c, k } = b;
    const p = () => rr(c, 10, 14, 236, 100, 6);
    p();
    inked(b, k("altar"));
    rim(b, p, 2 * S, S);
    c.fillStyle = k("cloth-red");
    c.fillRect(98, 14, 60, 100);
    line(c, 102, 14, 102, 114, k("gold"), 4);
    line(c, 154, 14, 154, 114, k("gold"), 4);
    for (const x of [36, 220]) {
      circ(c, x, 64, 11);
      inked(b, k("wax"), 4);
      circ(c, x, 64, 4);
      c.fillStyle = k("candle-flame");
      c.fill();
    }
    circ(c, 128, 64, 14);
    inked(b, k("gold"), 4);
  },
  tree(b) {
    const r = seeded(21);
    const cs: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 60;
      cs.push([128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 42 + r() * 26]);
    }
    blobs(b, cs, [b.k("leaf-dark"), b.k("leaf"), b.k("leaf-mid")], b.k("leaf-sheen", 0.22));
  },
  boulder(b) {
    const { c, k } = b;
    const pts = [
      [24, 50],
      [44, 18],
      [92, 22],
      [112, 60],
      [96, 104],
      [44, 110],
      [18, 84],
    ] as const;
    const p = () => {
      c.beginPath();
      for (const [x, y] of pts) c.lineTo(x, y);
      c.closePath();
    };
    p();
    inked(b, k("boulder"));
    rim(b, p, S, S, k("rim-stone", 0.3));
    line(c, 44, 18, 62, 60, b.shade(0.4), 3);
    line(c, 62, 60, 112, 60, b.shade(0.35), 3);
    line(c, 62, 60, 44, 110, b.shade(0.3), 3);
  },
  bush(b) {
    const { c, k } = b;
    blobs(
      b,
      [
        [48, 52, 28],
        [80, 50, 26],
        [64, 80, 30],
        [40, 82, 20],
        [88, 84, 22],
      ],
      [k("bush"), k("bush-light")],
      k("bush-sheen", 0.22),
    );
    for (const [x, y] of [
      [50, 60],
      [78, 76],
      [62, 44],
    ] as const) {
      circ(c, x, y, 5);
      inked(b, k("berry"), 2);
    }
  },
  rug(b) {
    const { c, k } = b;
    rr(c, 10, 10, 236, 364, 10);
    inked(b, k("rug"));
    rr(c, 26, 26, 204, 332, 6);
    c.lineWidth = 6;
    c.strokeStyle = k("gold");
    c.stroke();
    c.beginPath();
    c.moveTo(128, 80);
    c.lineTo(200, 192);
    c.lineTo(128, 304);
    c.lineTo(56, 192);
    c.closePath();
    inked(b, k("rug-blue"), 5);
    c.beginPath();
    c.moveTo(128, 140);
    c.lineTo(164, 192);
    c.lineTo(128, 244);
    c.lineTo(92, 192);
    c.closePath();
    inked(b, k("gold"), 4);
    for (let x = 20; x < 240; x += 12) {
      line(c, x, 2, x, 12, k("linen"), 3);
      line(c, x, 372, x, 382, k("linen"), 3);
    }
  },
};

const BLACK: Rgb = [0, 0, 0];

/**
 * Draw a prop kind on a fresh canvas, its kit size at {@link PROP_PX} a
 * square. `null` where the browser has no 2D canvas (the test environment).
 */
export const drawProp = (kind: LevelPropKind, palette: Palette): HTMLCanvasElement | null => {
  const spec = PROP_KINDS[kind];
  const canvas = document.createElement("canvas");
  canvas.width = spec.width * S;
  canvas.height = spec.height * S;
  let c: Ctx | null = null;
  try {
    c = canvas.getContext("2d");
  } catch {
    c = null;
  }
  if (c === null) return null;
  const brush: Brush = {
    c,
    k: (name, alpha = 1) => css(palette.level[name], alpha),
    ink: css(palette.theme.ink),
    shade: (alpha) => css(BLACK, alpha),
  };
  ART[kind](brush);
  return canvas;
};
