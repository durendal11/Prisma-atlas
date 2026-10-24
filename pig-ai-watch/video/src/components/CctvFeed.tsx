/**
 * A cropped, slowly-pushing CCTV feed built from public/farm.png.
 * Bounding boxes are given in SOURCE image pixels (1024x1024) and mapped into the crop,
 * so they stay locked to the animals while the camera pushes in.
 */
import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { colors, fonts } from '../theme';

const SRC = 1024;

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  /** frame at which the box starts drawing */
  at: number;
  big?: boolean;
};

export const CctvFeed: React.FC<{
  width: number;
  height: number;
  /** crop window in source pixels (left, top, width); height follows the aspect ratio */
  crop: { x: number; y: number; w: number };
  boxes?: Box[];
  push?: [number, number];
  pushFrames?: [number, number];
  filter?: string;
  children?: React.ReactNode;
}> = ({ width, height, crop, boxes = [], push = [1, 1.06], pushFrames = [0, 200], filter, children }) => {
  const frame = useCurrentFrame();
  const s = width / crop.w;
  const zoom = interpolate(frame, pushFrames, push, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', background: colors.night }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '50% 55%' }}>
        <Img
          src={staticFile('farm.png')}
          style={{
            position: 'absolute',
            width: SRC * s,
            height: SRC * s,
            left: -crop.x * s,
            top: -crop.y * s,
            maxWidth: 'none',
            filter: filter ?? 'saturate(0.9) brightness(0.95) contrast(1.05)',
          }}
        />
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {boxes.map((b, i) => {
            const p = interpolate(frame, [b.at, b.at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const x = (b.x - crop.x) * s;
            const y = (b.y - crop.y) * s;
            const w = b.w * s;
            const h = b.h * s;
            return (
              <g key={i} opacity={p > 0 ? 1 : 0}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={4}
                  fill={b.color}
                  fillOpacity={0.08 * p}
                  stroke={b.color}
                  strokeWidth={b.big ? 3.5 : 2.5}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - p}
                />
              </g>
            );
          })}
        </svg>
        {boxes.map((b, i) => {
          const p = interpolate(frame, [b.at + 8, b.at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: (b.x - crop.x) * s - 1.5,
                top: (b.y - crop.y) * s - (b.big ? 38 : 28),
                padding: b.big ? '4px 12px' : '2px 7px',
                background: b.color,
                color: colors.night,
                fontFamily: fonts.mono,
                fontWeight: 800,
                fontSize: b.big ? 20 : 14,
                borderRadius: 4,
                whiteSpace: 'nowrap',
                opacity: p,
                transform: `translateY(${(1 - p) * 6}px)`,
              }}
            >
              {b.label}
            </div>
          );
        })}
      </div>
      {/* scanlines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 2px, transparent 4px)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
};
