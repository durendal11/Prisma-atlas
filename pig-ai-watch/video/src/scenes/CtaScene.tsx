/**
 * Scene 6 - CTA (0:25.5-0:30)
 * Real hero CTAs: "Install Prisma App" + "Launch Web Dashboard", with a cursor click.
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Download, Globe } from 'lucide-react';
import { colors, fonts, gradients, motion, radii, shadows } from '../theme';
import { Cursor, GradientText, LightBackdrop, Logo, Reveal, useSpringIn, Wordmark } from '../ui';

const CLICK = 82;

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpringIn(0, motion.pop);

  // Cursor glides in, presses the primary CTA, releases
  const t = interpolate(frame, [44, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.33, 0, 0.15, 1) });
  const cx = interpolate(t, [0, 1], [1480, 820]);
  const cy = interpolate(t, [0, 1], [1010, 700]);
  const press = interpolate(frame, [CLICK, CLICK + 4, CLICK + 10], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ripple = interpolate(frame, [CLICK, CLICK + 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const installed = frame >= CLICK + 6;
  const hover = t > 0.85;

  return (
    <LightBackdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: fonts.sans }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, transform: `scale(${logo})` }}>
          <Logo size={96} />
          <Wordmark size={54} />
        </div>

        <Reveal delay={10} style={{ marginTop: 46 }}>
          <h2 style={{ margin: 0, fontSize: 118, fontWeight: 900, letterSpacing: '-0.045em', color: colors.ink, lineHeight: 1.02, textAlign: 'center' }}>
            Protect Piglets. <GradientText gradient={gradients.headline}>Zero Crushing.</GradientText>
          </h2>
        </Reveal>

        <Reveal delay={20} style={{ marginTop: 28 }}>
          <p style={{ margin: 0, fontSize: 32, color: colors.muted, textAlign: 'center' }}>
            Tracks sow posture 24/7 and alerts caretakers before piglets get crushed.
          </p>
        </Reveal>

        <div style={{ display: 'flex', gap: 24, marginTop: 56 }}>
          <Reveal delay={30} y={20} config={motion.pop}>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '26px 52px',
                  borderRadius: radii.full,
                  background: hover ? colors.emerald500 : colors.emerald600,
                  color: '#fff',
                  fontSize: 30,
                  fontWeight: 700,
                  boxShadow: shadows.cta,
                  transform: `scale(${(hover ? 1.05 : 1) - press * 0.06})`,
                }}
              >
                <Download size={30} /> {installed ? 'App Installed' : 'Install Prisma App'}
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: radii.full,
                  border: `3px solid ${colors.emerald400}`,
                  opacity: ripple > 0 ? 1 - ripple : 0,
                  transform: `scale(${1 + ripple * 0.35})`,
                }}
              />
            </div>
          </Reveal>
          <Reveal delay={36} y={20} config={motion.pop}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '26px 52px',
                borderRadius: radii.full,
                border: '2px solid #cbd5e1',
                background: 'rgba(255,255,255,0.7)',
                color: colors.inkSoft,
                fontSize: 30,
                fontWeight: 600,
              }}
            >
              <Globe size={30} /> Launch Web Dashboard
            </div>
          </Reveal>
        </div>

        <Reveal delay={48} style={{ marginTop: 54 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 21, color: colors.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            PWA · macOS &amp; Windows Edge · RTSP / WebRTC / HLS
          </div>
        </Reveal>
      </AbsoluteFill>
      {frame >= 44 ? <Cursor x={cx} y={cy} pressed={press} /> : null}
    </LightBackdrop>
  );
};
