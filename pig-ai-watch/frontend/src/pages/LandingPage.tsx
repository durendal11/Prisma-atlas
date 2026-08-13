/**
 * PRISMA ATLAS — Landing Page Component
 * Crisp Light Mode Theme with extended 350vh 3D scroll track, 100% complete 360° camera orbit,
 * hold buffer, and non-overlapping Hero Video Showcase Section.
 */
import { useState, useEffect, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Lenis from 'lenis';
import {
  Download,
  Globe,
  Menu,
  X,
  Eye,
  Activity,
} from 'lucide-react';

import PigPen3D from '../components/landing/PigPen3D';
import BentoGrid from '../components/landing/BentoGrid';
import LoginModal from '../components/landing/LoginModal';
import { useAuthStore } from '../store';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/* ─── Aspect-Aware 360° Camera Orbit Controller ──────────────────────────── */
function CameraController({ scrollProgress }: { scrollProgress: number }) {
  const cameraTarget = useRef(new THREE.Vector3(0, 1.2, 0));
  const currentPos = useRef(new THREE.Vector3(0, 4, 10));

  useFrame(({ camera, size }) => {
    const isMobile = size.width < 640;
    const radius = isMobile ? 7.8 : 5.6;

    const targetPos = new THREE.Vector3(0, 4, 10);
    const targetLook = new THREE.Vector3(0, 1.2, 0);

    if (scrollProgress < 0.15) {
      targetPos.set(0, 3.8, isMobile ? 11 : 8.5);
      targetLook.set(0, 1.0, 0);
    } else if (scrollProgress <= 0.65) {
      // 360° Full Camera Orbit from scrollProgress 0.15 to 0.65 (100% Complete)
      const penProgress = (scrollProgress - 0.15) / 0.50; // 0.0 to 1.0
      const angle = penProgress * Math.PI * 2.0; // 0 to 360 degrees
      const height = 3.2 + Math.sin(penProgress * Math.PI) * 0.5;
      targetPos.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      targetLook.set(0, 0.9, 0);
    } else if (scrollProgress <= 0.72) {
      // Hold Buffer: 360° rotation complete, hold steady view before next section enters
      targetPos.set(0, 3.2, radius);
      targetLook.set(0, 0.9, 0);
    } else {
      targetPos.set(0, 5.5, 9.5);
      targetLook.set(0, 1.0, 0);
    }

    currentPos.current.lerp(targetPos, 0.08);
    cameraTarget.current.lerp(targetLook, 0.08);

    camera.position.copy(currentPos.current);
    camera.lookAt(cameraTarget.current);
  });

  return null;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [appInstalled, setAppInstalled] = useState(false);

  const mainContainerRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 50);

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 0) {
        setScrollProgress(Math.min(1, Math.max(0, scrollY / maxScroll)));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as InstallPromptEvent);
    };

    const appInstalledHandler = () => {
      setAppInstalled(true);
      setDeferredInstallPrompt(null);
      setInstallMessage('Prisma Atlas App installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, []);

  const goToDashboard = () => {
    navigate('/app');
  };

  const handleInstallApp = async () => {
    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setInstallMessage('Installing PRISMA ATLAS...');
      } else {
        setInstallMessage('Install canceled.');
      }
      setDeferredInstallPrompt(null);
    } else {
      setInstallMessage('PWA can be installed via your browser address bar menu ("Install Application").');
    }
  };

  const isIn3DSection = scrollProgress >= 0.15 && scrollProgress <= 0.72;

  return (
    <div ref={mainContainerRef} className="relative min-h-[600vh] bg-slate-50 text-slate-900 overflow-x-hidden selection:bg-emerald-500 selection:text-white">
      {/* ── Bright Philippine Swine Farm Backdrop Image ──────────────────── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-700 bg-cover bg-center"
        style={{
          backgroundImage: `url('/assets/philippine_pig_farm.png')`,
          opacity: isIn3DSection ? 0.85 : 0,
        }}
      />

      {/* ── Fixed 3D R3F Canvas Container ─────────────────────────────────── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-700"
        style={{
          opacity: isIn3DSection ? 1 : 0,
        }}
      >
        <Canvas
          camera={{ position: [0, 4, 10], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
        >
          <CameraController scrollProgress={scrollProgress} />
          <Suspense fallback={null}>
            <PigPen3D scrollProgress={scrollProgress} activeNode={null} showBoundingBoxes={showBoundingBoxes} />
          </Suspense>
        </Canvas>
      </div>

      {/* ── LIGHT MODE TOP FLOATING HUD BAR ──────────────────────────────── */}
      <div
        className={`fixed top-20 sm:top-24 inset-x-0 z-40 pointer-events-none transition-all duration-500 flex justify-center px-3 sm:px-4 ${
          isIn3DSection ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="pointer-events-auto max-w-4xl w-full rounded-2xl bg-white/90 border border-slate-200/80 p-2.5 sm:p-3 shadow-xl shadow-slate-200/60 backdrop-blur-2xl flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              LIVE SPATIAL AI
            </span>
            <span className="hidden sm:inline text-slate-500 font-medium">3D Farrowing Pen Matrix</span>
          </div>

          {/* Telemetry Pills */}
          <div className="hidden sm:flex items-center gap-3 md:gap-4 text-[10px] sm:text-[11px] text-slate-700 font-medium">
            <div className="flex items-center gap-1">
              <Activity size={12} className="text-emerald-600" />
              <span>Sow: <strong className="text-emerald-700 font-bold">Standing (99.2%)</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <Eye size={12} className="text-emerald-600" />
              <span>Piglets: <strong className="text-emerald-700 font-bold">10 Active</strong></span>
            </div>
          </div>

          {/* AI Bounding Boxes Toggle Button */}
          <button
            onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] sm:text-[11px] font-semibold transition border ${
              showBoundingBoxes
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showBoundingBoxes ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            AI Boxes: {showBoundingBoxes ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── Fixed Light Mode Header with Mobile Navigation Drawer ──────────── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-2xl border-b border-slate-200 shadow-md py-3' : 'py-4 sm:py-6'}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-wider group">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
              ◈
            </div>
            <span className="font-extrabold text-slate-900">
              PRISMA <span className="text-emerald-600">ATLAS</span>
            </span>
          </a>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-mono text-slate-600">
            {['3D Pen', 'Demo Video', 'System Matrix', 'Install App'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                className="hover:text-emerald-700 transition-colors duration-200 tracking-wide uppercase font-semibold"
              >
                {item}
              </a>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            {token ? (
              <>
                <button onClick={goToDashboard} className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition">
                  Dashboard
                </button>
                <button onClick={() => { useAuthStore.getState().logout(); localStorage.removeItem('access_token'); }} className="px-4 py-2 text-xs rounded-full text-slate-500 hover:text-slate-900 transition">
                  Logout
                </button>
              </>
            ) : (
              <button onClick={() => setLoginOpen(true)} className="px-5 py-2 text-xs font-semibold rounded-full border border-slate-300 hover:bg-slate-100 text-slate-800 transition">
                Web Login
              </button>
            )}
          </div>

          {/* Mobile menu trigger */}
          <button className="md:hidden text-slate-700 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenu && (
          <div className="md:hidden border-b border-slate-200 bg-white/95 backdrop-blur-2xl px-6 py-6 space-y-4 font-mono text-xs shadow-xl animate-in slide-in-from-top-2">
            <div className="flex flex-col space-y-3">
              {['3D Pen', 'Demo Video', 'System Matrix', 'Install App'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                  onClick={() => setMobileMenu(false)}
                  className="text-slate-800 hover:text-emerald-600 font-semibold py-1 uppercase tracking-wider"
                >
                  {item}
                </a>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-200 flex flex-col gap-2.5">
              {token ? (
                <>
                  <button onClick={() => { setMobileMenu(false); goToDashboard(); }} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-center">
                    Dashboard
                  </button>
                  <button onClick={() => { setMobileMenu(false); useAuthStore.getState().logout(); localStorage.removeItem('access_token'); }} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium">
                    Logout
                  </button>
                </>
              ) : (
                <button onClick={() => { setMobileMenu(false); setLoginOpen(true); }} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-center">
                  Web Login
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── STAGE 1: LIGHT MODE HERO SECTION ─────────────────────────────── */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 pt-28 sm:pt-32 pb-16 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 sm:px-4 py-1.5 mb-6 sm:mb-8 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="inline-flex rounded-full h-2 w-2 bg-emerald-600" />
          </span>
          AI-POWERED LIVESTOCK MONITORING
        </div>

        <h1 className="text-4xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tight leading-[1.0] sm:leading-[0.95] max-w-6xl mb-4 sm:mb-6 text-slate-900 break-words">
          Precision Intelligence.{' '}
          <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-600 bg-clip-text text-transparent block sm:inline mt-1 sm:mt-0">
            Redefined.
          </span>
        </h1>

        <p className="text-sm sm:text-xl text-slate-600 max-w-2xl leading-relaxed mb-8 sm:mb-10 font-normal px-2">
          <strong>P</strong>iglet <strong>R</strong>ealtime <strong>I</strong>dentification and <strong>S</strong>ow <strong>M</strong>onitoring <strong>A</strong>ssistant. Real-time crushing risk assessment, sow posture classification, and multi-camera stream monitoring.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto max-w-sm sm:max-w-none mb-12 sm:mb-16 px-4 sm:px-0">
          <button
            onClick={handleInstallApp}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-bold text-white shadow-xl shadow-emerald-600/25 transition hover:scale-105"
          >
            <Download size={18} /> {appInstalled ? 'App Installed' : 'Install Prisma App'}
          </button>

          <button
            onClick={() => token ? goToDashboard() : setLoginOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-full border border-slate-300 hover:bg-slate-100 text-xs sm:text-sm font-semibold text-slate-800 backdrop-blur-md transition hover:scale-105"
          >
            <Globe size={18} /> Launch Web Dashboard
          </button>
        </div>

        {/* Hero Specs Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 p-4 sm:p-6 rounded-3xl bg-white/90 border border-slate-200/80 backdrop-blur-2xl max-w-4xl w-full text-center shadow-xl shadow-slate-200/50">
          <div>
            <div className="text-xl sm:text-3xl font-black text-emerald-600 font-mono">~50ms</div>
            <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Inference Speed</div>
          </div>
          <div>
            <div className="text-xl sm:text-3xl font-black text-emerald-600 font-mono">99.2%</div>
            <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 uppercase mt-0.5 font-bold">Detection Precision</div>
          </div>
          <div>
            <div className="text-xl sm:text-3xl font-black text-slate-900 font-mono">6 Class</div>
            <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 uppercase mt-0.5 font-medium">YOLOv11 Postures</div>
          </div>
          <div>
            <div className="text-xl sm:text-3xl font-black text-slate-900 font-mono">24/7</div>
            <div className="text-[10px] sm:text-[11px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Multi-Feed Sync</div>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 flex flex-col items-center gap-2 text-slate-400 text-[11px] sm:text-xs font-mono">
          <span>SCROLL TO UNVEIL 3D PEN</span>
          <div className="w-4 h-7 sm:w-5 sm:h-8 rounded-full border-2 border-slate-300 flex items-start justify-center p-1">
            <div className="w-1 h-2 rounded-full bg-emerald-600 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── STAGE 2: EXTENDED 3D SPATIAL PEN SECTION (350vh Track for 100% Orbit) ── */}
      <section id="3d-pen" className="relative z-10 min-h-[350vh] flex flex-col items-center justify-end px-4 sm:px-6 pb-24 sm:pb-32 text-center pointer-events-none">
        <div className="pointer-events-auto px-3.5 sm:px-4 py-2 rounded-full bg-white/90 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-mono backdrop-blur-xl shadow-lg flex items-center gap-2 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
          <span>360° SPATIAL ORBIT • SCROLL TO ROTATE</span>
        </div>
      </section>

      {/* ── STAGE 2.5: HERO VIDEO SHOWCASE SECTION (Pushed Below 3D Orbit) ── */}
      <section id="demo-video" className="relative z-20 py-20 sm:py-28 bg-white border-t border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
            <span className="inline-block text-xs font-mono font-semibold tracking-widest uppercase text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-3 sm:mb-4 shadow-sm">
              LIVE SYSTEM DEMO
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-3 sm:mb-4">
              Watch PRISMA ATLAS in Action
            </h2>
            <p className="text-xs sm:text-base text-slate-600 leading-relaxed font-normal">
              Real-time YOLOv11 AI detection engine performing sow posture classification, piglet tracking, and instant crushing prevention alarms.
            </p>
          </div>

          {/* High-Definition Hero Video Player Container */}
          <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-950 border border-slate-200 shadow-2xl shadow-slate-300/60 group">
            {/* Live Telemetry Overlay Header */}
            <div className="absolute top-0 inset-x-0 z-20 p-3 sm:p-6 flex items-center justify-between bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-transparent pointer-events-none text-[10px] sm:text-xs font-mono text-white">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping" />
                  LIVE DEMO STREAM
                </span>
                <span className="hidden sm:inline text-white/70">RTSP Feed #01 • 1080p 60fps</span>
              </div>
              <div className="px-2.5 sm:px-3 py-1 rounded-full bg-black/60 border border-white/10 text-white/80">
                Inference: ~48ms
              </div>
            </div>

            {/* Video Element */}
            <video
              className="w-full aspect-video object-cover"
              controls
              autoPlay
              muted
              loop
              playsInline
              poster="/assets/philippine_pig_farm.png"
            >
              <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      {/* ── STAGE 3: BENTO BOX MATRIX & CTA ─────────────────────────────── */}
      <section id="system-matrix" className="relative z-20 min-h-screen flex flex-col justify-center py-16 sm:py-24 bg-slate-100/95 backdrop-blur-xl border-t border-slate-200">
        <BentoGrid scrollProgress={scrollProgress} />

        {/* Installer & Download Section */}
        <div id="install-app" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full">
          <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-12 backdrop-blur-2xl shadow-xl shadow-slate-200/60">
            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div>
                <span className="inline-block text-[10px] sm:text-xs font-mono font-semibold tracking-widest uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 sm:px-4 py-1.5 mb-4">
                  CLIENT & EDGE INSTALLER
                </span>
                <h3 className="text-2xl sm:text-4xl font-extrabold text-slate-900 mb-3 sm:mb-4">
                  Install Prisma Atlas Edge & PWA App
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6">
                  Install our Progressive Web App directly to your desktop or download our 1-click macOS and Windows Edge Service installers for offline barn edge processing.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3">
                  <button
                    onClick={handleInstallApp}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition"
                  >
                    <Download size={16} /> {appInstalled ? 'Already Installed' : 'Install PWA App'}
                  </button>
                  <a
                    href="/downloads/edge/install-edge-control-macos.sh"
                    download
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-800 transition"
                  >
                    <Download size={16} /> macOS Installer (.sh)
                  </a>
                  <a
                    href="/downloads/edge/install-edge-control-windows.cmd"
                    download
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-800 transition"
                  >
                    <Download size={16} /> Windows Installer (.cmd)
                  </a>
                </div>
                {installMessage && (
                  <p className="text-xs text-emerald-700 mt-4 font-mono">{installMessage}</p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:p-6 font-mono text-xs space-y-3">
                <div className="text-slate-400 uppercase tracking-wider text-[10px]">System Compatibility</div>
                <div className="flex items-center justify-between text-slate-800 border-b border-slate-200/60 pb-2 text-[11px] sm:text-xs">
                  <span>Apple Silicon (macOS)</span>
                  <span className="text-emerald-700 font-semibold">Native M1/M2/M3/M4</span>
                </div>
                <div className="flex items-center justify-between text-slate-800 border-b border-slate-200/60 pb-2 text-[11px] sm:text-xs">
                  <span>Windows 10 / 11 (x64)</span>
                  <span className="text-emerald-700 font-semibold">DirectML / CUDA</span>
                </div>
                <div className="flex items-center justify-between text-slate-800 text-[11px] sm:text-xs">
                  <span>Edge Camera Protocols</span>
                  <span className="text-slate-900 font-semibold">RTSP / WebRTC / HLS</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Login Modal */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
