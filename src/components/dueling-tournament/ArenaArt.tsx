'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FONT_MEDIUM, FONT_SMALL, type CfsFont } from '@/lib/live/cfsFonts';

// Every class atlas is baked from the same man.blo sprite (see public/sprites/*.json):
// 79x63 cells, 12 animation frames across, 16 facings down, clockwise from facing away.
const CELL_W = 79;
const CELL_H = 63;
const SHEET_W = 948;
const SHEET_H = 1008;
const FACING_ROW = { north: 0, east: 4, south: 8, west: 12 } as const;
const CLASSES = [
  'infantry',
  'heavy-weapons',
  'jump-trooper',
  'infiltrator',
  'squad-leader',
  'field-medic',
  'combat-engineer',
] as const;

export type SpriteClass = (typeof CLASSES)[number];

/** A stable, decorative class per alias so each player keeps the same soldier everywhere. */
export function classFor(alias: string): SpriteClass {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) hash = (hash * 31 + alias.charCodeAt(i)) >>> 0;
  return CLASSES[hash % CLASSES.length];
}

export function Sprite({
  cls,
  facing = 'south',
  scale = 1,
  tone,
  className = '',
  style,
}: {
  cls: SpriteClass;
  facing?: keyof typeof FACING_ROW;
  scale?: number;
  tone?: 'gold' | 'grey';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`dt-spr ${tone ? `dt-spr-${tone}` : ''} ${className}`}
      style={{
        width: CELL_W * scale,
        height: CELL_H * scale,
        backgroundImage: `url(/sprites/${cls}.png)`,
        backgroundSize: `${SHEET_W * scale}px ${SHEET_H * scale}px`,
        backgroundPosition: `0 ${-FACING_ROW[facing] * CELL_H * scale}px`,
        ...style,
      }}
    />
  );
}

const FONTS = { small: FONT_SMALL, medium: FONT_MEDIUM };
const sheets = new Map<string, Promise<HTMLImageElement>>();

function loadSheet(font: CfsFont) {
  let sheet = sheets.get(font.name);
  if (!sheet) {
    sheet = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${font.sheet1x}`));
      image.src = font.sheet1x;
    });
    sheets.set(font.name, sheet);
  }
  return sheet;
}

// Layout follows the rules recorded in cfsFonts.ts: glyph i is ASCII 32+i, the pen ignores the
// bearing, advance is width + 1, a blank glyph advances cell/2 and unknown characters use glyph 0.
function layout(font: CfsFont, text: string) {
  const glyphs: { index: number; bearing: number; width: number; x: number }[] = [];
  let pen = 0;
  for (const character of text) {
    let index = character.charCodeAt(0) - 32;
    if (index < 0 || index >= font.glyphs.length) index = 0;
    const [bearing, width] = font.glyphs[index];
    if (index === 0 || width === 0) {
      pen += font.cell / 2;
      continue;
    }
    glyphs.push({ index, bearing, width, x: pen });
    pen += width + 1;
  }
  return { glyphs, width: Math.max(1, Math.ceil(pen)) };
}

/** Text in the game's own UI font: white retail glyphs drawn crisp, then tinted. */
export function PixelText({
  text,
  color = '#8b98b0',
  size = 'small',
  scale = 2,
  className = '',
}: {
  text: string;
  color?: string;
  size?: keyof typeof FONTS;
  scale?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const font = FONTS[size];
  const shape = useMemo(() => layout(font, text), [font, text]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const factor = scale * Math.max(1, Math.round(window.devicePixelRatio || 1));
    canvas.width = shape.width * factor;
    canvas.height = font.cell * factor;
    loadSheet(font)
      .then((image) => {
        const context = canvas.getContext('2d');
        if (cancelled || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';
        context.imageSmoothingEnabled = false;
        for (const glyph of shape.glyphs) {
          context.drawImage(
            image,
            glyph.index * font.cell + glyph.bearing,
            0,
            glyph.width,
            font.cell,
            glyph.x * factor,
            0,
            glyph.width * factor,
            font.cell * factor,
          );
        }
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [font, shape, color, scale]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={text}
      className={`dt-px ${className}`}
      style={{ width: shape.width * scale, height: font.cell * scale }}
    />
  );
}

/** Server-aligned clock for countdowns, ticking once a second between polls. */
export function useServerClock(serverNow: string, fetchedAt: number | null) {
  // Stable until the next poll: an offset that changed every render would restart the timer.
  const offset = useMemo(() => {
    const server = Date.parse(serverNow);
    return Number.isFinite(server) && fetchedAt ? server - fetchedAt : 0;
  }, [serverNow, fetchedAt]);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [offset]);
  return now;
}

export function Countdown({ until, now }: { until: string; now: number }) {
  const left = Math.max(0, Date.parse(until) - now);
  const days = Math.floor(left / 864e5);
  const hours = Math.floor((left % 864e5) / 36e5);
  const minutes = Math.floor((left % 36e5) / 6e4);
  const seconds = Math.floor((left % 6e4) / 1e3);
  const parts: [number, string][] =
    days > 0
      ? [
          [days, 'd'],
          [hours, 'h'],
          [minutes, 'm'],
        ]
      : hours > 0
        ? [
            [hours, 'h'],
            [minutes, 'm'],
            [seconds, 's'],
          ]
        : [
            [minutes, 'm'],
            [seconds, 's'],
          ];
  return (
    <span className="dt-countdown" role="timer">
      {parts.map(([value, unit], index) => (
        <span key={unit}>
          {index ? String(value).padStart(2, '0') : value}
          <i>{unit}</i>
        </span>
      ))}
    </span>
  );
}
