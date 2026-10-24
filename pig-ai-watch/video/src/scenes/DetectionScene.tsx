/**
 * Scene 3 - Feature 1: YOLOv11 detection (0:08.5-0:15)
 * Real copy from the landing "LIVE SYSTEM DEMO" section + BentoGrid detector card.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Box, CctvFeed } from '../components/CctvFeed';
import { colors, fonts, motion, radii, shadows } from '../theme';
import { LightBackdrop, Pill, Reveal, useSpringIn } from '../ui';

const FRAME_W = 1040;
const FRAME_H = 585;

// Crop window over farm.png focused on the nursing pen (source px)
const CROP = { x: 250, y: 500, w: 650 };

const PIGLET = colors.sky400;
const BOXES: Box[] = [
  { x: 430, y: 628, w: 200, h: 82, label: 'sow-stand 99.2%', color: colors.emerald400, at: 30, big: true },
  { x: 498, y: 684, w: 26, h: 40, label: 'piglet .97', color: PIGLET, at: 50 },
  { x: 528, y: 688, w: 24, h: 38, label: 'piglet .96', color: PIGLET, at: 56 },
  { x: 556, y: 690, w: 24, h: 38, label: 'piglet .98', color: PIGLET, at: 62 },
  { x: 584, y: 688, w: 26, h: 38, label: 'piglet .95', color: PIGLET, at: 68 },
  { x: 614, y: 684, w: 30, h: 36, label: 'piglet .97', color: PIGLET, at: 74 },
  { x: 640, y: 680, w: 32, h: 34, label: 'piglet .94', color: PIGLET, at: 80 },
];

// BentoGrid: "classifies 5 sow postures" + piglet = 6 classes
const CLASSES = ['sow-stand', 'sow-stand-feed', 'sow-sit', 'sow-sleep', 'sow-sleep-lactate', 'piglet'];

export const DetectionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = useSpringIn(6, motion.smooth);
  const pigletCount = BOXES.slice(1).filter((b) => frame >= b.at + 8).length;
  const scan = interpolate(frame, [14, 50], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <LightBackdrop>
      <AbsoluteFill style={{ fontFamily: fonts.sans }}>
        {/* Left copy column */}
        <div style={{ position: 'absolute', left: 110, top: 250, width: 640 }}>
          <Reveal delay={0}>
            <Pill size={20}>Live System Demo</Pill>
          </Reveal>
          <Reveal delay={8}>
            <h2 style={{ margin: '30px 0 0', fontSize: 76, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, color: colors.ink }}>
              AI that watches <span style={{ color: colors.emerald600 }}>every crate.</span>
            </h2>
          </Reveal>
          <Reveal delay={16}>
            <p style={{ margin: '26px 0 0', fontSize: 27, lineHeight: 1.5, color: colors.muted }}>
              Real-time YOLOv11 detection classifies sow posture and tracks every piglet, live on your camera feed.
            </p>
          </Reveal>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 34 }}>
            {CLASSES.map((c, i) => {
              const active = c === 'sow-stand' && frame > 40;
              const isPiglet = c === 'piglet' && frame > 58;
              return (
                <Reveal key={c} delay={30 + i * motion.stagger} y={14} config={motion.pop}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontFamily: fonts.mono,
                      fontSize: 19,
                      fontWeight: 700,
                      padding: '8px 16px',
                      borderRadius: radii.full,
                      background: active ? colors.emerald600 : isPiglet ? '#e0f2fe' : colors.surface,
                      color: active ? '#fff' : isPiglet ? '#0369a1' : colors.inkSoft,
                      border: `1.5px solid ${active ? colors.emerald600 : isPiglet ? '#7dd3fc' : colors.border}`,
                      boxShadow: active ? shadows.cta : 'none',
                    }}
                  >
                    {c}
                  </span>
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* CCTV player (landing demo player styling) */}
        <div
          style={{
            position: 'absolute',
            left: 790,
            top: (1080 - FRAME_H) / 2,
            perspective: 1800,
          }}
        >
          <div
            style={{
              borderRadius: radii['3xl'],
              overflow: 'hidden',
              border: `1.5px solid ${colors.border}`,
              boxShadow: shadows.cardStrong,
              opacity: enter,
              transform: `translateX(${(1 - enter) * 120}px) rotateY(${(1 - enter) * -14}deg) scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
            }}
          >
            <CctvFeed width={FRAME_W} height={FRAME_H} crop={CROP} boxes={BOXES} push={[1, 1.07]} pushFrames={[0, 195]}>
              {/* Top telemetry overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  padding: '22px 26px 50px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'linear-gradient(180deg, rgba(2,6,23,0.85) 0%, rgba(2,6,23,0.4) 60%, transparent 100%)',
                  fontFamily: fonts.mono,
                  color: '#fff',
                  fontSize: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Pill tone="dark" size={16}>
                    Live Demo Stream
                  </Pill>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>YOLOv11 Inference • 1080p 60fps</span>
                </div>
                <span
                  style={{
                    padding: '6px 14px',
                    borderRadius: radii.full,
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.85)',
                  }}
                >
                  Inference: ~48ms
                </span>
              </div>

              {/* Bottom telemetry (landing HUD bar copy) */}
              <div
                style={{
                  position: 'absolute',
                  left: 22,
                  bottom: 22,
                  display: 'flex',
                  gap: 12,
                  fontFamily: fonts.mono,
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {[
                  { k: 'Sow', v: frame > 44 ? 'Standing (99.2%)' : 'Detecting…' },
                  { k: 'Piglets', v: `${pigletCount} Active` },
                ].map((t) => (
                  <span
                    key={t.k}
                    style={{
                      padding: '8px 14px',
                      borderRadius: radii.xl,
                      background: 'rgba(255,255,255,0.92)',
                      color: colors.inkSoft,
                    }}
                  >
                    {t.k}: <b style={{ color: colors.emerald700 }}>{t.v}</b>
                  </span>
                ))}
              </div>

              {/* Initial AI scan sweep */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${scan}%`,
                  height: 3,
                  background: colors.emerald400,
                  boxShadow: '0 0 30px 10px rgba(52,211,153,0.45)',
                  opacity: scan > 0 && scan < 100 ? 1 : 0,
                }}
              />
            </CctvFeed>
          </div>
        </div>
      </AbsoluteFill>
    </LightBackdrop>
  );
};
