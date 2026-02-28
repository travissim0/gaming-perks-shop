'use client';

import { useState } from 'react';
import { CLASS_COLORS, CLASS_OPTIONS } from '@/lib/constants';

interface FreeAgentLike {
  preferred_roles?: string[];
  secondary_roles?: string[];
  classes_to_try?: string[];
}

interface ClassDistributionViewProps {
  agents: FreeAgentLike[];
  onSelectClass: (cls: string) => void;
}

export default function ClassDistributionView({ agents, onSelectClass }: ClassDistributionViewProps) {
  const allClassKeys = CLASS_OPTIONS;

  const buildCounts = (picker: (a: FreeAgentLike) => string[]) => {
    const counts: Record<string, number> = Object.fromEntries(allClassKeys.map(k => [k, 0]));
    for (const a of agents) {
      for (const cls of picker(a) || []) {
        if (counts[cls] !== undefined) counts[cls] += 1;
      }
    }
    return counts;
  };

  const preferredCounts = buildCounts(a => a.preferred_roles || []);
  const secondaryCounts = buildCounts(a => a.secondary_roles || []);
  const tryCounts = buildCounts(a => a.classes_to_try || []);

  const getTextColorClass = (className: string): string => {
    const mapping = CLASS_COLORS[className];
    const fallback: Record<string, string> = {
      'O INF': 'text-red-500',
      'D INF': 'text-red-400',
      'O HVY': 'text-blue-500',
      'D HVY': 'text-blue-400',
      'Medic': 'text-yellow-300',
      'SL': 'text-green-300',
      'Foot JT': 'text-gray-300',
      'D Foot JT': 'text-gray-400',
      'Pack JT': 'text-gray-300',
      'Engineer': 'text-amber-800',
      'Infil': 'text-fuchsia-400',
      '10-man Infil': 'text-fuchsia-500',
    };
    if (typeof mapping === 'string') {
      const token = mapping.split(' ').find((t: string) => t.startsWith('text-')) || fallback[className];
      if (!token) return 'text-gray-500';
      return token.replace('-200', '-400').replace('-300', '-500');
    }
    return fallback[className] || 'text-gray-500';
  };

  const PieChart = ({ title, counts }: { title: string; counts: Record<string, number> }) => {
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const radius = 40;
    const cx = 50;
    const cy = 50;

    const segments = [] as { d: string; cls: string; key: string; midAngle: number }[];
    let startAngle = 0;
    const entries = allClassKeys
      .map(k => ({ key: k, value: counts[k] }))
      .filter(e => e.value > 0);

    const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
      const rad = (angle - 90) * Math.PI / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };
    const describeArc = (cx: number, cy: number, r: number, start: number, end: number) => {
      const startP = polarToCartesian(cx, cy, r, end);
      const endP = polarToCartesian(cx, cy, r, start);
      const largeArcFlag = end - start <= 180 ? 0 : 1;
      return `M ${cx} ${cy} L ${startP.x} ${startP.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${endP.x} ${endP.y} Z`;
    };

    for (const e of entries) {
      const angle = (e.value / total) * 360;
      const endAngle = startAngle + angle;
      const midAngle = startAngle + angle / 2;
      segments.push({ d: describeArc(cx, cy, radius, startAngle, endAngle), cls: getTextColorClass(e.key), key: e.key, midAngle });
      startAngle = endAngle;
    }

    type LeaderLabel = {
      key: string;
      cls: string;
      percent: number;
      start: { x: number; y: number };
      elbow: { x: number; y: number };
      endX: number;
      endY: number;
      sideRight: boolean;
      fontSize: number;
    };

    const pad = 8;
    const elbowRadius = radius + 6;
    const labelRadius = radius + 14;

    const minAngleSpacing = 8;
    const segmentsSorted = segments
      .map((s, i) => ({ s, e: entries[i] }))
      .sort((a, b) => a.s.midAngle - b.s.midAngle);

    let lastAngle = -999;
    const labels: LeaderLabel[] = segmentsSorted.map(({ s, e }) => {
      let angle = s.midAngle;
      if (lastAngle !== -999 && angle - lastAngle < minAngleSpacing) {
        angle = lastAngle + minAngleSpacing;
      }
      if (angle >= 360) angle -= 360;
      lastAngle = angle;

      const percent = (e.value / total) * 100;
      const edge = polarToCartesian(cx, cy, radius, angle);
      const elbow = polarToCartesian(cx, cy, elbowRadius, angle);
      const labelPoint = polarToCartesian(cx, cy, labelRadius, angle);
      const sideRight = Math.cos(angle * Math.PI / 180) >= 0;
      const endX = Math.max(pad, Math.min(100 - pad, labelPoint.x));
      const endY = Math.max(pad, Math.min(100 - pad, labelPoint.y));
      const fontSize = 5 + Math.min(2, (percent / 100) * 2);
      return { key: s.key, cls: s.cls, percent, start: edge, elbow, endX, endY, sideRight, fontSize };
    });

    return (
      <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4">
        <div className="mb-3 text-sm font-semibold text-white flex items-center gap-2">
          {title} Class Distribution
        </div>
        <div>
          <svg viewBox="0 0 100 100" className="w-full max-w-[520px] h-auto" style={{ overflow: 'visible' }}>
            {segments.map((s, i) => (
              <path
                key={i}
                d={s.d}
                className={`${s.cls}`}
                fill="currentColor"
                onMouseEnter={() => setHoveredKey(s.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onSelectClass(s.key)}
                style={{ cursor: 'pointer' }}
              />
            ))}
            <circle cx={cx} cy={cy} r={24} className="fill-gray-900" />
            {hoveredKey && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`${getTextColorClass(hoveredKey)}`}
                fill="currentColor"
                style={{ fontSize: '10px', fontWeight: 700, filter: 'drop-shadow(0 0 2px currentColor)' }}
              >
                {hoveredKey}
              </text>
            )}
            {labels.map((l, i) => {
              const isActive = hoveredKey === l.key;
              const labelText = `${Math.round(l.percent)}%`;
              const labelPad = 2.5;
              const approxWidth = Math.max(14, labelText.length * l.fontSize * 0.56 + labelPad * 2);
              const approxHeight = l.fontSize + labelPad * 2;
              const centerX = Math.max(approxWidth / 2 + 2, Math.min(100 - approxWidth / 2 - 2, l.endX));
              const centerY = Math.max(approxHeight / 2 + 2, Math.min(100 - approxHeight / 2 - 2, l.endY));
              const rectX = centerX - approxWidth / 2;
              const rectY = centerY - approxHeight / 2;
              const scale = isActive ? 1.06 : 1.0;
              const transform = `translate(${centerX},${centerY}) scale(${scale}) translate(${-centerX},${-centerY})`;
              return (
                <g key={`lbl-${i}`} className={l.cls} transform={transform}>
                  <polyline
                    points={`${l.start.x},${l.start.y} ${l.elbow.x},${l.elbow.y} ${l.endX},${l.endY}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isActive ? 1.2 : 0.7}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    style={{
                      strokeDasharray: '2 6',
                      animation: `${isActive ? 'dash-travel-fast' : 'dash-travel'} ${isActive ? '0.8s' : '1.8s'} linear infinite`,
                      filter: isActive ? 'drop-shadow(0 0 2px currentColor)' : undefined,
                    }}
                  />
                  <rect
                    x={rectX}
                    y={rectY}
                    width={approxWidth}
                    height={approxHeight}
                    rx={3}
                    ry={3}
                    fill="rgba(13,17,23,0.65)"
                    stroke="currentColor"
                    strokeOpacity={0.25}
                  />
                  <text
                    x={centerX}
                    y={centerY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="currentColor"
                    style={{
                      fontSize: `${l.fontSize}px`,
                      pointerEvents: 'none',
                      fontWeight: 700,
                      filter: isActive ? 'drop-shadow(0 0 1.5px currentColor)' : 'drop-shadow(0 0 0.5px rgba(0,0,0,0.35))',
                    }}
                  >
                    {labelText}
                  </text>
                </g>
              );
            })}
          </svg>
          <style>{`
            @keyframes dash-travel { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -16; } }
            @keyframes dash-travel-fast { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -10; } }
          `}</style>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
      <PieChart title="Preferred" counts={preferredCounts} />
      <PieChart title="Secondary" counts={secondaryCounts} />
      <PieChart title="Try" counts={tryCounts} />
    </div>
  );
}
