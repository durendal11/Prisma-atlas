import React from 'react';
import { Composition } from 'remotion';
import { Promo, PROMO_DURATION, PromoProps } from './Promo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PrismaAtlasPromo"
      component={Promo}
      durationInFrames={PROMO_DURATION}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ music: '' } satisfies PromoProps}
    />
  );
};
