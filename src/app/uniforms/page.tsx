'use client';

/**
 * Squad uniform picker. Squads tune the three uniform colours on the real man.blo sprite
 * and hand the zone developer a ready-to-paste `Colors=` line for their [TeamInfoN].
 *
 * The sprite is baked as palette indices (scripts/bake-infantry-atlas.mjs --indexed), so
 * recolouring is a 256-entry lookup, the same palette swap the game does. man.blo keeps
 * its three recolourable ramps at indices 1-16, 17-32 and 33-48 (userPaletteStart 1,
 * userPalette 48); each ramp runs black -> team colour over its 16 slots, matching the client.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';

interface AtlasMeta {
  image: string;
  cellWidth: number;
  cellHeight: number;
  rows: number;
  columns: number;
  animationTime: number;
  palette: number[][];
}

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

const CHANNELS = [
  { key: 'primary', label: 'Body', hint: 'Primary colour (palette 1-16)' },
  { key: 'secondary', label: 'Armor', hint: 'Secondary colour (palette 17-32)' },
  { key: 'tertiary', label: 'Trim', hint: 'Tertiary colour (palette 33-48)' },
] as const;
type Channel = (typeof CHANNELS)[number]['key'];

const RAMP_START = 1;
const RAMP_LEN = 16;

/** A few existing ctfpl.cfg teams as starting points. */
const PRESETS: { name: string; colors: [string, string, string] }[] = [
  { name: 'Titan Militia', colors: ['#003000', '#008000', '#00ff00'] },
  { name: 'Collective', colors: ['#300000', '#800000', '#ff0000'] },
  { name: 'Juicy Fruit', colors: ['#990000', '#ccff33', '#cc0066'] },
  { name: 'Smurfs', colors: ['#33ccff', '#33ccff', '#33ccff'] },
];

const SCALE = 4;
const PICKER = 240;

// ── colour math ─────────────────────────────────────────────────────────────
function rgbToHsv({ r, g, b }: Rgb): Hsv {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s: max > 0 ? d / max : 0, v: max };
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

const toHex = ({ r, g, b }: Rgb) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
const fromHex = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};
const cfgHex = (c: Rgb) => '0x' + toHex(c).slice(1).toUpperCase();

// ── page ────────────────────────────────────────────────────────────────────
export default function UniformsPage() {
  return (
    <Suspense>
      <UniformPicker />
    </Suspense>
  );
}

function UniformPicker() {
  const { user } = useAuth();
  const params = useSearchParams();

  const [teamName, setTeamName] = useState(() => params.get('name') ?? '');
  const [colors, setColors] = useState<Record<Channel, Hsv>>(() => {
    const fromUrl = (params.get('c') ?? '').split(',').map((h) => fromHex(h));
    const start = fromUrl.length === 3 && fromUrl.every(Boolean) ? (fromUrl as Rgb[]) : PRESETS[0].colors.map((h) => fromHex(h)!);
    return { primary: rgbToHsv(start[0]), secondary: rgbToHsv(start[1]), tertiary: rgbToHsv(start[2]) };
  });
  const [active, setActive] = useState<Channel>('primary');
  const [copied, setCopied] = useState<string | null>(null);

  const rgb = useMemo(
    () => ({ primary: hsvToRgb(colors.primary), secondary: hsvToRgb(colors.secondary), tertiary: hsvToRgb(colors.tertiary) }),
    [colors],
  );
  const cfgLine = `Colors=${cfgHex(rgb.primary)},${cfgHex(rgb.secondary)},${cfgHex(rgb.tertiary)}`;

  const setChannel = useCallback((ch: Channel, hsv: Hsv) => setColors((c) => ({ ...c, [ch]: hsv })), []);

  // Keep the URL shareable without adding history entries on every drag.
  useEffect(() => {
    const c = [rgb.primary, rgb.secondary, rgb.tertiary].map((x) => toHex(x).slice(1)).join(',');
    const name = teamName ? `name=${encodeURIComponent(teamName)}&` : '';
    window.history.replaceState(null, '', `?${name}c=${c}`);
  }, [teamName, rgb]);

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  const randomize = () => {
    const rand = (): Hsv => ({ h: Math.random(), s: 0.4 + Math.random() * 0.6, v: 0.45 + Math.random() * 0.55 });
    setColors({ primary: rand(), secondary: rand(), tertiary: rand() });
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const [a, b, c] = p.colors.map((h) => rgbToHsv(fromHex(h)!));
    setColors({ primary: a, secondary: b, tertiary: c });
  };

  const hsv = colors[active];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-5">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
            Squad Uniforms
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Pick your squad&apos;s three uniform colours on the in-game sprite, then send the
            line at the bottom (or the share link) to the zone staff.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-[auto_1fr]">
          {/* Picker */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-4 space-y-3 w-full md:w-[272px]">
            <div className="flex gap-1.5">
              {CHANNELS.map((ch) => {
                const c = rgb[ch.key];
                const on = active === ch.key;
                return (
                  <button
                    key={ch.key}
                    title={ch.hint}
                    onClick={() => setActive(ch.key)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-md text-xs font-semibold transition-colors border ${
                      on ? 'bg-white/10 border-purple-400/70 text-gray-100' : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className="w-5 h-5 rounded border border-white/20" style={{ background: toHex(c) }} />
                    {ch.label}
                  </button>
                );
              })}
            </div>

            <SvSquare hsv={hsv} onChange={(s, v) => setChannel(active, { ...hsv, s, v })} />
            <HueBar hue={hsv.h} onChange={(h) => setChannel(active, { ...hsv, h })} />

            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded border border-white/20 shrink-0" style={{ background: toHex(rgb[active]) }} />
              <HexInput value={toHex(rgb[active])} onCommit={(c) => setChannel(active, rgbToHsv(c))} />
            </div>

            <div className="flex gap-2 text-xs">
              <button onClick={randomize} className="flex-1 rounded-md border border-gray-600/60 bg-gray-900/50 py-1.5 text-gray-300 hover:border-purple-400/60">
                Randomize
              </button>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">Start from</div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-1.5 rounded border border-gray-700/60 bg-gray-900/50 px-2 py-1 text-xs text-gray-300 hover:border-gray-500"
                  >
                    <span className="flex">
                      {p.colors.map((h, i) => <span key={i} className="w-2.5 h-3" style={{ background: h }} />)}
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-4 flex flex-col gap-3 min-w-0">
            <SpritePreview colors={rgb} />
            <div className="flex gap-1 justify-center">
              {CHANNELS.map((ch) => <RampStrip key={ch.key} color={rgb[ch.key]} title={ch.label} />)}
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-4 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Squad / team name</span>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value.slice(0, 32))}
              placeholder="e.g. Titan Militia"
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-sm outline-none focus:border-purple-400/70"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 break-all rounded-md border border-gray-700 bg-black/40 px-3 py-2 font-mono text-sm text-cyan-300">
              {cfgLine}
            </code>
            <button onClick={() => copy(cfgLine, 'cfg')} className="rounded-md bg-purple-600 hover:bg-purple-500 px-3 py-2 text-sm font-semibold">
              {copied === 'cfg' ? 'Copied' : 'Copy cfg line'}
            </button>
            <button
              onClick={() => copy(window.location.href, 'link')}
              className="rounded-md border border-gray-600 bg-gray-900/60 hover:border-gray-400 px-3 py-2 text-sm"
            >
              {copied === 'link' ? 'Copied' : 'Copy share link'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Goes under the team&apos;s <span className="font-mono text-gray-400">[TeamInfoN]</span> section in the zone cfg.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── preview ─────────────────────────────────────────────────────────────────
function SpritePreview({ colors }: { colors: Record<Channel, Rgb> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [meta, setMeta] = useState<AtlasMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const indices = useRef<{ w: number; h: number; idx: Uint8Array; alpha: Uint8Array } | null>(null);
  const atlas = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/sprites/infantry-indexed.json').then((r) => r.json()).then(setMeta).catch(() => setError('Could not load sprite data'));
  }, []);

  // Decode the index atlas once.
  useEffect(() => {
    if (!meta) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const n = c.width * c.height;
      const idx = new Uint8Array(n), alpha = new Uint8Array(n);
      for (let i = 0; i < n; i++) { idx[i] = px[i * 4]; alpha[i] = px[i * 4 + 3]; }
      indices.current = { w: c.width, h: c.height, idx, alpha };
      atlas.current = c;
      setReady(true);
    };
    img.onerror = () => setError('Could not load sprite image');
    img.src = `/sprites/${meta.image}`;
  }, [meta]);

  // Re-colour the atlas whenever the colours change: a palette swap, as in game.
  useEffect(() => {
    const src = indices.current, out = atlas.current;
    if (!ready || !meta || !src || !out) return;
    const lut = meta.palette.map((p) => p.slice());
    const ramps = [colors.primary, colors.secondary, colors.tertiary];
    ramps.forEach((c, r) => {
      for (let i = 0; i < RAMP_LEN; i++) {
        const p = RAMP_START + r * RAMP_LEN + i;
        const k = i / (RAMP_LEN - 1); // black -> full colour, as the client's applyTeamColorsToPalette
        lut[p] = [Math.round(c.r * k), Math.round(c.g * k), Math.round(c.b * k), 255];
      }
    });
    const ctx = out.getContext('2d')!;
    const img = ctx.createImageData(src.w, src.h);
    const d = img.data;
    for (let i = 0; i < src.idx.length; i++) {
      if (!src.alpha[i]) continue;
      const e = lut[src.idx[i]];
      d[i * 4] = e[0]; d[i * 4 + 1] = e[1]; d[i * 4 + 2] = e[2]; d[i * 4 + 3] = e[3];
    }
    ctx.putImageData(img, 0, 0);
  }, [colors, ready, meta]);

  // Walk in place, turning slowly through every facing.
  useEffect(() => {
    if (!ready || !meta) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const draw = (t: number) => {
      const el = (t - t0) / 1000;
      const col = Math.floor(el / 0.08) % meta.columns; // ~12 fps walk cycle
      const row = (Math.floor(el / 0.6) + 8) % meta.rows;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = meta.cellWidth * SCALE, h = meta.cellHeight * SCALE;
      ctx.drawImage(atlas.current!, col * meta.cellWidth, row * meta.cellHeight, meta.cellWidth, meta.cellHeight,
        (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ready, meta]);

  return (
    <div className="relative rounded-lg bg-[#2b2f24] border border-black/40 overflow-hidden" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
      <canvas ref={canvasRef} width={360} height={280} className="block mx-auto max-w-full" style={{ imageRendering: 'pixelated' }} />
      {(error || !ready) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">{error ?? 'Loading sprite…'}</div>
      )}
    </div>
  );
}

function RampStrip({ color, title }: { color: Rgb; title: string }) {
  return (
    <div className="flex" title={title}>
      {Array.from({ length: RAMP_LEN }, (_, i) => {
        const k = i / (RAMP_LEN - 1);
        return <span key={i} className="w-2 h-4" style={{ background: `rgb(${Math.round(color.r * k)},${Math.round(color.g * k)},${Math.round(color.b * k)})` }} />;
      })}
    </div>
  );
}

// ── controls ────────────────────────────────────────────────────────────────
function useDrag(onPoint: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onPoint(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); },
    onPointerMove: (e: React.PointerEvent) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e); },
  };
}

function SvSquare({ hsv, onChange }: { hsv: Hsv; onChange: (s: number, v: number) => void }) {
  const drag = useDrag((x, y) => onChange(x, 1 - y));
  const hue = toHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  return (
    <div
      {...drag}
      className="relative w-full rounded cursor-crosshair touch-none select-none"
      style={{ maxWidth: PICKER, aspectRatio: '1', background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})` }}
    >
      <span
        className="absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full border-2 border-white pointer-events-none"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, boxShadow: '0 0 3px rgba(0,0,0,0.8)' }}
      />
    </div>
  );
}

function HueBar({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const drag = useDrag((x) => onChange(Math.min(x, 0.9999)));
  return (
    <div
      {...drag}
      className="relative w-full h-4 rounded-sm cursor-ew-resize touch-none select-none"
      style={{ maxWidth: PICKER, background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
    >
      <span className="absolute -top-0.5 -bottom-0.5 w-1 -ml-0.5 rounded-sm bg-white pointer-events-none" style={{ left: `${hue * 100}%`, boxShadow: '0 0 3px rgba(0,0,0,0.8)' }} />
    </div>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit: (c: Rgb) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const c = fromHex(e.target.value);
        if (c) onCommit(c);
      }}
      spellCheck={false}
      className="w-full rounded-md border border-gray-700 bg-gray-900/70 px-2 py-1.5 font-mono text-sm uppercase outline-none focus:border-purple-400/70"
    />
  );
}
