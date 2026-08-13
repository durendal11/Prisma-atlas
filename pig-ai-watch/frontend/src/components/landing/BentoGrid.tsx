/**
 * PRISMA ATLAS — Light Mode Bento Box Feature Matrix
 * Porcelain white glass cards with subtle Emerald cursor spotlight tracking
 * and continuous scroll-driven bidirectional fade-in & fade-out animations.
 */
import { useState, useRef, useEffect, useMemo, MouseEvent } from 'react';
import { Cpu, Zap, ShieldAlert, Eye, Server, Flame, Radio, CheckCircle2 } from 'lucide-react';

interface BentoCardProps {
  title: string;
  subtitle: string;
  badge?: string;
  className?: string;
  children: React.ReactNode;
  icon: React.ElementType;
  opacity?: number;
}

function BentoCard({
  title,
  subtitle,
  badge,
  className = '',
  children,
  icon: Icon,
  opacity = 1,
}: BentoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null!);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative rounded-3xl bg-white border border-slate-200/80 p-7 overflow-hidden backdrop-blur-2xl transition-all duration-300 ease-out shadow-lg shadow-slate-200/50 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10 ${className}`}
      style={{
        opacity: opacity,
        transform: `translateY(${(1 - opacity) * 35}px)`,
      }}
    >
      {/* Interactive Cursor Spotlight Glow */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-3xl"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.08), transparent 40%)`,
        }}
      />

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 group-hover:scale-110 transition-transform duration-300">
              <Icon size={22} />
            </div>
            {badge && (
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                {badge}
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-2 group-hover:text-emerald-700 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed font-normal mb-6">
            {subtitle}
          </p>
        </div>

        <div className="mt-auto">{children}</div>
      </div>
    </div>
  );
}

interface BentoGridProps {
  scrollProgress?: number;
}

export default function BentoGrid({ scrollProgress = 0 }: BentoGridProps) {
  const sectionRef = useRef<HTMLDivElement>(null!);
  const [viewportProgress, setViewportProgress] = useState(0);

  // Compute local viewport scroll progress dynamically on window scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate how far the section has scrolled into viewport
      // 0 when section top is at window bottom, 1 when section top reaches middle of screen
      const rawProgress = (windowHeight - rect.top) / (windowHeight * 0.75);
      const exitProgress = (rect.bottom) / (windowHeight * 0.5);
      
      let finalAlpha = Math.min(1, Math.max(0, rawProgress));
      if (rect.bottom < windowHeight * 0.5) {
        finalAlpha = Math.min(finalAlpha, Math.max(0, exitProgress));
      }

      setViewportProgress(finalAlpha);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Use either global scrollProgress or viewport progress for reliable bidirectional fade
  const activeAlpha = useMemo(() => {
    return Math.max(viewportProgress, scrollProgress >= 0.72 ? Math.min(1, (scrollProgress - 0.72) / 0.12) : 0);
  }, [viewportProgress, scrollProgress]);

  // Card staggered opacities
  const card1Alpha = useMemo(() => Math.min(1, Math.max(0, activeAlpha * 1.2)), [activeAlpha]);
  const card2Alpha = useMemo(() => Math.min(1, Math.max(0, (activeAlpha - 0.1) * 1.2)), [activeAlpha]);
  const card3Alpha = useMemo(() => Math.min(1, Math.max(0, (activeAlpha - 0.2) * 1.2)), [activeAlpha]);
  const card4Alpha = useMemo(() => Math.min(1, Math.max(0, (activeAlpha - 0.3) * 1.2)), [activeAlpha]);
  const card5Alpha = useMemo(() => Math.min(1, Math.max(0, (activeAlpha - 0.4) * 1.2)), [activeAlpha]);
  const card6Alpha = useMemo(() => Math.min(1, Math.max(0, (activeAlpha - 0.5) * 1.2)), [activeAlpha]);

  return (
    <div ref={sectionRef} className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
      {/* Section Header with Continuous Scroll Fade-In / Fade-Out */}
      <div
        className="text-center mb-12 sm:mb-16 transition-all duration-300 ease-out"
        style={{
          opacity: activeAlpha,
          transform: `translateY(${(1 - activeAlpha) * 30}px)`,
        }}
      >
        <span className="inline-block text-[10px] sm:text-xs font-mono font-semibold tracking-widest uppercase text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-3 sm:mb-4">
          SYSTEM MATRIX
        </span>
        <h2 className="text-3xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-3 sm:mb-4">
          Real-Time <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-600 bg-clip-text text-transparent">AI Swine Telemetry</span>
        </h2>
        <p className="text-xs sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Powered by browser-side ONNX Runtime Web inference, YOLOv11 object detection, and edge camera stream synchronization.
        </p>
      </div>

      {/* Bento Grid Container with Bidirectional Scroll Fade */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Card 1 (Span 2): Browser-side ONNX Runtime Web */}
        <BentoCard
          title="Browser-Side ONNX Runtime Web"
          subtitle="Executes YOLOv11 neural network models directly inside the browser using WebGL and WebAssembly acceleration."
          badge="ONNX WebGL"
          icon={Zap}
          className="lg:col-span-2"
          opacity={card1Alpha}
        >
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs">
            <div className="flex items-center justify-between mb-3 text-slate-700">
              <span className="flex items-center gap-2"><Radio size={14} className="text-emerald-600 animate-pulse" /> Local Inference Speed</span>
              <span className="text-emerald-700 font-bold">~50ms / Frame</span>
            </div>
            <div className="flex items-end gap-1.5 h-14 pt-2">
              {[40, 45, 30, 75, 25, 20, 35, 80, 28, 22, 18, 30, 26, 70, 24, 20].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`flex-1 rounded-t transition-all duration-300 ${h > 70 ? 'bg-emerald-600' : 'bg-emerald-200 group-hover:bg-emerald-400'}`}
                />
              ))}
            </div>
          </div>
        </BentoCard>

        {/* Card 2 (Span 2): YOLOv11 6-Class Detection Model */}
        <BentoCard
          title="YOLOv11 Posture & Piglet Detector"
          subtitle="Detects piglets and classifies 5 sow postures: sow-stand, sow-stand-feed, sow-sit, sow-sleep, sow-sleep-lactate."
          badge="6 Classes"
          icon={Cpu}
          className="lg:col-span-2"
          opacity={card2Alpha}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <div className="text-slate-400 text-[10px] uppercase mb-1">Detection</div>
              <div className="text-emerald-700 text-base font-bold">YOLOv11</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <div className="text-slate-400 text-[10px] uppercase mb-1">Categories</div>
              <div className="text-slate-900 text-base font-bold">Sow & Piglet</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <div className="text-slate-400 text-[10px] uppercase mb-1">Format</div>
              <div className="text-emerald-700 text-base font-bold">ONNX / PyTorch</div>
            </div>
          </div>
        </BentoCard>

        {/* Card 3 (Span 1): Multi-Camera Feed Sync */}
        <BentoCard
          title="Multi-Camera RTSP / WebRTC"
          subtitle="Monitor multiple farrowing crates simultaneously with unified dashboard switching."
          badge="Multi-Feed"
          icon={Eye}
          className="lg:col-span-1"
          opacity={card3Alpha}
        >
          <div className="space-y-2 text-xs font-mono text-slate-700">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
              <span>Cam #01 (Farrowing)</span>
              <span className="text-emerald-700 font-bold">1080p</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
              <span>Cam #02 (Gestation)</span>
              <span className="text-emerald-700 font-bold">1080p</span>
            </div>
          </div>
        </BentoCard>

        {/* Card 4 (Span 1): Crushing Risk Engine */}
        <BentoCard
          title="Real-Time Crushing Risk Alarms"
          subtitle="Triggers instant alerts when sow lies down near piglet clusters."
          badge="Alert Engine"
          icon={ShieldAlert}
          className="lg:col-span-1"
          opacity={card4Alpha}
        >
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-bold mb-1">
              <CheckCircle2 size={14} className="text-emerald-700" /> INSTANT ALARM
            </div>
            <p className="text-[11px] text-slate-600">WebSocket push notifications & behavior logs.</p>
          </div>
        </BentoCard>

        {/* Card 5 (Span 2): Live CCTV Stream Preview & Overlays */}
        <BentoCard
          title="Thermal Spectrum & Bounding Box Overlays"
          subtitle="Displays bounding boxes, confidence percentages, and thermal color overlays over camera feeds."
          badge="Live Overlays"
          icon={Flame}
          className="lg:col-span-2"
          opacity={card5Alpha}
        >
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
                ◈
              </div>
              <div>
                <div className="text-slate-900 font-bold">Bounding Box Overlays</div>
                <div className="text-slate-500 text-[11px]">Real-time detection boxes and posture labels</div>
              </div>
            </div>
            <div className="text-right font-mono text-emerald-700 font-bold text-sm">
              ACTIVE FEED
            </div>
          </div>
        </BentoCard>

        {/* Card 6 (Span 2): Edge Installer Architecture */}
        <BentoCard
          title="Local Edge Service Installer"
          subtitle="Run the Python edge pusher and camera service locally on macOS or Windows without cloud dependency."
          badge="Edge Installer"
          icon={Server}
          className="lg:col-span-2"
          opacity={card6Alpha}
        >
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-400 text-[10px]">DATABASE</div>
              <div className="text-slate-900 font-bold mt-1">PostgreSQL & SQLite</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-400 text-[10px]">SCRIPT</div>
              <div className="text-emerald-700 font-bold mt-1">macOS .sh & Win .cmd</div>
            </div>
          </div>
        </BentoCard>
      </div>
    </div>
  );
}
