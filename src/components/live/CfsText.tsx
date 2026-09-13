'use client';

import React from 'react';
import { CfsFont, FONT_MEDIUM } from '@/lib/live/cfsFonts';

/**
 * Text drawn with the retail Infantry UI bitmap fonts (uiart font2 "Small" / font3 "Medium"),
 * pixel for pixel: every glyph is a CSS-masked span cut from the sprite sheet, tinted by
 * background colour, advanced by width + 1 exactly like the client's FontManager. Integer
 * scales only (1 or 2) - the 2x sheet is a nearest-neighbour copy so nothing gets smoothed.
 */

export type CfsScale = 1 | 2;

function glyph(font: CfsFont, code: number): [number, number] {
  if (code < 32 || code > 126) return font.glyphs[0];
  return font.glyphs[code - 32] ?? font.glyphs[0];
}

/** Advance in unscaled pixels: width + 1, or half a cell for a blank glyph (space). */
function advance(font: CfsFont, g: [number, number]): number {
  const adv = Math.abs(g[1]) + 1;
  return adv < 2 ? Math.max(1, Math.floor(font.cell / 2)) : adv;
}

/** Width of a line in CSS pixels at the given scale. */
export function measureCfs(text: string, font: CfsFont = FONT_MEDIUM, scale: CfsScale = 1): number {
  let w = 0;
  for (const ch of text) w += advance(font, glyph(font, ch.charCodeAt(0)));
  return w * scale;
}

/** Longest prefix that fits maxWidth (the client clips; no ellipsis). */
export function fitCfs(text: string, maxWidth: number, font: CfsFont = FONT_MEDIUM, scale: CfsScale = 1): string {
  if (measureCfs(text, font, scale) <= maxWidth) return text;
  let out = '';
  let w = 0;
  for (const ch of text) {
    const a = advance(font, glyph(font, ch.charCodeAt(0))) * scale;
    if (w + a > maxWidth) break;
    out += ch;
    w += a;
  }
  return out;
}

export function CfsText({
  text,
  color,
  font = FONT_MEDIUM,
  scale = 1,
  className = '',
  style,
  title,
}: {
  text: string;
  color: string;
  font?: CfsFont;
  scale?: CfsScale;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const cell = font.cell * scale;
  const sheet = scale === 2 ? font.sheet2x : font.sheet1x;
  const sheetW = 95 * cell;
  const spans: React.ReactNode[] = [];
  let i = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const g = glyph(font, code);
    const adv = advance(font, g) * scale;
    const w = Math.abs(g[1]) * scale;
    if (w > 0 && code >= 32 && code <= 126) {
      const maskX = -((code - 32) * font.cell + g[0]) * scale;
      const mask: React.CSSProperties = {
        display: 'inline-block',
        width: w,
        height: cell,
        marginRight: adv - w,
        backgroundColor: color,
        WebkitMaskImage: `url(${sheet})`,
        maskImage: `url(${sheet})`,
        WebkitMaskSize: `${sheetW}px ${cell}px`,
        maskSize: `${sheetW}px ${cell}px`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: `${maskX}px 0`,
        maskPosition: `${maskX}px 0`,
        verticalAlign: 'top',
      };
      spans.push(<span key={i} style={mask} aria-hidden="true" />);
    } else {
      spans.push(<span key={i} style={{ display: 'inline-block', width: adv, height: cell, verticalAlign: 'top' }} aria-hidden="true" />);
    }
    i++;
  }
  return (
    <span
      className={`inline-block whitespace-nowrap align-top ${className}`}
      style={{ height: cell, lineHeight: `${cell}px`, ...style }}
      title={title ?? text}
      role="text"
      aria-label={text}
    >
      {spans}
    </span>
  );
}
