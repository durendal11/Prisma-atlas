/**
 * PRISMA ATLAS — Fullscreen Hero Video Masking Parallax Component
 * Clean, scroll-driven sticky video section featuring a dynamic expanding circular aperture mask.
 */
import { useRef, useMemo } from 'react';

interface VideoParallaxSectionProps {
  scrollProgress: number; // Global scroll progress from LandingPage
}

export default function VideoParallaxSection({ scrollProgress }: VideoParallaxSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null!);

  // Map global scrollProgress to local section progress (range 0.65 to 0.88)
  const localProgress = useMemo(() => {
    if (scrollProgress < 0.65) return 0;
    if (scrollProgress > 0.88) return 1.0;
    return (scrollProgress - 0.65) / 0.23;
  }, [scrollProgress]);

  // Mask Radius: expands from 22% aperture pill to 100% full screen
  const maskRadius = useMemo(() => {
    return Math.min(100, Math.max(22, localProgress * 100));
  }, [localProgress]);

  // Video Zoom & Parallax Shift
  const videoScale = useMemo(() => {
    return 1.25 - localProgress * 0.15;
  }, [localProgress]);

  const videoTranslateY = useMemo(() => {
    return (localProgress - 0.5) * -50;
  }, [localProgress]);

  return (
    <section id="demo-video" ref={containerRef} className="relative z-20 min-h-[220vh] bg-slate-100">
      {/* Sticky Fullscreen Viewport Wrapper */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col justify-between">
        
        {/* Fullscreen Masked Video Container */}
        <div
          className="absolute inset-0 transition-all duration-300 ease-out overflow-hidden bg-slate-950 shadow-2xl"
          style={{
            clipPath: `circle(${maskRadius}% at 50% 50%)`,
          }}
        >
          {/* Free Demo Video Stream */}
          <video
            className="w-full h-full object-cover filter brightness-105 contrast-105 transition-transform duration-300 ease-out"
            style={{
              transform: `scale(${videoScale}) translateY(${videoTranslateY}px)`,
            }}
            src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            autoPlay
            loop
            muted
            playsInline
            poster="/assets/philippine_pig_farm.png"
          />

          {/* Vignette Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 pointer-events-none" />

          {/* Top Live Video Telemetry Header */}
          <div className="absolute top-20 sm:top-24 inset-x-0 z-20 px-4 sm:px-12 flex items-center justify-between pointer-events-none font-mono text-[10px] sm:text-xs text-white">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold backdrop-blur-md">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping" />
                LIVE MASK STREAM
              </span>
              <span className="hidden sm:inline text-white/70">1080p 60FPS RTSP FEED #01</span>
            </div>
            <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/60 border border-white/20 text-white/90 backdrop-blur-md font-bold">
              MASK: {Math.round(localProgress * 100)}%
            </div>
          </div>
        </div>

        {/* Bottom Scroll Cue */}
        <div className="relative z-30 pointer-events-none pb-8 text-center mt-auto">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 border border-slate-200 text-[10px] sm:text-xs font-mono text-slate-700 shadow-lg backdrop-blur-md">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-600 animate-ping" />
            SCROLL TO UNLOCK SYSTEM MATRIX
          </span>
        </div>

      </div>
    </section>
  );
}
