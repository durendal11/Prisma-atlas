/**
 * Scene 5 - Feature 3: Unified dashboard (0:20.5-0:26)
 * App shell recreated from Layout.tsx (sidebar nav + icons) and DashboardPage.tsx (gradient hero),
 * stats from the landing hero specs bar, camera names from BentoGrid.
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Bell, ChartColumn, ClipboardList, LayoutDashboard, Settings } from 'lucide-react';
import { CctvFeed } from '../components/CctvFeed';
import { CameraAiIcon, CctvIcon, FenceIcon, PigIcon, ScanEyeIcon, ScanHeartIcon } from '../icons';
import { colors, fonts, gradients, motion, radii, shadows } from '../theme';
import { GradientText, LightBackdrop, Logo, Pill, PingDot, Reveal, useSpringIn } from '../ui';

const NAV: { name: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
  { name: 'Dashboard', Icon: LayoutDashboard },
  { name: 'Live Monitoring', Icon: CctvIcon },
  { name: 'Test Pen', Icon: FenceIcon },
  { name: 'Farrowing', Icon: ScanHeartIcon },
  { name: 'Replay', Icon: ScanEyeIcon },
  { name: 'Alerts', Icon: Bell },
  { name: 'Event Logs', Icon: ClipboardList },
  { name: 'Sow Profiles', Icon: PigIcon },
  { name: 'Statistics', Icon: ChartColumn },
  { name: 'Camera Setup', Icon: CameraAiIcon },
  { name: 'Settings', Icon: Settings },
];

const W = 1640;
const H = 850;
const SIDEBAR = 290;

const useCount = (to: number, start: number, dur = 36) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + dur], [0, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
};

const Stat: React.FC<{ value: string; label: string; delay: number; accent?: boolean }> = ({ value, label, delay, accent }) => (
  <Reveal delay={delay} y={20} config={motion.pop} style={{ flex: 1 }}>
    <div
      style={{
        padding: '22px 24px',
        borderRadius: radii['2xl'],
        background: colors.surface,
        border: `1.5px solid ${colors.border}`,
        boxShadow: shadows.card,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: fonts.mono, fontSize: 42, fontWeight: 900, color: accent ? colors.emerald600 : colors.ink, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontFamily: fonts.mono, fontSize: 15, color: colors.subtle, textTransform: 'uppercase', marginTop: 4, fontWeight: 600, letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  </Reveal>
);

const CamTile: React.FC<{ name: string; crop: { x: number; y: number; w: number }; delay: number; width: number }> = ({ name, crop, delay, width }) => {
  const h = Math.round((width * 9) / 16);
  return (
    <Reveal delay={delay} y={24} scaleFrom={0.96}>
      <div style={{ borderRadius: radii['2xl'], overflow: 'hidden', border: `1.5px solid ${colors.border}`, boxShadow: shadows.card, background: colors.surface }}>
        <CctvFeed width={width} height={h} crop={crop} push={[1, 1.08]} pushFrames={[0, 165]}>
          <div style={{ position: 'absolute', top: 14, left: 14 }}>
            <Pill tone="dark" size={13}>
              Live
            </Pill>
          </div>
        </CctvFeed>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', fontFamily: fonts.mono, fontSize: 17, color: colors.inkSoft }}>
          <span>{name}</span>
          <span style={{ color: colors.emerald700, fontWeight: 700 }}>1080p</span>
        </div>
      </div>
    </Reveal>
  );
};

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = useSpringIn(0, { damping: 200 }, 40);
  const tilt = interpolate(enter, [0, 1], [22, 0]);
  const drift = interpolate(frame, [0, 165], [1, 1.035]);

  const ms = useCount(50, 34);
  const acc = useCount(99.2, 40);
  const postures = useCount(6, 46, 24);

  return (
    <LightBackdrop>
      <AbsoluteFill style={{ fontFamily: fonts.sans, alignItems: 'center' }}>
        <Reveal delay={4} style={{ marginTop: 56 }}>
          <div style={{ fontSize: 50, fontWeight: 800, letterSpacing: '-0.03em', color: colors.ink, textAlign: 'center' }}>
            One dashboard for <GradientText gradient={gradients.headline}>every farrowing crate.</GradientText>
          </div>
        </Reveal>

        <div style={{ position: 'absolute', top: 175, perspective: 2200 }}>
          <div
            style={{
              width: W,
              height: H,
              borderRadius: radii['3xl'],
              overflow: 'hidden',
              background: colors.bg,
              border: `1.5px solid ${colors.border}`,
              boxShadow: shadows.cardStrong,
              opacity: enter,
              transform: `translateY(${(1 - enter) * 160}px) rotateX(${tilt}deg) scale(${drift})`,
              transformOrigin: '50% 0%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Browser chrome */}
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
              {['#f87171', '#fbbf24', '#34d399'].map((c) => (
                <span key={c} style={{ width: 13, height: 13, borderRadius: radii.full, background: c }} />
              ))}
              <div
                style={{
                  marginLeft: 24,
                  padding: '5px 18px',
                  borderRadius: radii.full,
                  background: colors.bgAlt,
                  fontFamily: fonts.mono,
                  fontSize: 15,
                  color: colors.subtle,
                }}
              >
                prisma-atlas / dashboard
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex' }}>
              {/* Sidebar (Layout.tsx) */}
              <div style={{ width: SIDEBAR, background: colors.surface, borderRight: `1px solid ${colors.border}`, padding: '22px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 22px' }}>
                  <Logo size={42} />
                  <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '0.04em' }}>
                    <GradientText gradient={gradients.wordmark}>PRISMA ATLAS</GradientText>
                  </span>
                </div>
                {NAV.map(({ name, Icon }, i) => {
                  const active = i === 0;
                  return (
                    <Reveal key={name} delay={12 + i * 3} x={-20} y={0}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '11px 14px',
                          borderRadius: radii.xl,
                          marginBottom: 3,
                          fontSize: 18,
                          fontWeight: active ? 600 : 500,
                          color: active ? colors.primary700 : colors.muted,
                          background: active ? '#e8f5e9' : 'transparent',
                        }}
                      >
                        <Icon size={21} color={active ? colors.primary600 : colors.faint} />
                        {name}
                        {name === 'Alerts' ? (
                          <span
                            style={{
                              marginLeft: 'auto',
                              minWidth: 26,
                              padding: '1px 8px',
                              borderRadius: radii.full,
                              background: colors.red500,
                              color: '#fff',
                              fontSize: 14,
                              fontWeight: 700,
                              textAlign: 'center',
                              opacity: frame > 70 ? 1 : 0,
                            }}
                          >
                            1
                          </span>
                        ) : null}
                      </div>
                    </Reveal>
                  );
                })}
              </div>

              {/* Main */}
              <div style={{ flex: 1, padding: 30, display: 'flex', flexDirection: 'column', gap: 22 }}>
                {/* DashboardPage hero banner */}
                <Reveal delay={14} y={16}>
                  <div
                    style={{
                      borderRadius: radii['2xl'],
                      padding: '24px 30px',
                      background: gradients.dashboardHero,
                      color: '#fff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: shadows.glow,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>Dashboard</div>
                      <div style={{ fontSize: 18, opacity: 0.9, marginTop: 2 }}>Smart Farrowing Pen Monitoring</div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 16px',
                        borderRadius: radii.full,
                        background: 'rgba(255,255,255,0.18)',
                        fontFamily: fonts.mono,
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      <PingDot color="#fff" size={9} /> 4 CAMERAS ONLINE
                    </div>
                  </div>
                </Reveal>

                {/* Landing hero specs bar */}
                <div style={{ display: 'flex', gap: 18 }}>
                  <Stat value={`~${Math.round(ms)}ms`} label="Alert Response" delay={28} accent />
                  <Stat value={`${acc.toFixed(1)}%`} label="Detection Accuracy" delay={34} accent />
                  <Stat value={`${Math.round(postures)} Postures`} label="Sow Posture Classes" delay={40} />
                  <Stat value="24/7" label="Live Camera Feeds" delay={46} />
                </div>

                {/* Camera grid (BentoGrid multi-camera card names) */}
                <div style={{ display: 'flex', gap: 18 }}>
                  <CamTile name="Cam #01 (Farrowing)" crop={{ x: 300, y: 540, w: 640 }} delay={54} width={420} />
                  <CamTile name="Cam #02 (Gestation)" crop={{ x: 0, y: 470, w: 520 }} delay={62} width={420} />
                  <Reveal delay={70} y={24} style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 286,
                        borderRadius: radii['2xl'],
                        background: colors.surface,
                        border: `1.5px solid ${colors.border}`,
                        boxShadow: shadows.card,
                        padding: 22,
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 600, color: colors.ink, marginBottom: 14 }}>Recent Alerts</div>
                      {[
                        { t: 'Crushing risk · Pen A-03', c: colors.rose500, time: 'now' },
                        { t: 'Lateral recumbency · SOW-01', c: colors.amber500, time: '2m' },
                        { t: 'Telegram dispatched', c: colors.emerald500, time: '2m' },
                      ].map((a, i) => (
                        <Reveal key={a.t} delay={80 + i * motion.stagger} x={24} y={0}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '11px 0',
                              borderTop: i ? `1px solid ${colors.bgAlt}` : 'none',
                              fontSize: 17,
                              color: colors.inkSoft,
                            }}
                          >
                            <span style={{ width: 10, height: 10, borderRadius: radii.full, background: a.c }} />
                            <span style={{ flex: 1 }}>{a.t}</span>
                            <span style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.faint }}>{a.time}</span>
                          </div>
                        </Reveal>
                      ))}
                    </div>
                  </Reveal>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </LightBackdrop>
  );
};
