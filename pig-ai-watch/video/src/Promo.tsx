/**
 * PRISMA ATLAS - 30s promo (1920x1080 @ 30fps = 900 frames)
 *
 *  Scene             len   transition out
 *  1 Hook            135   fade 15
 *  2 Brand           150   slide-from-right 15
 *  3 Detection       195   slide-from-right 15
 *  4 Alerts          195   slide-from-bottom 15
 *  5 Dashboard       165   fade 15
 *  6 CTA             135
 *  -----------------------------------------------
 *  975 - 5 x 15 overlap = 900 frames (30.0s)
 */
import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { linearTiming, springTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { HookScene } from './scenes/HookScene';
import { BrandScene } from './scenes/BrandScene';
import { DetectionScene } from './scenes/DetectionScene';
import { AlertsScene } from './scenes/AlertsScene';
import { DashboardScene } from './scenes/DashboardScene';
import { CtaScene } from './scenes/CtaScene';
import { colors } from './theme';

export const SCENES = {
  hook: 135,
  brand: 150,
  detection: 195,
  alerts: 195,
  dashboard: 165,
  cta: 135,
};
export const TRANSITION = 15;
export const PROMO_DURATION =
  Object.values(SCENES).reduce((a, b) => a + b, 0) - (Object.keys(SCENES).length - 1) * TRANSITION;

export type PromoProps = {
  /** Optional music file in /public, e.g. "audio/music.mp3". Leave empty for a silent render. */
  music?: string;
};

const springT = springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION });
const linearT = linearTiming({ durationInFrames: TRANSITION });

export const Promo: React.FC<PromoProps> = ({ music }) => {
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENES.hook}>
          <HookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearT} />

        <TransitionSeries.Sequence durationInFrames={SCENES.brand}>
          <BrandScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={springT} />

        <TransitionSeries.Sequence durationInFrames={SCENES.detection}>
          <DetectionScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={springT} />

        <TransitionSeries.Sequence durationInFrames={SCENES.alerts}>
          <AlertsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-bottom' })} timing={springT} />

        <TransitionSeries.Sequence durationInFrames={SCENES.dashboard}>
          <DashboardScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearT} />

        <TransitionSeries.Sequence durationInFrames={SCENES.cta}>
          <CtaScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {music ? <Audio src={staticFile(music)} volume={(f) => Math.min(1, f / 15, (PROMO_DURATION - f) / 30) * 0.8} /> : null}
    </AbsoluteFill>
  );
};
