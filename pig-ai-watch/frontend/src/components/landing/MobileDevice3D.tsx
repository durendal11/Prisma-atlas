/**
 * PRISMA ATLAS — 3D Mobile Device Mockup Component
 * Renders a perspective-tilted 3D smartphone model showcasing the mobile version
 * of the system with an edge-to-edge full screen image placeholder.
 *
 * Features:
 * - Slide-in from right-to-left animation on initial mount
 * - 360° interactive 3D spin on hover with front & back chassis rendering
 * - Accurate, properly-aligned physical side buttons (Action, Vol+, Vol-, Power)
 * - Full-screen edge-to-edge image placeholder ready for custom screenshots
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wifi,
  Battery,
  Bell,
  Smartphone,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  /** Custom screenshot or mockup image URL to fill the phone screen */
  imageSrc?: string;
  className?: string;
}

export default function MobileDevice3D({
  imageSrc = '/assets/philippine_pig_farm.png',
  className = '',
}: Props) {
  const [currentImage, setCurrentImage] = useState(imageSrc);
  const [spinCount, setSpinCount] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  const handleMouseEnter = () => {
    setSpinCount((prev) => prev + 1);
    setIsSpinning(true);
  };

  return (
    <motion.div
      initial={{ x: 160, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ perspective: '1400px' }}
      onMouseEnter={handleMouseEnter}
    >
      {/* ── Ambient Radial Glow Behind the Device ── */}
      <div className="absolute -inset-8 bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-transparent rounded-full blur-3xl -z-10 pointer-events-none transform -rotate-12 scale-110" />

      {/* ── 3D Interactive Rotating Phone Container (Fast One-Time Spin) ── */}
      <motion.div
        className="relative cursor-pointer"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{
          rotateY: -15 + spinCount * 360,
          rotateX: 8,
          rotateZ: 2,
          scale: isSpinning ? 1.04 : 1,
        }}
        transition={{
          rotateY: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.25 },
        }}
        onAnimationComplete={() => setIsSpinning(false)}
      >
        {/* ============================================================== */}
        {/* ── FRONT FACE: CHASSIS & FULL SCREEN IMAGE DISPLAY ─────────── */}
        {/* ============================================================== */}
        <div
          className="relative w-[280px] sm:w-[320px] h-[580px] sm:h-[640px] rounded-[48px] p-[10px] sm:p-[12px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 shadow-[0_30px_70px_-15px_rgba(15,23,42,0.45),0_0_0_1px_rgba(255,255,255,0.18),inset_0_2px_4px_rgba(255,255,255,0.3)] [backface-visibility:hidden]"
        >
          {/* ── Accurately Positioned Physical Side Buttons ── */}
          {/* Left: Action Button */}
          <div className="absolute -left-[3.5px] top-24 w-[3.5px] h-7 bg-slate-600 border-l border-white/20 rounded-l-[2px] shadow-sm" />
          {/* Left: Volume Up Button */}
          <div className="absolute -left-[3.5px] top-36 w-[3.5px] h-12 bg-slate-600 border-l border-white/20 rounded-l-[2px] shadow-sm" />
          {/* Left: Volume Down Button */}
          <div className="absolute -left-[3.5px] top-52 w-[3.5px] h-12 bg-slate-600 border-l border-white/20 rounded-l-[2px] shadow-sm" />
          {/* Right: Power / Sleep Button */}
          <div className="absolute -right-[3.5px] top-36 w-[3.5px] h-16 bg-slate-600 border-r border-white/20 rounded-r-[2px] shadow-sm" />

          {/* ── Inner Display Frame with Full Screen Image Placeholder ── */}
          <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-slate-950 flex flex-col justify-between border border-slate-900/80 shadow-inner group">
            
            {/* ── FULL SCREEN IMAGE PLACEHOLDER (EDGE-TO-EDGE) ── */}
            {currentImage ? (
              <img
                src={currentImage}
                alt="PRISMA ATLAS Mobile System Preview"
                className="absolute inset-0 w-full h-full object-cover filter brightness-[0.98] contrast-105 transition-transform duration-700 group-hover:scale-105"
                onError={() => setCurrentImage('/assets/philippine_pig_farm.png')}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 text-center text-slate-400">
                <ImageIcon size={44} className="text-emerald-500/70 mb-3" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Full Screen Image Placeholder
                </span>
                <span className="text-[10px] font-mono text-slate-400 mt-1">
                  Replace imageSrc prop with your screenshot
                </span>
              </div>
            )}

            {/* Subtle Top Gradient Scrim for status bar readability */}
            <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none z-30" />

            {/* ── Dynamic Island Pill (Top Center Notch) ── */}
            <div className="absolute top-2.5 inset-x-0 z-40 flex justify-center pointer-events-none">
              <div className="h-5 sm:h-6 w-24 sm:w-28 bg-black rounded-full flex items-center justify-between px-2.5 shadow-md border border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-blue-900/60" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[8px] font-mono text-emerald-400 font-bold">LIVE</span>
                </div>
              </div>
            </div>

            {/* ── Top Status Bar ── */}
            <div className="relative z-30 px-6 pt-3 pb-1 flex items-center justify-between text-[11px] font-mono font-semibold text-white/90 drop-shadow pointer-events-none">
              <span>09:41</span>
              <div className="flex items-center gap-1.5 text-white/90">
                <span className="text-[9px] font-bold text-emerald-400">5G</span>
                <Wifi size={12} className="stroke-[2.5]" />
                <Battery size={13} className="stroke-[2.5] fill-white/80" />
              </div>
            </div>

            {/* Empty Center Space: 100% reserved for user's full-screen screenshot! */}
            <div className="flex-1" />

            {/* ── Bottom Gradient Scrim & Home Bar Indicator ── */}
            <div className="relative z-30 pb-2 pt-6 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col items-center justify-end pointer-events-none">
              <div className="w-28 h-1 bg-white/40 rounded-full" />
            </div>

            {/* Specular Diagonal Glass Sheen Reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none z-30 rounded-[38px]" />
          </div>
        </div>

        {/* ============================================================== */}
        {/* ── BACK FACE: CHASSIS & FLAGSHIP TRIPLE CAMERA SYSTEM ─────── */}
        {/* ============================================================== */}
        <div
          className="absolute inset-0 w-[280px] sm:w-[320px] h-[580px] sm:h-[640px] rounded-[48px] p-6 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/80 shadow-[0_30px_70px_-15px_rgba(15,23,42,0.45)] flex flex-col justify-between [transform:rotateY(180deg)] [backface-visibility:hidden]"
        >
          {/* Top Camera Bump */}
          <div className="w-32 h-32 rounded-3xl bg-slate-800/90 border border-slate-700/80 p-3 shadow-2xl grid grid-cols-2 gap-2.5">
            <div className="rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center p-1.5 shadow-inner">
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-slate-900 via-blue-950 to-slate-800 border border-blue-900/50" />
            </div>
            <div className="rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center p-1.5 shadow-inner">
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-slate-900 via-blue-950 to-slate-800 border border-blue-900/50" />
            </div>
            <div className="rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center p-1.5 shadow-inner">
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-slate-900 via-blue-950 to-slate-800 border border-blue-900/50" />
            </div>
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300 shadow-sm" />
              <div className="w-2.5 h-2.5 rounded-full bg-black/90" />
            </div>
          </div>

          {/* Center Brand Emblem */}
          <div className="flex flex-col items-center justify-center opacity-50">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-white text-lg font-bold shadow-sm">
              ◈
            </div>
            <span className="text-[11px] font-mono tracking-widest text-slate-300 mt-2 font-semibold">
              PRISMA ATLAS
            </span>
          </div>

          {/* Bottom Telemetry Inscription */}
          <div className="text-center text-[9px] font-mono text-slate-500 opacity-70">
            AI Precision Swine Vision Client • Edge v2.4
          </div>
        </div>
      </motion.div>

      {/* ── 3D Floating Spatial Callout Badges ── */}
      {/* Badge 1: Instant Push Notifications (Top Right) */}
      <div
        className="hidden sm:flex absolute -top-4 -right-10 z-30 items-center gap-2 px-3 py-2 rounded-2xl bg-white/95 border border-slate-200/90 shadow-xl shadow-slate-300/40 backdrop-blur-xl text-slate-800 transition-all duration-500 pointer-events-none"
      >
        <div className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
          <Bell size={14} className="stroke-[2.5]" />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold leading-tight text-slate-900">
            Instant Push Alerts
          </div>
          <div className="text-[8px] font-mono text-emerald-700 font-semibold">
            Buzzer & SMS in &lt;50ms
          </div>
        </div>
      </div>

      {/* Badge 2: PWA Mobile Model (Bottom Left) */}
      <div
        className="hidden sm:flex absolute -bottom-6 -left-8 z-30 items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/95 border border-slate-200/90 shadow-xl shadow-slate-300/40 backdrop-blur-xl text-slate-800 transition-all duration-500 pointer-events-none"
      >
        <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-600/25">
          <Smartphone size={14} className="stroke-[2.5]" />
        </div>
        <div>
          <div className="text-[10px] font-mono font-bold leading-tight text-slate-900 flex items-center gap-1">
            <span>PRISMA ATLAS PWA</span>
            <CheckCircle2 size={11} className="text-emerald-600" />
          </div>
          <div className="text-[8px] font-mono text-slate-500">
            Installable on iOS & Android
          </div>
        </div>
      </div>
    </motion.div>
  );
}
