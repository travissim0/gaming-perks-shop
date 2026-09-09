'use client';

/**
 * Proof of concept: an Infantry character walking around on the page, drawn from a
 * sprite atlas baked out of the game's own man.blo by scripts/bake-infantry-atlas.mjs.
 *
 * No CFS decoding happens here - the atlas is a plain PNG plus a JSON frame map, so the
 * runtime cost is one image load and a canvas blit per frame.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';

interface AtlasMeta {
  name: string;
  source: string;
  image: string;
  cellWidth: number;
  cellHeight: number;
  rows: number;
  columns: number;
  frameCount: number;
  animationTime: number;
  directionCount: number;
  sourceRows: number[];
}

const SPEED = 130;          // px per second
const SCALE = 2;            // the sprite is small; 2x keeps the pixels crisp
const STAGE_W = 900;
const STAGE_H = 460;

export default function SpriteDemoPage() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [meta, setMeta] = useState<AtlasMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Live state kept in refs - the render loop must not re-run on every keypress.
  const keys = useRef<Set<string>>(new Set());
  const pos = useRef({ x: STAGE_W / 2, y: STAGE_H / 2 });
  const facing = useRef(8);      // atlas row; 8 of 16 faces down toward the viewer
  const animTime = useRef(0);
  const moving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/sprites/infantry.json');
        if (!res.ok) throw new Error(`atlas metadata ${res.status}`);
        const json: AtlasMeta = await res.json();
        if (!cancelled) setMeta(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load the sprite atlas');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard. Arrow keys are swallowed so the page does not scroll while walking.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const startLoop = useCallback(
    (atlas: HTMLImageElement, m: AtlasMeta) => {
      const canvas = canvasRef.current;
      if (!canvas) return () => {};
      const ctx = canvas.getContext('2d');
      if (!ctx) return () => {};
      ctx.imageSmoothingEnabled = false;

      let raf = 0;
      let last = performance.now();

      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // ── input ──
        const k = keys.current;
        let dx = 0;
        let dy = 0;
        if (k.has('a') || k.has('arrowleft')) dx -= 1;
        if (k.has('d') || k.has('arrowright')) dx += 1;
        if (k.has('w') || k.has('arrowup')) dy -= 1;
        if (k.has('s') || k.has('arrowdown')) dy += 1;

        moving.current = dx !== 0 || dy !== 0;

        if (moving.current) {
          const len = Math.hypot(dx, dy) || 1;
          pos.current.x += (dx / len) * SPEED * dt;
          pos.current.y += (dy / len) * SPEED * dt;

          // Atlas row 0 faces away from the viewer and rows advance clockwise, so the
          // heading is measured from north: atan2(dx, -dy).
          const angle = Math.atan2(dx, -dy);
          const turn = (angle + Math.PI * 2) % (Math.PI * 2);
          facing.current =
            Math.round(turn / ((Math.PI * 2) / m.directionCount)) % m.directionCount;

          animTime.current += dt * 1000;
        } else {
          animTime.current = 0;
        }

        // Keep the character on stage.
        const halfW = (m.cellWidth * SCALE) / 2;
        const halfH = (m.cellHeight * SCALE) / 2;
        pos.current.x = Math.max(halfW, Math.min(STAGE_W - halfW, pos.current.x));
        pos.current.y = Math.max(halfH, Math.min(STAGE_H - halfH, pos.current.y));

        // ── draw ──
        ctx.clearRect(0, 0, STAGE_W, STAGE_H);

        const col = moving.current
          ? Math.floor(animTime.current / m.animationTime) % m.columns
          : 0;
        const sx = col * m.cellWidth;
        const sy = facing.current * m.cellHeight;

        ctx.drawImage(
          atlas,
          sx, sy, m.cellWidth, m.cellHeight,
          Math.round(pos.current.x - halfW),
          Math.round(pos.current.y - halfH),
          m.cellWidth * SCALE,
          m.cellHeight * SCALE,
        );

        raf = requestAnimationFrame(frame);
      };

      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    },
    [],
  );

  useEffect(() => {
    if (!meta) return;
    const img = new Image();
    let stop: (() => void) | undefined;
    img.onload = () => {
      setReady(true);
      stop = startLoop(img, meta);
    };
    img.onerror = () => setError('Could not load /sprites/infantry.png');
    img.src = `/sprites/${meta.image}`;
    return () => stop?.();
  }, [meta, startLoop]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-5">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
            Sprite Demo
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            An Infantry character drawn from the game&apos;s own sprite, baked into a PNG
            atlas. <span className="text-gray-300">WASD</span> or the{' '}
            <span className="text-gray-300">arrow keys</span> to walk.
          </p>
          {meta && (
            <div className="flex flex-wrap gap-2 mt-3 text-xs">
              <Chip label="source" value={meta.source} />
              <Chip label="cell" value={`${meta.cellWidth}x${meta.cellHeight}`} />
              <Chip label="facings" value={`${meta.directionCount} of 64`} />
              <Chip label="frames" value={meta.frameCount} />
              <Chip label="cycle" value={`${meta.animationTime}ms`} />
            </div>
          )}
        </div>

        <div
          className="relative rounded-xl border border-gray-700/60 overflow-hidden"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            maxWidth: '100%',
            background:
              'radial-gradient(circle at 50% 40%, #1b2333 0%, #0d1017 70%), repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 32px)',
          }}
        >
          <canvas
            ref={canvasRef}
            width={STAGE_W}
            height={STAGE_H}
            className="absolute inset-0 w-full h-full"
            style={{ imageRendering: 'pixelated' }}
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
              Loading sprite…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <div>
                <div className="text-amber-400/90 text-sm font-semibold">
                  Sprite atlas not found
                </div>
                <div className="text-gray-500 text-xs mt-1 max-w-sm">
                  Bake it first:
                  <code className="block mt-1 text-gray-400">
                    node scripts/bake-infantry-atlas.mjs --blo man.blo --rowStep 4
                  </code>
                </div>
                <div className="text-gray-700 text-[10px] font-mono mt-2">{error}</div>
              </div>
            </div>
          )}
        </div>

        <p className="text-gray-600 text-xs">
          Proof of concept only — one local character, nothing is synced to anyone else.{' '}
          <Link href="/league" className="text-cyan-400 hover:underline">
            Back to the league hub
          </Link>
        </p>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded border border-gray-700/60 bg-gray-900/50 px-2 py-1">
      <span className="text-gray-500">{label} </span>
      <span className="text-cyan-400 font-mono">{value}</span>
    </span>
  );
}
