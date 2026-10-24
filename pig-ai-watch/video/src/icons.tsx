/**
 * Product icons, copied 1:1 from frontend/src/components/icons/index.tsx
 * (sourced via Better Icons: tabler + lucide sets) so the video matches the app sidebar.
 */
import React from 'react';

type IconProps = { size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties };

const Base: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  style,
  children,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    {children}
  </svg>
);

/** tabler:pig */
export const PigIcon: React.FC<IconProps> = (p) => (
  <Base {...p}>
    <path d="M15 11v.01M16 3v3.803A6.02 6.02 0 0 1 18.658 10h1.341a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1.342a6 6 0 0 1-1.658 2.473V18.5a1.5 1.5 0 0 1-3 0v-.583a6 6 0 0 1-1 .083h-4a6 6 0 0 1-1-.083v.583a1.5 1.5 0 0 1-3 0v-2.027A6 6 0 0 1 8.999 6h2.5z" />
  </Base>
);

/** tabler:fence */
export const FenceIcon: React.FC<IconProps> = (p) => (
  <Base {...p}>
    <path d="M4 12v4h16v-4zm2 4v4h4v-4m0-4V6L8 4L6 6v6m8 4v4h4v-4m0-4V6l-2-2l-2 2v6" />
  </Base>
);

/** tabler:device-cctv */
export const CctvIcon: React.FC<IconProps> = (p) => (
  <Base {...p}>
    <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm5 10a4 4 0 1 0 8 0a4 4 0 1 0-8 0" />
    <path d="M19 7v7a7 7 0 0 1-14 0V7m7 7h.01" />
  </Base>
);

/** lucide:scan-heart */
export const ScanHeartIcon: React.FC<IconProps> = (p) => (
  <Base {...p}>
    <path d="M17 3h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M3 7V5a2 2 0 0 1 2-2h2m0 18H5a2 2 0 0 1-2-2v-2m4.828-3.93A3 3 0 0 1 12 8.764a3 3 0 0 1 4.172 4.306l-3.447 3.62a1 1 0 0 1-1.449 0z" />
  </Base>
);

/** lucide:scan-eye */
export const ScanEyeIcon: React.FC<IconProps> = (p) => (
  <Base {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="1.5" fill={p.color ?? 'currentColor'} />
    <path d="M18.944 12.33a1 1 0 0 0 0-.66a7.5 7.5 0 0 0-13.888 0a1 1 0 0 0 0 .66a7.5 7.5 0 0 0 13.888 0" />
  </Base>
);

/** tabler:camera-ai */
export const CameraAiIcon: React.FC<IconProps> = (p) => (
  <Base {...p}>
    <path d="M10 20H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v2" />
    <path d="M14.362 11.15a3 3 0 1 0-4.144 4.263M14 21v-4a2 2 0 1 1 4 0v4m-4-2h4m3-4v6" />
  </Base>
);
