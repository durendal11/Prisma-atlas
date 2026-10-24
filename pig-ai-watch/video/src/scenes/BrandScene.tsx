/**
 * Scene 2 - Brand reveal (0:04-0:09)
 * Logo pop, landing-page pill, hero headline with the real typed words.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts, gradients, motion } from '../theme';
import { GradientText, LightBackdrop, Logo, Pill, Reveal, useSpringIn, Wordmark } from '../ui';

// frontend/src/pages/LandingPage.tsx -> TYPED_HEADER_WORDS[0]
const TYPED = 'In Real Time.';

export const BrandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpringIn(4, motion.pop);
  const typeStart = 52;
  const chars = Math.max(0, Math.min(TYPED.length, Math.floor((frame - typeStart) / 2.2)));
  const caretOn = Math.floor(frame / 15) % 2 === 0 || (frame > typeStart && chars < TYPED.length);

  return (
    <LightBackdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: fonts.sans }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 44 }}>
          <div
            style={{
              transform: `scale(${logo}) rotate(${interpolate(logo, [0, 1], [-25, 0])}deg)`,
            }}
          >
            <Logo size={112} />
          </div>
          <Reveal delay={14} x={-30} y={0}>
            <Wordmark size={64} />
          </Reveal>
        </div>

        <Reveal delay={24}>
          <Pill size={22}>Piglet Crushing Prevention &amp; Monitoring</Pill>
        </Reveal>

        <Reveal delay={34} style={{ marginTop: 40 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 132,
              fontWeight: 900,
              letterSpacing: '-0.045em',
              lineHeight: 1.02,
              color: colors.ink,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Protect Piglets.{' '}
            <GradientText gradient={gradients.headline}>{TYPED.slice(0, chars)}</GradientText>
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: '0.8em',
                marginLeft: 10,
                background: colors.emerald600,
                transform: 'translateY(6px)',
                opacity: caretOn ? 1 : 0,
              }}
            />
          </h1>
        </Reveal>

        <Reveal delay={84} style={{ marginTop: 36 }}>
          <p style={{ margin: 0, fontSize: 34, color: colors.muted, textAlign: 'center', fontWeight: 400 }}>
            <b style={{ color: colors.ink }}>P</b>iglet <b style={{ color: colors.ink }}>R</b>ealtime{' '}
            <b style={{ color: colors.ink }}>I</b>dentification and <b style={{ color: colors.ink }}>S</b>ow{' '}
            <b style={{ color: colors.ink }}>M</b>onitoring <b style={{ color: colors.ink }}>A</b>ssistant
          </p>
        </Reveal>
      </AbsoluteFill>
    </LightBackdrop>
  );
};
