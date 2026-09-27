/**
 * PRISMA ATLAS — Landing Page Component
 * Crisp Light Mode Theme with cinematic 360° 3D pen camera orbit,
 * live AI simulated alert pop-ups during mid-orbit, a movie-style lens zoom-in transition,
 * and a scroll-driven fullscreen YouTube demo showcase.
 */
import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  Radio,
  Maximize2,
  Minimize2,
} from 'lucide-react';

import PigPen3D from '../components/landing/PigPen3D';
import BentoGrid from '../components/landing/BentoGrid';
import LoginModal from '../components/landing/LoginModal';
import MobileDevice3D from '../components/landing/MobileDevice3D';
import { useAuthStore } from '../store';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const TYPED_HEADER_WORDS = [
  'In Real Time.',
  'Zero Crushing.',
  'Instant Alerts.',
  'Posture Tracking.',
  '24/7 Watch.',
];

// ── LIVE SYSTEM DEMO VIDEO URL ──────────────────────────────────────────────
// Paste ANY YouTube link here (e.g. 'https://youtu.be/VR2NbQUNJMU' or
// 'https://www.youtube.com/watch?v=...') or a direct MP4 URL!
export const DEMO_VIDEO_URL = 'https://youtu.be/VR2NbQUNJMU';

function parseDemoVideo(url: string) {
  const isDirectVideo = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  const embedUrl = ytMatch && ytMatch[1]
    ? `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}&controls=1&modestbranding=1&rel=0&playsinline=1`
    : url;
  return { isDirectVideo, embedUrl };
}

/* ─── Aspect-Aware 360° Orbit & Cinematic CCTV Lens Zoom-In Camera ───────── */
function CameraController({ scrollProgress }: { scrollProgress: number }) {
  const cameraTarget = useRef(new THREE.Vector3(0, 1.2, 0));
  const currentPos = useRef(new THREE.Vector3(0, 4, 10));

  useFrame(({ camera, size }) => {
    const isMobile = size.width < 640;
    const radius = isMobile ? 7.8 : 5.6;

    const targetPos = new THREE.Vector3(0, 4, 10);
    const targetLook = new THREE.Vector3(0, 1.2, 0);

    const orbitEndPos = new THREE.Vector3(0, 3.2, radius);
    // CCTV Camera position is BEHIND the sow at [0, 2.30, -2.15]
    const cctvOpticalCenter = new THREE.Vector3(0, 2.18, -2.15);
    // Close-up cinematic approach right in front of the optical lens glass
    const cctvLensCloseUp = new THREE.Vector3(0, 2.14, -1.90);

    if (scrollProgress < 0.12) {
      // Stage 1: Hero view
      targetPos.set(0, 3.8, isMobile ? 11 : 8.5);
      targetLook.set(0, 1.0, 0);
      if ('fov' in camera) {
        (camera as THREE.PerspectiveCamera).fov = 45;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    } else if (scrollProgress <= 0.48) {
      // Stage 2A: Full 360° Camera Orbit around the farrowing pen (0.12 to 0.48)
      const penProgress = (scrollProgress - 0.12) / 0.36; // 0.0 to 1.0
      const angle = penProgress * Math.PI * 2.0; // 0 to 360 degrees
      const height = 3.2 + Math.sin(penProgress * Math.PI) * 0.5;
      targetPos.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      targetLook.set(0, 0.9, 0);
      if ('fov' in camera) {
        (camera as THREE.PerspectiveCamera).fov = 45;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    } else if (scrollProgress <= 0.68) {
      // Stage 2B: High-Production Movie Zoom-In Directly into the CCTV Lens (0.48 to 0.68)
      const zoomProgress = (scrollProgress - 0.48) / 0.20; // 0.0 to 1.0
      // Smooth exponential acceleration curve into the lens aperture
      const smoothZoom = Math.pow(zoomProgress, 2.4);

      // Arc waypoint so camera glides gracefully over the crate into optical alignment
      const arcMidpoint = new THREE.Vector3(0, 2.8, -0.2);
      const tempP1 = new THREE.Vector3().lerpVectors(orbitEndPos, arcMidpoint, zoomProgress);
      const tempP2 = new THREE.Vector3().lerpVectors(arcMidpoint, cctvLensCloseUp, smoothZoom);

      targetPos.lerpVectors(tempP1, tempP2, zoomProgress);
      targetLook.lerpVectors(new THREE.Vector3(0, 0.9, 0), cctvOpticalCenter, Math.min(1, zoomProgress * 1.4));

      if ('fov' in camera) {
        // High-end cinematic telephoto compression
        (camera as THREE.PerspectiveCamera).fov = 45 - smoothZoom * 28; // 45° down to 17° FOV
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    } else {
      // Stage 2C: Full completion hold inside lens before page transition
      targetPos.copy(cctvLensCloseUp);
      targetLook.copy(cctvOpticalCenter);
    }

    currentPos.current.lerp(targetPos, 0.11);
    cameraTarget.current.lerp(targetLook, 0.11);

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
  const [isNavHovered, setIsNavHovered] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [appInstalled, setAppInstalled] = useState(false);

  const [videoScrollProgress, setVideoScrollProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const mainContainerRef = useRef<HTMLDivElement>(null!);
  const videoWrapperRef = useRef<HTMLDivElement>(null!);
  const demoSectionRef = useRef<HTMLDivElement>(null!);

  // Fast typewriter animation for 3rd header text
  const [typedWordIndex, setTypedWordIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [isDeletingWord, setIsDeletingWord] = useState(false);

  useEffect(() => {
    const currentTargetWord = TYPED_HEADER_WORDS[typedWordIndex % TYPED_HEADER_WORDS.length];
    let timer: NodeJS.Timeout;

    if (!isDeletingWord) {
      if (typedText.length < currentTargetWord.length) {
        timer = setTimeout(() => {
          setTypedText(currentTargetWord.slice(0, typedText.length + 1));
        }, 45); // fast typing speed
      } else {
        timer = setTimeout(() => {
          setIsDeletingWord(true);
        }, 1200); // pause duration on complete word
      }
    } else {
      if (typedText.length > 0) {
        timer = setTimeout(() => {
          setTypedText(currentTargetWord.slice(0, typedText.length - 1));
        }, 22); // fast backspace / delete speed
      } else {
        setIsDeletingWord(false);
        setTypedWordIndex((prev) => (prev + 1) % TYPED_HEADER_WORDS.length);
      }
    }

    return () => clearTimeout(timer);
  }, [typedText, isDeletingWord, typedWordIndex]);

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

      // Track scroll progress within the demo video section for fullscreen scaling
      if (demoSectionRef.current) {
        const rect = demoSectionRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        // Progress 0 when section enters bottom, 1 when section occupies center/top
        const progress = Math.min(1, Math.max(0, (windowHeight - rect.top) / (windowHeight + rect.height * 0.4)));
        setVideoScrollProgress(progress);
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

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const goToDashboard = () => {
    navigate('/');
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

  const toggleFullscreen = async () => {
    if (!videoWrapperRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await videoWrapperRef.current.requestFullscreen();
      } catch (err) {
        console.warn('Fullscreen request failed:', err);
      }
    } else {
      await document.exitFullscreen();
    }
  };

  // Smooth continuous transition alphas
  const canvasAlpha = useMemo(() => {
    if (scrollProgress < 0.08) return 0;
    if (scrollProgress < 0.16) return (scrollProgress - 0.08) / 0.08; // Smooth fade in
    if (scrollProgress <= 0.64) return 1.0; // Steady full opacity during 360° orbit & initial fly-in
    if (scrollProgress <= 0.76) return Math.max(0, 1 - (scrollProgress - 0.64) / 0.12); // Complete fade out
    return 0;
  }, [scrollProgress]);

  const backdropAlpha = canvasAlpha * 0.85;
  const isHudVisible = canvasAlpha > 0.35 && scrollProgress <= 0.50;

  // Movie-style fade out to black as camera enters the CCTV optical glass
  const movieFadeAlpha = useMemo(() => {
    if (scrollProgress < 0.58) return 0;
    if (scrollProgress < 0.68) return (scrollProgress - 0.58) / 0.10; // Fade into black lens interior
    if (scrollProgress <= 0.78) return Math.max(0, 1 - (scrollProgress - 0.68) / 0.10); // Dissolve into live video player
    return 0;
  }, [scrollProgress]);

  // AI Live Simulated Alert Popups during mid-orbit (0.22 to 0.48)
  const isAlert1Visible = scrollProgress >= 0.22 && scrollProgress <= 0.48;
  const isAlert2Visible = scrollProgress >= 0.28 && scrollProgress <= 0.48;
  const isAlert3Visible = scrollProgress >= 0.34 && scrollProgress <= 0.48;

  // Calculate dynamic on-scroll video expansion metrics
  const smoothScaleProgress = useMemo(() => {
    // Normalizes between progress 0.35 and 0.85
    return Math.min(1, Math.max(0, (videoScrollProgress - 0.35) / 0.50));
  }, [videoScrollProgress]);

  const videoScale = 0.90 + smoothScaleProgress * 0.10; // 0.90 to 1.00
  const videoBorderRadius = Math.max(0, (1 - smoothScaleProgress) * 28); // 28px down to 0px for full screen bleed
  const videoPadding = Math.max(0, (1 - smoothScaleProgress) * 16); // Padding shrinks to allow full bleed
  const demoVideoConfig = useMemo(() => parseDemoVideo(DEMO_VIDEO_URL), []);

  return (
    <div ref={mainContainerRef} className="relative min-h-[650vh] bg-slate-50 text-slate-900 overflow-x-hidden selection:bg-emerald-500 selection:text-white">
      {/* ── Bright Philippine Swine Farm Backdrop Image ──────────────────── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-500 bg-cover bg-center"
        style={{
          backgroundImage: `url('/assets/philippine_pig_farm.png')`,
          opacity: backdropAlpha,
        }}
      />

      {/* ── Fixed 3D R3F Canvas Container with Smooth Scroll Fade ─────────── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-500"
        style={{
          opacity: canvasAlpha,
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

      {/* ── Cinematic Movie Fade-Out to Black Overlay (Lens Entrance) ─────── */}
      <div
        className="fixed inset-0 z-20 pointer-events-none transition-opacity duration-200 bg-black"
        style={{
          opacity: movieFadeAlpha,
        }}
      />

      {/* ── LIGHT MODE TOP FLOATING HUD BAR ──────────────────────────────── */}
      <div
        className={`fixed top-20 sm:top-24 inset-x-0 z-40 pointer-events-none transition-all duration-500 flex justify-center px-3 sm:px-4 ${
          isHudVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
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

      {/* ── SIMULATED LIVE AI ALERT POP-UPS (TRIGGERED HALFWAY THROUGH ORBIT) ── */}
      <div className="fixed bottom-8 sm:bottom-12 right-4 sm:right-8 z-40 pointer-events-none flex flex-col gap-2.5 sm:gap-3 max-w-sm w-full">
        {/* Alert 1: Critical Crushing Risk Alert */}
        <div
          className={`pointer-events-auto transform transition-all duration-500 ease-out rounded-2xl p-3.5 bg-white/95 border border-rose-200 shadow-xl shadow-rose-500/10 backdrop-blur-2xl ${
            isAlert1Visible
              ? 'opacity-100 translate-x-0 scale-100'
              : 'opacity-0 translate-x-12 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 shrink-0 animate-bounce">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  CRITICAL CRUSHING RISK
                </span>
                <span className="text-[9px] font-mono text-slate-400">~48ms</span>
              </div>
              <p className="text-xs font-bold text-slate-900 mt-0.5 leading-snug">
                Sow Posture Shift: Rolling Left
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-normal">
                Piglet <strong className="text-rose-600">PGL-03</strong> detected in danger corridor. Ultrasonic buzzer pulse deployed.
              </p>
            </div>
          </div>
        </div>

        {/* Alert 2: Posture Telemetry Update */}
        <div
          className={`pointer-events-auto transform transition-all duration-500 delay-100 ease-out rounded-2xl p-3.5 bg-white/95 border border-amber-200 shadow-xl shadow-amber-500/10 backdrop-blur-2xl ${
            isAlert2Visible
              ? 'opacity-100 translate-x-0 scale-100'
              : 'opacity-0 translate-x-12 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
              <Radio size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700">
                  YOLOv11 POSTURE TELEMETRY
                </span>
                <span className="text-[9px] font-mono text-emerald-600 font-bold">99.2% Conf</span>
              </div>
              <p className="text-xs font-bold text-slate-900 mt-0.5 leading-snug">
                SOW-01: Lateral Recumbency
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-normal">
                Safe nursing posture active • 10/10 Piglets positioned at teat zones.
              </p>
            </div>
          </div>
        </div>

        {/* Alert 3: Edge Notification Dispatched */}
        <div
          className={`pointer-events-auto transform transition-all duration-500 delay-200 ease-out rounded-2xl p-3 bg-white/95 border border-emerald-200 shadow-xl shadow-emerald-500/10 backdrop-blur-2xl ${
            isAlert3Visible
              ? 'opacity-100 translate-x-0 scale-100'
              : 'opacity-0 translate-x-12 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono font-bold text-emerald-700">
                EDGE DISPATCH CONFIRMED
              </div>
              <p className="text-[11px] text-slate-700 font-medium">
                Telegram & Web Push Alert delivered to Barn Manager
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fixed Light Mode Header with Mobile Navigation Drawer ──────────── */}
      {/* Invisible Hover Sensor Zone at the top edge when scrolled to trigger navbar reveal */}
      {scrolled && !isNavHovered && (
        <div
          className="fixed top-0 inset-x-0 h-6 z-50 pointer-events-auto"
          onMouseEnter={() => setIsNavHovered(true)}
        />
      )}

      <header
        onMouseEnter={() => setIsNavHovered(true)}
        onMouseLeave={() => setIsNavHovered(false)}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ease-out ${
          !scrolled || isNavHovered || mobileMenu
            ? scrolled
              ? 'translate-y-0 opacity-100 bg-white/95 backdrop-blur-2xl border-b border-slate-200/90 shadow-md py-3'
              : 'translate-y-0 opacity-100 py-4 sm:py-6'
            : '-translate-y-full opacity-0 pointer-events-none py-3'
        }`}
      >
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
          <nav className="hidden md:flex items-center gap-7 text-xs font-mono text-slate-600">
            {['3D Pen', 'Demo Video', 'Features', 'Install App'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                className="hover:text-emerald-700 transition-colors duration-200 tracking-wide uppercase font-semibold"
              >
                {item}
              </a>
            ))}
            <a
              href="/setup-guide"
              className="text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 px-3 py-1.5 rounded-full border border-emerald-200/80 transition-colors duration-200 tracking-wide uppercase font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <span>Setup Guide</span>
            </a>
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
              {['3D Pen', 'Demo Video', 'Features', 'Install App'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                  onClick={() => setMobileMenu(false)}
                  className="text-slate-800 hover:text-emerald-600 font-semibold py-1 uppercase tracking-wider"
                >
                  {item}
                </a>
              ))}
              <a
                href="/setup-guide"
                onClick={() => setMobileMenu(false)}
                className="text-emerald-700 hover:text-emerald-800 font-semibold py-1 uppercase tracking-wider flex items-center justify-between bg-emerald-50/80 px-3 py-2 rounded-lg border border-emerald-200/60"
              >
                <span>Setup Guide</span>
                <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-mono font-bold">DOCS</span>
              </a>
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

      {/* ── STAGE 1: LIGHT MODE HERO SECTION WITH 3D MOBILE MODEL ON THE SIDE ── */}
      <section className="relative z-10 min-h-screen flex flex-col justify-center px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* Left Column: Hero Headline, Copy, Action Buttons & Realtime Metrics */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 sm:px-4 py-1.5 mb-5 sm:mb-6 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="inline-flex rounded-full h-2 w-2 bg-emerald-600" />
              </span>
              PIGLET CRUSHING PREVENTION & MONITORING
            </div>

            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.02] mb-4 sm:mb-5 text-slate-900 break-words">
              Protect Piglets.{' '}
              <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-600 bg-clip-text text-transparent block sm:inline mt-1 sm:mt-0">
                {typedText || ' '}
                <span className="inline-block w-[3px] h-[0.82em] bg-emerald-600 ml-1.5 translate-y-[2px] animate-pulse" />
              </span>
            </h1>

            <p className="text-sm sm:text-lg text-slate-600 max-w-xl leading-relaxed mb-6 sm:mb-8 font-normal">
              <strong>P</strong>iglet <strong>R</strong>ealtime <strong>I</strong>dentification and <strong>S</strong>ow <strong>M</strong>onitoring <strong>A</strong>ssistant. Continuously tracks sow posture in farrowing crates and alerts caretakers before piglets get crushed.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 w-full sm:w-auto max-w-sm sm:max-w-none mb-8 sm:mb-10">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-white/90 border border-slate-200/80 backdrop-blur-2xl w-full text-center shadow-lg shadow-slate-200/40">
              <div>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">~50ms</div>
                <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Alert Response</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">99.2%</div>
                <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-bold">Detection Accuracy</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">6 Postures</div>
                <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Sow Posture Classes</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">24/7</div>
                <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Live Camera Feeds</div>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Perspective Mobile Model with Image Placeholder */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center mt-6 lg:mt-0">
            {/* Replace imageSrc with your custom screenshot URL (e.g. '/assets/your_mobile_screenshot.png') */}
            <MobileDevice3D
              imageSrc="/assets/philippine_pig_farm.png"
            />
            <span className="text-[10px] font-mono text-slate-400 mt-4 tracking-wider uppercase">
              Mobile Web App & Instant Push Alerts
            </span>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="mt-10 sm:mt-14 flex flex-col items-center gap-2 text-slate-400 text-[11px] sm:text-xs font-mono">
          <span>SCROLL TO EXPLORE PEN</span>
          <div className="w-4 h-7 sm:w-5 sm:h-8 rounded-full border-2 border-slate-300 flex items-start justify-center p-1">
            <div className="w-1 h-2 rounded-full bg-emerald-600 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── STAGE 2: EXTENDED 3D SPATIAL PEN SECTION (450vh Track for 100% Orbit & CCTV Zoom) ── */}
      <section id="3d-pen" className="relative z-10 min-h-[450vh] flex flex-col items-center justify-end px-4 sm:px-6 pb-24 sm:pb-32 text-center pointer-events-none">
        <div className="pointer-events-auto px-3.5 sm:px-4 py-2 rounded-full bg-white/90 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-mono backdrop-blur-xl shadow-lg flex items-center gap-2 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
          <span>360° SPATIAL ORBIT • ZOOM INTO AI CCTV LENS</span>
        </div>
      </section>

      {/* ── STAGE 2.5: HERO VIDEO SHOWCASE SECTION (Entered from CCTV Lens with Scroll Fullscreen Animation) ── */}
      <section
        id="demo-video"
        ref={demoSectionRef}
        className="relative z-20 py-20 sm:py-28 bg-white border-t border-b border-slate-200 transition-all duration-300"
      >
        <div
          className="mx-auto transition-all duration-500 ease-out"
          style={{
            maxWidth: smoothScaleProgress > 0.6 ? '100%' : '72rem',
            paddingLeft: `${videoPadding}px`,
            paddingRight: `${videoPadding}px`,
          }}
        >
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

          {/* High-Definition Hero Video Player Container with On-Scroll Fullscreen Animation */}
          <div
            ref={videoWrapperRef}
            className="relative overflow-hidden bg-slate-950 border border-slate-200 shadow-2xl shadow-slate-300/60 transition-all duration-300 ease-out mx-auto group"
            style={{
              transform: `scale(${videoScale})`,
              borderRadius: `${videoBorderRadius}px`,
              transformOrigin: 'center center',
            }}
          >
            {/* Live Telemetry Overlay Header */}
            <div className="absolute top-0 inset-x-0 z-20 p-3 sm:p-6 flex items-center justify-between bg-gradient-to-b from-slate-950/85 via-slate-950/40 to-transparent pointer-events-none text-[10px] sm:text-xs font-mono text-white">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping" />
                  LIVE DEMO STREAM
                </span>
                <span className="hidden sm:inline text-white/70">YOLOv11 Inference • 1080p 60fps</span>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto">
                <div className="px-2.5 sm:px-3 py-1 rounded-full bg-black/60 border border-white/10 text-white/80">
                  Inference: ~48ms
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-full bg-black/60 border border-white/10 hover:bg-emerald-600 text-white transition flex items-center justify-center"
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>

            {/* Embedded YouTube / MP4 Video with Autoplay and Fullscreen Support */}
            <div className="w-full aspect-video bg-black flex items-center justify-center">
              {demoVideoConfig.isDirectVideo ? (
                <video
                  src={DEMO_VIDEO_URL}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                <iframe
                  src={demoVideoConfig.embedUrl}
                  title="PRISMA ATLAS Live System Demo"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              )}
            </div>
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
