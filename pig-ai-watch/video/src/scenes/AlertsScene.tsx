/**
 * Scene 4 - Feature 2: Crushing-risk alerts (0:14.5-0:21)
 * Recreates CrushingRiskGauge + the three landing-page alert pop-ups (exact copy).
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { CircleCheck, Send, ShieldAlert, Siren, TriangleAlert } from 'lucide-react';
import { colors, fonts, motion, radii, shadows } from '../theme';
import { LightBackdrop, Pill, PingDot, Reveal, useSpringIn } from '../ui';

// CrushingRiskGauge.tsx -> TICK_LABELS + level fills
const TICKS = ['Low', 'Moderate', 'Elevated', 'High'];
const levelOf = (r: number) =>
  r < 0.25
    ? { name: 'low', fill: colors.teal400, badgeBg: '#ccfbf1', badgeFg: '#0f766e' }
    : r < 0.5
      ? { name: 'moderate', fill: colors.sky400, badgeBg: '#e0f2fe', badgeFg: '#0369a1' }
      : r < 0.75
        ? { name: 'elevated', fill: colors.amber400, badgeBg: colors.amber100, badgeFg: colors.amber700 }
        : { name: 'high', fill: colors.orange400, badgeBg: '#ffedd5', badgeFg: '#c2410c' };

const RiskCard: React.FC = () => {
  const frame = useCurrentFrame();
  const risk = interpolate(frame, [24, 84], [0.12, 0.91], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  });
  const lvl = levelOf(risk);
  const critical = risk >= 0.75;
  const pulse = critical ? 0.5 + 0.5 * Math.sin(frame / 4) : 0;

  return (
    <div
      style={{
        width: 760,
        padding: 40,
        borderRadius: radii['3xl'],
        background: colors.surface,
        border: `2px solid ${critical ? `rgba(244,63,94,${0.35 + pulse * 0.45})` : colors.border}`,
        boxShadow: critical ? `0 0 0 ${8 * pulse}px rgba(244,63,94,0.12), ${shadows.cardStrong}` : shadows.cardStrong,
        fontFamily: fonts.sans,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: radii['2xl'],
              background: critical ? colors.rose50 : colors.emerald50,
              border: `1.5px solid ${critical ? colors.rose200 : colors.emerald200}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: critical ? colors.rose600 : colors.emerald700,
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: colors.ink }}>Crushing Risk</div>
            <div style={{ fontSize: 18, color: colors.subtle, fontFamily: fonts.mono }}>Pen A-03 · SOW-01</div>
          </div>
        </div>
        <span
          style={{
            padding: '6px 18px',
            borderRadius: radii.full,
            background: lvl.badgeBg,
            color: lvl.badgeFg,
            fontWeight: 600,
            fontSize: 20,
            textTransform: 'capitalize',
          }}
        >
          {lvl.name}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 30 }}>
        <span
          style={{
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            color: critical ? colors.rose600 : colors.ink,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {Math.round(risk * 100)}%
        </span>
        <span style={{ fontSize: 24, color: colors.subtle }}>{critical ? 'Sow posture shift: rolling left' : 'Monitoring posture…'}</span>
      </div>

      <div style={{ marginTop: 28, height: 20, borderRadius: radii.full, background: '#e5e7eb', overflow: 'hidden' }}>
        <div style={{ width: `${risk * 100}%`, height: '100%', borderRadius: radii.full, background: lvl.fill }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 18, color: colors.faint }}>
        {TICKS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 28, fontSize: 19, fontWeight: 500 }}>
        <span
          style={{
            padding: '6px 14px',
            borderRadius: radii.full,
            background: critical ? colors.rose50 : colors.bgAlt,
            color: critical ? colors.rose600 : colors.subtle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <TriangleAlert size={18} /> {critical ? '1 high risk' : '0 high risk'}
        </span>
        <span style={{ padding: '6px 14px', borderRadius: radii.full, background: colors.emerald50, color: colors.emerald700 }}>
          {critical ? '9 safe' : '10 safe'}
        </span>
      </div>
    </div>
  );
};

type AlertProps = {
  at: number;
  tone: 'rose' | 'amber' | 'emerald';
  icon: React.ReactNode;
  kicker: string;
  meta: string;
  title?: string;
  body: React.ReactNode;
};

const AlertToast: React.FC<AlertProps> = ({ at, tone, icon, kicker, meta, title, body }) => {
  const p = useSpringIn(at, motion.pop);
  const t = {
    rose: { bg: colors.rose50, border: colors.rose200, fg: colors.rose600, kicker: colors.rose600, glow: shadows.rose },
    amber: { bg: colors.amber50, border: colors.amber200, fg: colors.amber500, kicker: colors.amber700, glow: shadows.card },
    emerald: { bg: colors.emerald50, border: colors.emerald200, fg: colors.emerald600, kicker: colors.emerald700, glow: shadows.card },
  }[tone];
  return (
    <div
      style={{
        opacity: Math.min(1, p * 1.4),
        transform: `translateX(${(1 - p) * 220}px) scale(${interpolate(p, [0, 1], [0.92, 1])})`,
        display: 'flex',
        gap: 20,
        alignItems: 'flex-start',
        padding: 26,
        borderRadius: radii['2xl'],
        background: 'rgba(255,255,255,0.97)',
        border: `1.5px solid ${tone === 'rose' ? colors.rose200 : colors.border}`,
        boxShadow: `${t.glow}, 0 10px 30px -12px rgba(15,23,42,0.15)`,
        fontFamily: fonts.sans,
      }}
    >
      <div
        style={{
          padding: 14,
          borderRadius: radii.xl,
          background: t.bg,
          border: `1.5px solid ${t.border}`,
          color: t.fg,
          display: 'flex',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: t.kicker,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {tone === 'rose' ? <PingDot color={colors.rose500} size={9} /> : null}
            {kicker}
          </span>
          <span style={{ fontFamily: fonts.mono, fontSize: 15, color: tone === 'amber' ? colors.emerald600 : colors.faint, fontWeight: 700 }}>
            {meta}
          </span>
        </div>
        {title ? <div style={{ fontSize: 24, fontWeight: 700, color: colors.ink, marginTop: 6 }}>{title}</div> : null}
        <div style={{ fontSize: 19, color: colors.muted, marginTop: 6, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
};

export const AlertsScene: React.FC = () => {
  return (
    <LightBackdrop>
      <AbsoluteFill style={{ fontFamily: fonts.sans }}>
        <div style={{ position: 'absolute', left: 110, top: 96 }}>
          <Reveal>
            <Pill tone="rose" size={20}>
              Real-Time Crushing Risk Alarms
            </Pill>
          </Reveal>
          <Reveal delay={8}>
            <h2 style={{ margin: '26px 0 0', fontSize: 76, fontWeight: 800, letterSpacing: '-0.035em', color: colors.ink, lineHeight: 1.04 }}>
              Warned in <span style={{ color: colors.emerald600 }}>~50ms</span>, not minutes.
            </h2>
          </Reveal>
        </div>

        <div style={{ position: 'absolute', left: 110, top: 360 }}>
          <Reveal delay={12} y={40}>
            <RiskCard />
          </Reveal>
        </div>

        <div style={{ position: 'absolute', left: 960, top: 360, width: 850, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <AlertToast
            at={78}
            tone="rose"
            icon={<Siren size={30} />}
            kicker="CRITICAL CRUSHING RISK"
            meta="~48ms"
            title="Sow Posture Shift: Rolling Left"
            body={
              <>
                Piglet <b style={{ color: colors.rose600 }}>PGL-03</b> detected in danger corridor. Ultrasonic buzzer pulse deployed.
              </>
            }
          />
          <AlertToast
            at={100}
            tone="amber"
            icon={<TriangleAlert size={30} />}
            kicker="YOLOV11 POSTURE TELEMETRY"
            meta="99.2% Conf"
            title="SOW-01: Lateral Recumbency"
            body="Safe nursing posture active · 10/10 Piglets positioned at teat zones."
          />
          <AlertToast
            at={122}
            tone="emerald"
            icon={<CircleCheck size={30} />}
            kicker="EDGE DISPATCH CONFIRMED"
            meta="NOW"
            body={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: colors.inkSoft, fontWeight: 500 }}>
                <Send size={20} color={colors.emerald600} /> Telegram &amp; Web Push Alert delivered to Barn Manager
              </span>
            }
          />
        </div>
      </AbsoluteFill>
    </LightBackdrop>
  );
};
