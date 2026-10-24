/**
 * Scene 1 - Hook (0:00-0:04.5)
 * Night-time barn CCTV. Sets up the problem in two lines.
 */
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { colors, fonts } from '../theme';
import { PingDot, Reveal } from '../ui';

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 135], [1.08, 1.22]);
  const clock = `02:14:${String(8 + Math.floor(frame / 30)).padStart(2, '0')}`;
  // Emerald AI scan line sweeps down at the end, handing off to the brand scene
  const scanY = interpolate(frame, [100, 135], [-10, 110], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: colors.night, overflow: 'hidden' }}>
      <Img
        src={staticFile('farm.png')}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: '50% 62%',
          transform: `scale(${zoom})`,
          filter: 'saturate(0.55) brightness(0.62) contrast(1.1)',
        }}
      />
      {/* Vignette + left fade for text legibility */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.65) 45%, rgba(2,6,23,0.15) 100%), radial-gradient(ellipse at center, transparent 40%, rgba(2,6,23,0.7) 100%)',
        }}
      />
      {/* CCTV scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 2px, transparent 4px)',
        }}
      />

      {/* CCTV HUD */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 72,
          right: 72,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: fonts.mono,
          fontSize: 24,
          color: 'rgba(255,255,255,0.75)',
          letterSpacing: '0.08em',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <PingDot color={colors.rose500} size={14} period={30} />
          <span style={{ color: colors.rose200, fontWeight: 700 }}>REC</span>
          <span>CAM #01 (FARROWING)</span>
        </div>
        <span>{clock}</span>
      </div>

      {/* Copy */}
      <div style={{ position: 'absolute', left: 120, top: 360, fontFamily: fonts.sans, color: '#fff' }}>
        <Reveal delay={8}>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            The sow lies down.
          </div>
        </Reveal>
        <Reveal delay={42}>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 12 }}>
            Her piglets have <span style={{ color: colors.rose500 }}>seconds.</span>
          </div>
        </Reveal>
        <Reveal delay={72}>
          <div style={{ fontSize: 34, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: 36, maxWidth: 900, lineHeight: 1.4 }}>
            And nobody is watching the crate at 2 AM.
          </div>
        </Reveal>
      </div>

      {/* AI scan sweep */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${scanY}%`,
          height: 4,
          background: colors.emerald400,
          boxShadow: `0 0 40px 12px rgba(52,211,153,0.55)`,
          opacity: frame > 100 ? 1 : 0,
        }}
      />
    </AbsoluteFill>
  );
};
