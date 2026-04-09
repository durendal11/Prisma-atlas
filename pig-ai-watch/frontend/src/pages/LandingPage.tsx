/**
 * PRISMA ATLAS — Landing Page
 * Converted from standalone HTML/CSS/JS landing to an in-app React route.
 * All animations powered by Framer Motion; 3D background via React Three Fiber.
 */
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import {
  Brain, ShieldCheck, BarChart3, Video, Bell, History,
  Crosshair, Shapes, AlertCircle, Database,
  Camera, Cpu, Calculator, BellRing,
  Download, Globe, Rocket, Info,
  ChevronDown, Menu, X,
} from 'lucide-react';
import { useAuthStore } from '@/store';
import CCTVCard from '@/components/landing/CCTVCard';
import LoginModal from '@/components/landing/LoginModal';

const ThreeBackground = lazy(() => import('@/components/landing/ThreeBackground'));

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function Section({ children, id, className = '' }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`relative py-24 px-6 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

function SectionHeader({ tag, title, highlight, description }: {
  tag: string; title: string; highlight: string; description: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7 }}
      className="text-center mb-16"
    >
      <span className="inline-block text-xs font-semibold tracking-widest uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1 mb-4">{tag}</span>
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
        {title} <span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">{highlight}</span>
      </h2>
      <p className="text-white/50 max-w-2xl mx-auto">{description}</p>
    </motion.div>
  );
}

function FadeInCard({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Counter ────────────────────────────────────────────────────────────── */

function CountUp({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 40;
    const id = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(id);
      } else {
        setCount(Math.round(start * 10) / 10);
      }
    }, 30);
    return () => clearInterval(id);
  }, [inView, target]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl md:text-4xl font-bold text-white tabular-nums">
        {count % 1 === 0 ? count : count.toFixed(1)}<span className="text-indigo-400">{suffix}</span>
      </div>
      <div className="text-xs text-white/40 mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

/* ─── Features Data ──────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: Brain, title: 'AI Detection', desc: 'Advanced YOLOv8 model trained specifically for pig detection with 99.2% accuracy for sows and piglets.', tags: ['YOLOv8', 'ONNX', 'Real-time'] },
  { icon: ShieldCheck, title: 'Crushing Prevention', desc: 'Real-time crushing risk assessment based on sow posture, piglet proximity, and behavioral patterns.', tags: ['Risk Analysis', 'Alerts'] },
  { icon: BarChart3, title: 'Health Analytics', desc: 'Comprehensive health scoring tracking activity levels, feeding patterns, and vital indicators.', tags: ['Health Score', 'Trends'] },
  { icon: Video, title: 'Multi-Camera Support', desc: 'Monitor multiple pens simultaneously with seamless camera switching and unified dashboard.', tags: ['Multi-feed', 'WebRTC'] },
  { icon: Bell, title: 'Smart Alerts', desc: 'Instant notifications for critical events including crushing risks, abnormal behavior, and health concerns.', tags: ['Push', 'WebSocket'] },
  { icon: History, title: 'Behavior Logging', desc: 'Comprehensive behavior history with 12-second interval logging for detailed analysis and reporting.', tags: ['Logs', 'Reports'] },
];

const DEMO_FEATURES = [
  { icon: Crosshair, title: 'Real-time Detection', desc: 'Objects detected and classified in under 50ms per frame' },
  { icon: Shapes, title: 'Segmentation Masks', desc: 'Precise object boundaries for accurate proximity calculation' },
  { icon: AlertCircle, title: 'Instant Alerts', desc: 'Immediate notification when risk levels exceed thresholds' },
  { icon: Database, title: 'Data Persistence', desc: 'All events logged to PostgreSQL for historical analysis' },
];

const PROCESS = [
  { n: '01', icon: Camera, title: 'Video Capture', desc: 'Camera feeds captured and preprocessed into 640×640 normalized tensors for optimal model input.' },
  { n: '02', icon: Cpu, title: 'AI Inference', desc: 'YOLOv8 processes frames detecting sows, piglets, and their postures with high confidence.' },
  { n: '03', icon: Calculator, title: 'Risk Analysis', desc: 'Proximity calculations and posture analysis determine crushing risk with our proprietary algorithm.' },
  { n: '04', icon: BellRing, title: 'Alert & Log', desc: 'Critical events trigger instant alerts while all behavior data is logged for analytics.' },
];

const CLASSES = [
  { icon: '🐷', name: 'Piglet', desc: 'Individual piglet detection for counting and proximity tracking', color: 'from-pink-500/20 to-pink-500/5' },
  { icon: '🪑', name: 'Sow-Sit', desc: 'Sitting posture — moderate crushing risk level', color: 'from-amber-500/20 to-amber-500/5' },
  { icon: '🌙', name: 'Sow-Sleep', desc: 'Sleeping posture — highest crushing risk', color: 'from-indigo-500/20 to-indigo-500/5' },
  { icon: '💜', name: 'Sow-Sleep-Lactate', desc: 'Lactating while sleeping — careful monitoring needed', color: 'from-purple-500/20 to-purple-500/5' },
  { icon: '🧍', name: 'Sow-Stand', desc: 'Standing posture — lowest crushing risk', color: 'from-emerald-500/20 to-emerald-500/5' },
  { icon: '🍽️', name: 'Sow-Stand-Feed', desc: 'Feeding posture — indicates healthy behavior', color: 'from-cyan-500/20 to-cyan-500/5' },
];

const TECH = [
  { name: 'React', icon: '⚛️' },
  { name: 'Python', icon: '🐍' },
  { name: 'FastAPI', icon: '⚡' },
  { name: 'PostgreSQL', icon: '🗄️' },
  { name: 'ONNX', icon: '🧠' },
  { name: 'WebSocket', icon: '🔌' },
];

const PERF = [
  { label: 'Inference Speed', value: '~50ms', pct: 85 },
  { label: 'Detection Accuracy', value: '99.2%', pct: 99 },
  { label: 'Uptime', value: '99.9%', pct: 99.9 },
  { label: 'Risk Reduction', value: '85%', pct: 85 },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LANDING PAGE                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [appInstalled, setAppInstalled] = useState(false);

  /* Navbar scroll */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const inStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setAppInstalled(inStandaloneMode);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as InstallPromptEvent);
    };

    const onInstalled = () => {
      setAppInstalled(true);
      setDeferredInstallPrompt(null);
      setInstallMessage('PRISMA ATLAS installed. Open it from your apps list to use it like a native app.');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /* Parallax */
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -120]);

  const goToDashboard = () => navigate('/');

  const handleInstallApp = async () => {
    if (appInstalled) {
      setInstallMessage('PRISMA ATLAS is already installed on this device.');
      return;
    }

    if (!deferredInstallPrompt) {
      setInstallMessage("Use your browser menu and choose 'Install App' or 'Add to Home Screen'.");
      return;
    }

    await deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallMessage('Installing PRISMA ATLAS...');
    } else {
      setInstallMessage('Install canceled. You can install anytime from this page.');
    }

    setDeferredInstallPrompt(null);
  };

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      {/* 3D Background */}
      <Suspense fallback={<div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950" />}>
        <ThreeBackground />
      </Suspense>

      {/* Cursor light effect (CSS only) */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-0 hover:opacity-100 transition-opacity" id="cursor-glow" />

      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-slate-900/80 backdrop-blur-md border-b border-white/5 shadow-lg' : ''}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="#" className="flex items-center gap-2 text-lg font-bold">
            <span className="text-2xl bg-gradient-to-br from-indigo-400 to-pink-400 bg-clip-text text-transparent">◈</span>
            <span>PRISMA<span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">ATLAS</span></span>
          </a>

          {/* Desktop links */}
          <ul className="hidden md:flex items-center gap-8 text-sm text-white/60">
            {['Install App', 'Features', 'Demo', 'How It Works', 'About'].map((s) => (
              <li key={s}>
                <a href={`#${s.toLowerCase().replace(/ /g, '-')}`} className="hover:text-white transition">{s}</a>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            {token ? (
              <>
                <button onClick={goToDashboard} className="px-4 py-2 text-sm rounded-lg bg-indigo-500 hover:bg-indigo-400 font-medium transition">Dashboard</button>
                <button onClick={() => { useAuthStore.getState().logout(); localStorage.removeItem('access_token'); }} className="px-4 py-2 text-sm rounded-lg text-white/60 hover:text-white transition">Logout</button>
              </>
            ) : (
              <button onClick={() => setLoginOpen(true)} className="px-4 py-2 text-sm rounded-lg border border-white/20 hover:bg-white/5 transition">Login</button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden text-white/60 hover:text-white" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-slate-900/95 backdrop-blur-md border-t border-white/5 px-6 py-4 space-y-3"
          >
            {['Install App', 'Features', 'Demo', 'How It Works', 'About'].map((s) => (
              <a key={s} href={`#${s.toLowerCase().replace(/ /g, '-')}`} onClick={() => setMobileMenu(false)} className="block text-white/60 hover:text-white py-2">{s}</a>
            ))}
            {token ? (
              <button onClick={() => { goToDashboard(); setMobileMenu(false); }} className="w-full py-2.5 rounded-lg bg-indigo-500 text-white font-medium">Dashboard</button>
            ) : (
              <button onClick={() => { setLoginOpen(true); setMobileMenu(false); }} className="w-full py-2.5 rounded-lg bg-indigo-500 text-white font-medium">Login</button>
            )}
          </motion.div>
        )}
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <motion.section style={{ y: heroY }} className="relative min-h-screen flex flex-col lg:flex-row items-center justify-center gap-12 px-6 pt-28 pb-16">
        <div className="flex-1 max-w-xl text-center lg:text-left">
          {/* Badge */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="inline-flex items-center gap-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" /><span className="inline-flex rounded-full h-2 w-2 bg-indigo-500" /></span>
            AI-Powered Livestock Monitoring
          </motion.div>

          {/* Logo */}
          <motion.div initial={{ opacity: 0, scale: 0.5, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.35, type: 'spring', damping: 15 }} className="mb-6">
            <img src="/assets/2.png" alt="PRISMA ATLAS" className="w-24 h-24 mx-auto lg:mx-0 drop-shadow-[0_0_40px_rgba(99,102,241,0.4)]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </motion.div>

          {/* Title */}
          <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.7 }} className="text-5xl md:text-7xl font-extrabold leading-tight mb-2">
            PRISMA
          </motion.h1>
          <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.7 }} className="text-5xl md:text-7xl font-extrabold leading-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-6">
            ATLAS
          </motion.h1>

          {/* Subtitle */}
          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} className="text-lg text-white/70 mb-2">
            <strong>P</strong>iglet <strong>R</strong>ealtime <strong>I</strong>dentification and <strong>S</strong>ow <strong>M</strong>onitoring <strong>A</strong>ssistant
          </motion.p>
          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }} className="text-sm text-white/40 mb-8 leading-relaxed max-w-md mx-auto lg:mx-0">
            Revolutionary AI-powered system that monitors pig welfare in real-time, detecting crushing risks, tracking behavior patterns, and ensuring optimal health for your livestock.
          </motion.p>

          {/* CTAs */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }} className="flex flex-wrap gap-3 justify-center lg:justify-start mb-10">
            <button onClick={handleInstallApp} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-semibold transition shadow-lg shadow-indigo-500/25">
              <Download size={18} /> {appInstalled ? 'App Installed' : 'Install App'}
            </button>
            <button onClick={() => setLoginOpen(true)} className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 hover:bg-white/5 text-white font-medium transition">
              <Globe size={18} /> Web Dashboard
            </button>
          </motion.div>

          {installMessage && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-indigo-200/90 mb-6 max-w-md mx-auto lg:mx-0">
              {installMessage}
            </motion.p>
          )}

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95 }} className="flex justify-center lg:justify-start gap-8">
            <CountUp target={99.2} suffix="%" label="Detection Accuracy" />
            <div className="w-px bg-white/10" />
            <CountUp target={24} suffix="/7" label="Real-time Monitoring" />
            <div className="w-px bg-white/10" />
            <CountUp target={85} suffix="%" label="Risk Reduction" />
          </motion.div>
        </div>

        {/* CCTV visual */}
        <div className="flex-1 max-w-lg w-full">
          <CCTVCard />
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30"
        >
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center pt-2">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" animate={{ y: [0, 12, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
          </div>
          <span className="text-xs">Scroll to explore</span>
        </motion.div>
      </motion.section>

      {/* ── Install App ─────────────────────────────────────────────────── */}
      <Section id="install-app">
        <SectionHeader
          tag="Install"
          title="Install"
          highlight="PRISMA App"
          description="Built for non-technical users: install once, then use it like a normal desktop app."
        />

        <div className="grid lg:grid-cols-2 gap-6">
          <FadeInCard>
            <div className="h-full rounded-2xl bg-white/[0.03] border border-white/[0.06] p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center">
                  <Download size={18} className="text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Dashboard App (Client)</h3>
                  <p className="text-xs text-white/40">Install from browser and launch from your app list.</p>
                </div>
              </div>

              <div className="space-y-2 mb-5 text-sm text-white/65">
                <p>1. Click Install App below.</p>
                <p>2. Accept install prompt.</p>
                <p>3. Open PRISMA ATLAS from desktop/start menu.</p>
              </div>

              <button
                onClick={handleInstallApp}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-semibold transition shadow-lg shadow-indigo-500/25"
              >
                <Download size={17} /> {appInstalled ? 'Already Installed' : 'Install Dashboard App'}
              </button>

              <p className="text-xs text-white/35 mt-3">
                If no prompt appears, use your browser menu and choose Install App or Add to Home Screen.
              </p>
            </div>
          </FadeInCard>

          <FadeInCard delay={0.1}>
            <div className="h-full rounded-2xl bg-white/[0.03] border border-white/[0.06] p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Edge Service Installer (macOS + Windows)</h3>
                  <p className="text-xs text-white/40">Download the installer for your laptop OS, then run it once.</p>
                </div>
              </div>

              <div className="space-y-2 mb-5 text-sm text-white/65">
                <p>1. Download the installer for macOS or Windows.</p>
                <p>2. Run it and point to your pig-ai-watch/edge folder.</p>
                <p>3. Use PRISMA Edge Control app/shortcut to Start, Stop, and check Status.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <a
                  href="/downloads/edge/install-edge-control-macos.sh"
                  download
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 hover:bg-white/5 text-white font-medium transition"
                >
                  <Download size={17} /> Download macOS Installer
                </a>
                <a
                  href="/downloads/edge/install-edge-control-windows.ps1"
                  download
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 hover:bg-white/5 text-white font-medium transition"
                >
                  <Download size={17} /> Download Windows Installer
                </a>
              </div>

              <button
                onClick={() => token ? goToDashboard() : setLoginOpen(true)}
                className="w-full mt-3 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600/20 border border-emerald-400/30 hover:bg-emerald-500/25 text-emerald-100 font-medium transition"
              >
                <Globe size={17} /> Open Dashboard
              </button>

              <p className="text-xs text-white/35 mt-3">
                Windows note: right-click the .ps1 file and run with PowerShell.
              </p>
            </div>
          </FadeInCard>
        </div>
      </Section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <Section id="features">
        <SectionHeader tag="Features" title="Intelligent Monitoring" highlight="Capabilities" description="Powered by state-of-the-art YOLOv8 computer vision and real-time analytics" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <FadeInCard key={f.title} delay={i * 0.1} className="group">
              <div className="h-full rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <f.icon size={22} className="text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed mb-4">{f.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map((t) => (
                    <span key={t} className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{t}</span>
                  ))}
                </div>
              </div>
            </FadeInCard>
          ))}
        </div>
      </Section>

      {/* ── Demo ──────────────────────────────────────────────────────────── */}
      <Section id="demo">
        <SectionHeader tag="Demo" title="See PRISMA ATLAS" highlight="In Action" description="Watch how our AI-powered system detects and monitors pig welfare in real-time" />
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <FadeInCard className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
            <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
              {/* Fake detection boxes */}
              <div className="absolute inset-8">
                <motion.div className="absolute top-[10%] left-[10%] w-[40%] h-[50%] border-2 border-indigo-500/50 rounded" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}>
                  <span className="absolute -top-5 left-0 text-[10px] font-mono text-indigo-400 bg-indigo-500/20 px-1.5 rounded">SOW-STAND-FEED</span>
                </motion.div>
                {[{ t: '60%', l: '15%' }, { t: '55%', l: '55%' }, { t: '70%', l: '35%' }, { t: '65%', l: '70%' }].map((p, i) => (
                  <motion.div key={i} className="absolute w-[10%] h-[15%] border border-pink-500/50 rounded" style={{ top: p.t, left: p.l }} animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.25 }} />
                ))}
              </div>
              {/* Play button */}
              <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
                <div className="w-0 h-0 border-l-[18px] border-l-white border-y-[11px] border-y-transparent ml-1" />
              </div>
              {/* Stats overlay */}
              <div className="absolute bottom-4 left-4 right-4 flex gap-4 text-xs font-mono">
                {[{ l: 'Risk Level', v: 'LOW', c: 'text-emerald-400' }, { l: 'Piglets', v: '12', c: 'text-white' }, { l: 'Sow Posture', v: 'FEEDING', c: 'text-indigo-400' }].map((s) => (
                  <div key={s.l} className="bg-black/40 backdrop-blur rounded px-3 py-1.5">
                    <div className="text-white/40">{s.l}</div>
                    <div className={`font-bold ${s.c}`}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeInCard>

          <div className="space-y-4">
            {DEMO_FEATURES.map((f, i) => (
              <FadeInCard key={f.title} delay={i * 0.12}>
                <div className="flex gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] transition">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                    <f.icon size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">{f.title}</h4>
                    <p className="text-xs text-white/40">{f.desc}</p>
                  </div>
                </div>
              </FadeInCard>
            ))}
          </div>
        </div>
      </Section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <Section id="how-it-works">
        <SectionHeader tag="Process" title="How" highlight="It Works" description="From camera feed to actionable insights in milliseconds" />
        <div className="space-y-6">
          {PROCESS.map((p, i) => (
            <FadeInCard key={p.n} delay={i * 0.15}>
              <div className="flex items-start gap-6 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] transition group">
                <div className="text-3xl font-black text-white/5 group-hover:text-indigo-500/20 transition">{p.n}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{p.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{p.desc}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/10 to-pink-500/10 flex items-center justify-center flex-shrink-0">
                  <p.icon size={20} className="text-indigo-400" />
                </div>
              </div>
              {i < PROCESS.length - 1 && (
                <div className="flex justify-center py-1">
                  <ChevronDown size={16} className="text-white/10" />
                </div>
              )}
            </FadeInCard>
          ))}
        </div>
      </Section>

      {/* ── Detection Classes ─────────────────────────────────────────────── */}
      <Section id="model-classes">
        <SectionHeader tag="AI Model" title="Detection" highlight="Classes" description="Our YOLOv8 model is trained to recognize 6 distinct classes" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CLASSES.map((c, i) => (
            <FadeInCard key={c.name} delay={i * 0.1}>
              <div className={`rounded-2xl bg-gradient-to-br ${c.color} border border-white/[0.06] p-6 text-center hover:scale-[1.03] transition-transform`}>
                <div className="text-4xl mb-3">{c.icon}</div>
                <h4 className="text-sm font-semibold text-white mb-1">{c.name}</h4>
                <p className="text-xs text-white/40">{c.desc}</p>
              </div>
            </FadeInCard>
          ))}
        </div>
      </Section>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <Section id="about">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <FadeInCard>
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1 mb-4">About</span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for <span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">Modern Farming</span>
            </h2>
            <p className="text-white/50 mb-4 leading-relaxed">
              PRISMA ATLAS represents the cutting edge of agricultural technology, combining advanced computer vision with intuitive interfaces to revolutionize pig farming.
            </p>
            <p className="text-white/50 mb-6 leading-relaxed">
              Designed to reduce piglet mortality, improve animal welfare, and provide farmers with actionable insights to optimize operations.
            </p>
            <h4 className="text-sm font-semibold text-white mb-3">Technology Stack</h4>
            <div className="flex flex-wrap gap-3">
              {TECH.map((t) => (
                <div key={t.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.06] text-xs text-white/60 hover:bg-white/10 transition" title={t.name}>
                  <span className="text-base">{t.icon}</span>
                  {t.name}
                </div>
              ))}
            </div>
          </FadeInCard>

          <FadeInCard delay={0.15}>
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6">
              <h4 className="text-sm font-semibold text-white mb-5">System Performance</h4>
              <div className="space-y-5">
                {PERF.map((p) => (
                  <div key={p.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-white/50">{p.label}</span>
                      <span className="text-indigo-400 font-medium">{p.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${p.pct}%` }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        viewport={{ once: true }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeInCard>
        </div>
      </Section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <Section>
        <FadeInCard className="text-center py-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your <span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">Pig Farming?</span>
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">Join the future of intelligent livestock monitoring with PRISMA ATLAS</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={() => token ? goToDashboard() : setLoginOpen(true)} className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-semibold transition shadow-lg shadow-indigo-500/25">
              <Rocket size={18} /> {token ? 'Go to Dashboard' : 'Get Started Now'}
            </button>
            <a href="#features" className="flex items-center gap-2 px-8 py-3 rounded-xl border border-white/20 hover:bg-white/5 text-white font-medium transition">
              <Info size={18} /> Learn More
            </a>
          </div>
        </FadeInCard>
      </Section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-10">
          <div>
            <a href="#" className="flex items-center gap-2 text-lg font-bold mb-3">
              <span className="text-2xl bg-gradient-to-br from-indigo-400 to-pink-400 bg-clip-text text-transparent">◈</span>
              PRISMA<span className="bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">ATLAS</span>
            </a>
            <p className="text-xs text-white/30 leading-relaxed">Piglet Realtime Identification and Sow Monitoring Assistant</p>
          </div>
          {[
            { title: 'Product', links: [{ l: 'Features', h: '#features' }, { l: 'Demo', h: '#demo' }, { l: 'How It Works', h: '#how-it-works' }] },
            { title: 'Resources', links: [{ l: 'Documentation', h: '#' }, { l: 'API Reference', h: '#' }, { l: 'Support', h: '#' }] },
            { title: 'Company', links: [{ l: 'About', h: '#about' }, { l: 'Contact', h: '#' }, { l: 'Privacy', h: '#' }] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-3">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((lk) => (
                  <li key={lk.l}><a href={lk.h} className="text-xs text-white/30 hover:text-white/60 transition">{lk.l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="max-w-6xl mx-auto pt-8 mt-8 border-t border-white/5 text-center text-xs text-white/20">
          &copy; 2026 PRISMA ATLAS. All rights reserved.
        </div>
      </footer>

      {/* ── Login Modal ───────────────────────────────────────────────────── */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
