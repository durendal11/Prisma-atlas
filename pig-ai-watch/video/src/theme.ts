/**
 * Brand tokens for the PRISMA ATLAS promo.
 *
 * Every value here is lifted from the app itself so the video looks like the product:
 *  - frontend/tailwind.config.js  (primary green scale, shadows, Inter font)
 *  - frontend/src/pages/LandingPage.tsx  (slate + emerald light theme, pills, radii)
 *  - frontend/src/components/AlertCard.tsx / CrushingRiskGauge.tsx  (alert + risk colours)
 *  - frontend/public/2.png  (pink geometric pig logo)
 *
 * Change colours here and every scene updates.
 */
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily: interFamily } = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
});

export const fonts = {
  /** tailwind.config.js -> fontFamily.sans = ['Inter', ...] */
  sans: `${interFamily}, system-ui, sans-serif`,
  /** Tailwind's default `font-mono` stack, used for telemetry / HUD text on the landing page */
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};

export const colors = {
  // Landing page light theme (bg-slate-50, text-slate-900, emerald accents)
  bg: '#f8fafc', // slate-50
  bgAlt: '#f1f5f9', // slate-100
  surface: '#ffffff',
  border: '#e2e8f0', // slate-200
  ink: '#0f172a', // slate-900 (also the app's theme-color meta tag)
  inkSoft: '#1e293b', // slate-800
  muted: '#475569', // slate-600
  subtle: '#64748b', // slate-500
  faint: '#94a3b8', // slate-400
  night: '#020617', // slate-950 (demo video player / CCTV frame)

  emerald50: '#ecfdf5',
  emerald200: '#a7f3d0',
  emerald300: '#6ee7b7',
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669', // primary CTA colour on the landing page
  emerald700: '#047857',
  emerald800: '#065f46',

  // App dashboard primary scale (tailwind.config.js -> colors.primary)
  primary400: '#66BB6A',
  primary500: '#4CAF50',
  primary600: '#43A047',
  primary700: '#388E3C',

  // Alert severities (AlertCard / landing alert pop-ups)
  rose50: '#fff1f2',
  rose200: '#fecdd3',
  rose500: '#f43f5e',
  rose600: '#e11d48',
  red500: '#ef4444',
  red100: '#fee2e2',
  red700: '#b91c1c',
  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber700: '#b45309',
  yellow50: '#fefce8',
  yellow600: '#ca8a04',

  // CrushingRiskGauge level fills
  teal400: '#2dd4bf',
  sky400: '#38bdf8',
  orange400: '#fb923c',
  orange600: '#ea580c',

  // Logo (frontend/public/2.png)
  logoPink: '#F4A09C',
  logoRose: '#E07F7E',
  logoSnout: '#A86060',
};

export const radii = {
  lg: 8,
  xl: 12, // rounded-xl
  '2xl': 16, // rounded-2xl (cards, HUD bars)
  '3xl': 24, // rounded-3xl (bento cards, installer card)
  full: 9999, // pills / CTA buttons
};

export const shadows = {
  // shadow-xl shadow-slate-200/60
  card: '0 20px 25px -5px rgba(226,232,240,0.6), 0 8px 10px -6px rgba(226,232,240,0.6)',
  cardStrong: '0 30px 60px -12px rgba(15,23,42,0.18), 0 18px 36px -18px rgba(15,23,42,0.22)',
  // tailwind.config.js boxShadow.glow / glow-lg (rgba(76,175,80,...))
  glow: '0 0 20px rgba(76,175,80,0.4)',
  glowLg: '0 0 30px rgba(76,175,80,0.5)',
  // shadow-xl shadow-emerald-600/25 on the "Install Prisma App" button
  cta: '0 20px 25px -5px rgba(5,150,105,0.25), 0 8px 10px -6px rgba(5,150,105,0.25)',
  rose: '0 20px 25px -5px rgba(244,63,94,0.12)',
};

/** Gradients used in the app */
export const gradients = {
  // DashboardPage hero banner: from-primary-600 via-primary-500 to-emerald-400
  dashboardHero: `linear-gradient(90deg, ${colors.primary600} 0%, ${colors.primary500} 50%, ${colors.emerald400} 100%)`,
  // Landing hero headline: from-slate-900 via-slate-800 to-emerald-600 (bg-clip-text)
  headline: `linear-gradient(90deg, ${colors.ink} 0%, ${colors.inkSoft} 45%, ${colors.emerald600} 100%)`,
  // Layout sidebar wordmark: from-primary-600 to-primary-400
  wordmark: `linear-gradient(90deg, ${colors.primary600}, ${colors.primary400})`,
};

/** Motion language shared by every scene */
export const motion = {
  /** Smooth, no overshoot: used for most reveals */
  smooth: { damping: 200 },
  /** Gentle pop: logo, buttons, callouts */
  pop: { damping: 14, stiffness: 160, mass: 0.8 },
  /** Snappy: cursor presses, toggles */
  snappy: { damping: 20, stiffness: 220 },
  /** Frames between staggered reveals (brief asks for 8-12) */
  stagger: 8,
  /** Frames used for each scene's exit */
  exit: 10,
};
