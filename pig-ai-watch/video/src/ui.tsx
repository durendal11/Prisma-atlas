/**
 * Shared motion + UI primitives. Everything is frame-driven (no CSS animations),
 * so renders are deterministic.
 */
import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts, motion, radii } from './theme';

type SpringCfg = { damping?: number; stiffness?: number; mass?: number };

/** 0 -> 1 spring that starts at `delay` frames. */
export const useSpringIn = (delay = 0, config: SpringCfg = motion.smooth, durationInFrames?: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config, durationInFrames });
};

/** Fade + rise + de-blur entrance. */
export const Reveal: React.FC<{
  delay?: number;
  y?: number;
  x?: number;
  scaleFrom?: number;
  config?: SpringCfg;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, y = 28, x = 0, scaleFrom = 1, config = motion.smooth, style, children }) => {
  const p = useSpringIn(delay, config);
  return (
    <div
      style={{
        opacity: interpolate(p, [0, 1], [0, 1]),
        transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px) scale(${interpolate(p, [0, 1], [scaleFrom, 1])})`,
        filter: `blur(${(1 - Math.min(p, 1)) * 8}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Animated "ping" dot used across the landing page (animate-ping equivalent). */
export const PingDot: React.FC<{ color?: string; size?: number; period?: number }> = ({
  color = colors.emerald500,
  size = 10,
  period = 36,
}) => {
  const frame = useCurrentFrame();
  const t = (frame % period) / period;
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block', flexShrink: 0 }}>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radii.full,
          background: color,
          opacity: 0.75 * (1 - t),
          transform: `scale(${1 + t * 1.6})`,
        }}
      />
      <span style={{ position: 'absolute', inset: 0, borderRadius: radii.full, background: color }} />
    </span>
  );
};

/** Emerald mono pill: "PIGLET CRUSHING PREVENTION & MONITORING" style. */
export const Pill: React.FC<{ children: React.ReactNode; tone?: 'emerald' | 'rose' | 'dark'; dot?: boolean; size?: number }> = ({
  children,
  tone = 'emerald',
  dot = true,
  size = 20,
}) => {
  const palette = {
    emerald: { bg: colors.emerald50, border: colors.emerald200, fg: colors.emerald800, dot: colors.emerald500 },
    rose: { bg: colors.rose50, border: colors.rose200, fg: colors.rose600, dot: colors.rose500 },
    dark: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.45)', fg: colors.emerald300, dot: colors.emerald400 },
  }[tone];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.6,
        padding: `${size * 0.5}px ${size * 1.05}px`,
        borderRadius: radii.full,
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        color: palette.fg,
        fontFamily: fonts.mono,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {dot ? <PingDot color={palette.dot} size={size * 0.5} /> : null}
      {children}
    </div>
  );
};

/** Light landing-page backdrop: slate-50, dot grid, two slow emerald glows. */
export const LightBackdrop: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 60) * 40;
  return (
    <AbsoluteFill style={{ background: colors.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${colors.border} 1.6px, transparent 1.6px)`,
          backgroundSize: '36px 36px',
          backgroundPosition: `${frame * 0.25}px ${frame * 0.15}px`,
          opacity: 0.8,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1100,
          height: 1100,
          left: -260 + drift,
          top: -520,
          borderRadius: radii.full,
          background: `radial-gradient(circle, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0) 65%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1000,
          height: 1000,
          right: -300 - drift,
          bottom: -560,
          borderRadius: radii.full,
          background: `radial-gradient(circle, rgba(52,211,153,0.14) 0%, rgba(52,211,153,0) 65%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** Pink geometric pig logo (frontend/public/2.png) + PRISMA ATLAS wordmark. */
export const Logo: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 96, style }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: colors.surface,
      border: `1.5px solid ${colors.border}`,
      boxShadow: '0 18px 40px -16px rgba(224,127,126,0.55), 0 6px 14px -8px rgba(15,23,42,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      ...style,
    }}
  >
    <Img src={staticFile('logo.png')} style={{ width: size * 1.25, height: size * 1.25, objectFit: 'contain' }} />
  </div>
);

export const Wordmark: React.FC<{ size?: number; color?: string }> = ({ size = 56, color = colors.ink }) => (
  <span style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: size, letterSpacing: '0.06em', color }}>
    PRISMA <span style={{ color: colors.emerald600 }}>ATLAS</span>
  </span>
);

/** macOS-style pointer used for the CTA click. */
export const Cursor: React.FC<{ x: number; y: number; pressed?: number }> = ({ x, y, pressed = 0 }) => (
  <svg
    width={44}
    height={44}
    viewBox="0 0 24 24"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `scale(${1 - pressed * 0.15})`,
      transformOrigin: 'top left',
      filter: 'drop-shadow(0 6px 10px rgba(15,23,42,0.35))',
      zIndex: 50,
    }}
  >
    <path d="M4 2.5 L4 19 L8.6 14.8 L11.6 21.5 L14.4 20.3 L11.5 13.7 L17.8 13.4 Z" fill={colors.ink} stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

/** Gradient headline text (bg-clip-text from-slate-900 via-slate-800 to-emerald-600). */
export const GradientText: React.FC<{ children: React.ReactNode; gradient: string }> = ({ children, gradient }) => (
  <span
    style={{
      backgroundImage: gradient,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
    }}
  >
    {children}
  </span>
);
