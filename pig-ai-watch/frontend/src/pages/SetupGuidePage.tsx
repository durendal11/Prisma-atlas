/**
 * PRISMA ATLAS — Comprehensive Edge Service & Camera Setup Walkthrough
 * Sleek, engineering-grade documentation matching the exact Landing Page aesthetic:
 * Porcelain white cards, subtle emerald cursor spotlighting, framer-motion scroll
 * reveal animations for each division, interactive RTSP URL generator, OS-specific edge installers,
 * and step-by-step pen mapping.
 */
import { useState, useRef, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Camera,
  Wifi,
  Key,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Download,
  BookOpen,
  ArrowRight,
  HelpCircle,
  Cpu,
  Sliders,
  ShieldCheck,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store';

// ── Reusable Spotlight Card matching Landing Page BentoGrid ──────────────────
interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

function SpotlightCard({ children, className = '', id }: SpotlightCardProps) {
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
      id={id}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative rounded-3xl bg-white border border-slate-200/80 p-7 sm:p-9 overflow-hidden backdrop-blur-2xl transition-all duration-300 ease-out shadow-lg shadow-slate-200/50 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10 ${className}`}
    >
      {/* Interactive Cursor Spotlight Glow */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-3xl"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.08), transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ── Camera Brand Presets ──────────────────────────────────────────────────────
interface CameraPreset {
  brand: string;
  badge: string;
  defaultPort: number;
  template: string;
  subTemplate: string;
  notes: string;
}

const CAMERA_PRESETS: CameraPreset[] = [
  {
    brand: 'Hikvision',
    badge: 'ColorVu / Pro Series',
    defaultPort: 554,
    template: 'rtsp://{username}:{password}@{ip}:{port}/Streaming/Channels/101',
    subTemplate: 'rtsp://{username}:{password}@{ip}:{port}/Streaming/Channels/102',
    notes: 'Channel 101 is 1080p Main Stream. Use 102 for lower-bandwidth Sub Stream.',
  },
  {
    brand: 'Dahua',
    badge: 'Dahua / Imou Pro',
    defaultPort: 554,
    template: 'rtsp://{username}:{password}@{ip}:{port}/cam/realmonitor?channel=1&subtype=0',
    subTemplate: 'rtsp://{username}:{password}@{ip}:{port}/cam/realmonitor?channel=1&subtype=1',
    notes: 'subtype=0 is Main Stream (1080p), subtype=1 is Sub Stream (efficient inference).',
  },
  {
    brand: 'Reolink',
    badge: 'PoE / RLC Series',
    defaultPort: 554,
    template: 'rtsp://{username}:{password}@{ip}:{port}/h264Preview_01_main',
    subTemplate: 'rtsp://{username}:{password}@{ip}:{port}/h264Preview_01_sub',
    notes: 'Make sure RTSP protocol is toggled ON under Network Settings in Reolink Client.',
  },
  {
    brand: 'TP-Link Tapo',
    badge: 'C100 / C200 / C310',
    defaultPort: 554,
    template: 'rtsp://{username}:{password}@{ip}:{port}/stream1',
    subTemplate: 'rtsp://{username}:{password}@{ip}:{port}/stream2',
    notes: 'Configure a dedicated "Camera Account" in Tapo App > Device Settings > Advanced.',
  },
  {
    brand: 'Uniview',
    badge: 'UNV Prime Series',
    defaultPort: 554,
    template: 'rtsp://{username}:{password}@{ip}:{port}/unicast/c1/s0/live',
    subTemplate: 'rtsp://{username}:{password}@{ip}:{port}/unicast/c1/s1/live',
    notes: 's0 indicates Main Stream, s1 indicates Sub Stream for lightweight edge ingestion.',
  },
  {
    brand: 'Generic ONVIF',
    badge: 'Standard RFC-2326',
    defaultPort: 554,
    template: 'rtsp://{username}:{password}@{ip}:{port}/live/ch0',
    subTemplate: 'rtsp://{username}:{password}@{ip}:{port}/live/ch1',
    notes: 'Universal RTSP stream endpoint compatible with 95% of surveillance IP cameras.',
  },
];

export default function SetupGuidePage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();

  // RTSP Interactive Generator State
  const [selectedBrand, setSelectedBrand] = useState('Hikvision');
  const [ipAddress, setIpAddress] = useState('192.168.1.120');
  const [port, setPort] = useState('554');
  const [username, setUsername] = useState('prisma_edge');
  const [password, setPassword] = useState('PrismaBarn2026!');
  const [streamType, setStreamType] = useState<'main' | 'sub'>('main');

  // Edge OS Command Tab
  const [selectedOS, setSelectedOS] = useState<'macos' | 'windows' | 'linux'>('macos');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active Preset
  const currentPreset = CAMERA_PRESETS.find((p) => p.brand === selectedBrand) || CAMERA_PRESETS[0];

  // Dynamic RTSP URL
  const generatedRtspUrl = (streamType === 'main' ? currentPreset.template : currentPreset.subTemplate)
    .replace('{username}', encodeURIComponent(username || 'admin'))
    .replace('{password}', encodeURIComponent(password || 'password'))
    .replace('{ip}', ipAddress || '192.168.1.100')
    .replace('{port}', port || '554');

  const copyToClipboard = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard!`, {
      style: {
        background: '#064e3b',
        color: '#ecfdf5',
        fontWeight: 'bold',
        fontSize: '13px',
      },
    });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const stepsList = [
    { id: 'step-1', number: '01', title: 'Network Setup', desc: 'Subnets, PoE, Port 554' },
    { id: 'step-2', number: '02', title: 'Camera Accounts', desc: 'Brand templates & credentials' },
    { id: 'step-3', number: '03', title: 'URL Builder', desc: 'Real-time address generator' },
    { id: 'step-4', number: '04', title: 'Edge Service', desc: 'macOS, Windows, & Linux' },
    { id: 'step-5', number: '05', title: 'Dashboard Setup', desc: 'Add camera to pen' },
    { id: 'step-6', number: '06', title: 'Troubleshooting', desc: 'Fix common issues' },
  ];

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 font-sans selection:bg-emerald-500 selection:text-white">
      {/* ── Fixed Navigation Bar matching LandingPage ─────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-md bg-white/80 border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          
          {/* Brand Logo & Back Link */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/welcome')}
              className="flex items-center gap-2.5 text-left group"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-emerald-600/30 group-hover:scale-105 transition-transform">
                P
              </div>
              <div>
                <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 font-mono block leading-none">
                  PRISMA ATLAS
                </span>
                <span className="text-[10px] font-mono text-emerald-700 tracking-wider uppercase font-semibold">
                  Operator Docs
                </span>
              </div>
            </button>

            <span className="hidden sm:inline-block text-slate-300">/</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              <BookOpen size={13} className="text-emerald-600" />
              v2.4 Comprehensive Setup
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/camera-setup')}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 transition"
            >
              <Camera size={14} className="text-emerald-600" />
              <span>Camera Setup</span>
            </button>

            {token ? (
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:scale-105"
              >
                <span>Open Dashboard</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:scale-105"
              >
                <span>Login</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section with Landing Page Typography & Metrics Bar ────────── */}
      <section className="relative pt-28 sm:pt-36 pb-14 px-4 sm:px-6 lg:px-8 border-b border-slate-200/80 bg-gradient-to-b from-white via-white to-slate-50/50">
        <div className="max-w-5xl mx-auto text-center">
          
          {/* Status Kicker */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-6 shadow-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="inline-flex rounded-full h-2 w-2 bg-emerald-600" />
            </span>
            CAMERA & EDGE SETUP GUIDE
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.08] mb-5 text-slate-900"
          >
            How to Set Up Your Cameras &{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent block sm:inline">
              Edge Service
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-10 font-normal"
          >
            Follow this guide to connect your barn cameras via RTSP, run the edge detection service on your local computer, and link each camera to its farrowing pen in the dashboard.
          </motion.p>

          {/* Metrics / Key Specs Bar matching LandingPage */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-white/90 border border-slate-200/80 backdrop-blur-2xl max-w-4xl mx-auto text-center shadow-lg shadow-slate-200/40"
          >
            <div>
              <div className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">Port 554</div>
              <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Default RTSP Port</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">&lt; 50ms</div>
              <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-bold">Alert Response Time</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">100% Local</div>
              <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-medium">Video Kept in Barn</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">3 OS</div>
              <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5 font-medium">macOS • Win • Linux</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Sticky Steps Index Bar ────────────────────────────────────────── */}
      <nav className="sticky top-16 sm:top-20 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 overflow-x-auto no-scrollbar text-xs font-mono">
          <div className="flex items-center gap-2">
            {stepsList.map((step) => (
              <a
                key={step.id}
                href={`#${step.id}`}
                className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200/70 text-slate-700 transition font-medium flex items-center gap-1.5"
              >
                <span className="font-bold text-emerald-600">{step.number}</span>
                <span>{step.title}</span>
              </a>
            ))}
          </div>

          <a
            href="#step-3"
            className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shrink-0"
          >
            <Sliders size={13} />
            <span>URL Builder</span>
          </a>
        </div>
      </nav>

      {/* ── Main Content Container with Framer-Motion Animated Sections ───── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">
        
        {/* ================================================================= */}
        {/* STEP 1: ARCHITECTURE & NETWORK PREREQUISITES */}
        {/* ================================================================= */}
        <motion.section
          id="step-1"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="scroll-mt-36 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shadow-emerald-600/25">
              01
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Network Setup & Architecture
              </h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                Local network and IP requirements
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-6">
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal">
              PRISMA ATLAS processes video directly on a local computer in your barn (like a Mac Mini or PC). This means crushing alerts trigger in under 50ms without waiting for internet uploads, while the web dashboard gives you live status, alert history, and pen controls from any device.
            </p>

            {/* Interactive Flow Diagram */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 relative group hover:border-blue-400 transition">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                  <Camera size={20} />
                </div>
                <div className="font-bold text-slate-900 mb-1">1. Barn IP Cameras</div>
                <div className="text-slate-500 text-[11px] leading-relaxed mb-3">
                  PoE or Wi-Fi cameras streaming RTSP video at 1080p or 720p.
                </div>
                <div className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                  Port 554 (RTSP)
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 relative group hover:border-emerald-400 transition shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-3 shadow-md shadow-emerald-600/30">
                  <Cpu size={20} />
                </div>
                <div className="font-bold text-slate-900 mb-1">2. Local Edge Computer</div>
                <div className="text-slate-600 text-[11px] leading-relaxed mb-3">
                  Pulls camera frames, tracks sow posture, and flags crushing risks in &lt;50ms.
                </div>
                <div className="text-[10px] text-emerald-800 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-300 inline-block">
                  Local Barn Service
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 relative group hover:border-slate-400 transition">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-3">
                  <Server size={20} />
                </div>
                <div className="font-bold text-slate-900 mb-1">3. Web Dashboard</div>
                <div className="text-slate-500 text-[11px] leading-relaxed mb-3">
                  Displays live alerts, sow posture logs, and camera previews on your phone or PC.
                </div>
                <div className="text-[10px] text-slate-700 font-semibold bg-slate-200/60 px-2 py-0.5 rounded border border-slate-300 inline-block">
                  HTTPS / WebSockets
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div className="border-t border-slate-200/80 pt-6 space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-bold">
                Network Checklist
              </h4>
              <ul className="grid sm:grid-cols-2 gap-3 text-xs text-slate-700">
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Static IP:</strong> Assign a fixed IP or DHCP reservation to each camera in your router (e.g. <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px]">192.168.1.120</code>).</span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Same Network:</strong> Ensure the edge computer (Mac Mini/PC) and cameras are plugged into the same local network switch or router.</span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Port 554 RTSP:</strong> Verify that Port 554 isn't blocked by local router or firewall rules between the computer and cameras.</span>
                </li>
                <li className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Use Sub-Streams:</strong> If running more than 4 cameras on one computer, use the 720p or 1080p sub-stream for smooth, responsive detection.</span>
                </li>
              </ul>
            </div>
          </SpotlightCard>
        </motion.section>

        {/* ================================================================= */}
        {/* STEP 2: CAMERA CONFIGURATION & RTSP CREDENTIALS */}
        {/* ================================================================= */}
        <motion.section
          id="step-2"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="scroll-mt-36 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shadow-emerald-600/25">
              02
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Camera Accounts & Brand Templates
              </h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                RTSP credentials and stream formats
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-6">
            {/* Operator Safety Advisory */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-xs mb-1">
                  <Key size={15} className="text-emerald-600" />
                  <span>Create a Separate Camera Account</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Avoid putting your primary camera <code className="bg-white px-1 rounded font-mono">admin</code> password into config files. In your camera's web settings, create a secondary user (e.g. <code className="bg-white px-1 rounded font-mono">prisma_edge</code>) with live view permissions only.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-xs mb-1">
                  <Wifi size={15} className="text-blue-600" />
                  <span>Avoid Symbols in Passwords</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Symbols like <code className="bg-white px-1 rounded font-mono">@</code>, <code className="bg-white px-1 rounded font-mono">:</code>, or <code className="bg-white px-1 rounded font-mono">/</code> can confuse RTSP URL parsers. Use simple alphanumeric passwords with hyphens or underscores instead.
                </p>
              </div>
            </div>

            {/* Brand Presets Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-slate-700 uppercase">Supported Camera Brands</span>
                <span className="text-[11px] text-slate-500">Standard RTSP</span>
              </div>
              <div className="divide-y divide-slate-100">
                {CAMERA_PRESETS.map((preset) => (
                  <div
                    key={preset.brand}
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      selectedBrand === preset.brand ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{preset.brand}</span>
                        <span className="text-[10px] font-mono font-semibold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{preset.notes}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setSelectedBrand(preset.brand);
                          toast.success(`Selected ${preset.brand}`);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition ${
                          selectedBrand === preset.brand
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-400'
                        }`}
                      >
                        {selectedBrand === preset.brand ? 'Selected' : 'Use Template'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        </motion.section>

        {/* ================================================================= */}
        {/* STEP 3: INTERACTIVE RTSP STREAM BUILDER & VALIDATOR */}
        {/* ================================================================= */}
        <motion.section
          id="step-3"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="scroll-mt-36 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shadow-emerald-600/25">
              03
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                RTSP Stream URL Builder
              </h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                Generate and test your camera feed URL
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-6">
            <p className="text-sm text-slate-600">
              Choose your camera brand, enter the local IP address and login credentials, then copy the generated RTSP address for your Edge <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">.env</code> file or the dashboard.
            </p>

            {/* Brand Chips */}
            <div className="flex flex-wrap gap-2">
              {CAMERA_PRESETS.map((p) => (
                <button
                  key={p.brand}
                  onClick={() => setSelectedBrand(p.brand)}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium transition ${
                    selectedBrand === p.brand
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.brand}
                </button>
              ))}
            </div>

            {/* Input Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-mono text-slate-600 uppercase font-semibold mb-1">
                  Camera IP Address
                </label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.120"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-600 uppercase font-semibold mb-1">
                  RTSP Port
                </label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="554"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-600 uppercase font-semibold mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="prisma_edge"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-600 uppercase font-semibold mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Stream Quality Selector */}
            <div className="flex items-center gap-3 pt-2">
              <span className="text-xs font-mono uppercase text-slate-500 font-semibold">Stream Type:</span>
              <button
                onClick={() => setStreamType('main')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                  streamType === 'main'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Main Stream (1080p High-Res)
              </button>
              <button
                onClick={() => setStreamType('sub')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                  streamType === 'sub'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sub Stream (Recommended for multi-camera)
              </button>
            </div>

            {/* Output Display Card */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 text-emerald-400 font-mono text-xs shadow-inner space-y-3">
              <div className="flex items-center justify-between text-slate-400 text-[11px] border-b border-slate-800 pb-2">
                <span className="flex items-center gap-2 text-slate-300">
                  <Terminal size={14} className="text-emerald-500" />
                  Generated RTSP Address
                </span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                  {currentPreset.brand}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 break-all">
                <code className="text-emerald-300 text-xs sm:text-sm font-bold tracking-tight">
                  {generatedRtspUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(generatedRtspUrl, 'rtsp-url', 'RTSP URL')}
                  className="shrink-0 p-2 sm:px-3 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-sans font-bold flex items-center gap-1.5 transition"
                >
                  {copiedKey === 'rtsp-url' ? <Check size={14} /> : <Copy size={14} />}
                  <span className="hidden sm:inline">Copy URL</span>
                </button>
              </div>
            </div>

            {/* Fast Verification Command */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
              <div className="space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  Test Video Playback Before Running Edge Service
                </div>
                <div className="text-slate-500 text-[11px]">
                  Confirm video opens smoothly on your local machine using VLC or terminal:
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-800 text-[11px]">
                  ffplay -rtsp_transport tcp "{generatedRtspUrl}"
                </code>
                <button
                  onClick={() =>
                    copyToClipboard(`ffplay -rtsp_transport tcp "${generatedRtspUrl}"`, 'ffplay-cmd', 'FFplay command')
                  }
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600"
                  title="Copy Command"
                >
                  {copiedKey === 'ffplay-cmd' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </SpotlightCard>
        </motion.section>

        {/* ================================================================= */}
        {/* STEP 4: STARTING THE LOCAL EDGE SERVICE */}
        {/* ================================================================= */}
        <motion.section
          id="step-4"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="scroll-mt-36 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shadow-emerald-600/25">
              04
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Run the Edge Service
              </h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                Install and start the edge background service
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-6">
            <p className="text-sm text-slate-700 leading-relaxed">
              The edge service connects directly to your cameras over RTSP, runs posture detection, and sends instant alerts to the dashboard whenever dangerous movements are detected.
            </p>

            {/* Operating System Switcher Tabs */}
            <div className="flex border-b border-slate-200 font-mono text-xs">
              {[
                { id: 'macos', label: 'macOS (Apple Silicon / Intel)' },
                { id: 'windows', label: 'Windows 10 / 11' },
                { id: 'linux', label: 'Ubuntu / Debian Server' },
              ].map((os) => (
                <button
                  key={os.id}
                  onClick={() => setSelectedOS(os.id as any)}
                  className={`px-4 sm:px-6 py-3 font-bold border-b-2 transition ${
                    selectedOS === os.id
                      ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {os.label}
                </button>
              ))}
            </div>

            {/* OS Specific Instructions */}
            <AnimatePresence mode="wait">
              {selectedOS === 'macos' && (
                <motion.div
                  key="macos"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 font-mono text-xs"
                >
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="font-bold text-slate-900 flex items-center justify-between">
                      <span>Method A: One-Line Terminal Installer</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-slate-600 font-sans text-xs">
                      Open Terminal and paste this command to set up the environment and launch the service:
                    </p>
                    <div className="bg-slate-900 text-emerald-300 p-3.5 rounded-xl flex items-center justify-between">
                      <code>bash &lt;(curl -sSL https://raw.githubusercontent.com/arcelmacasling/prisma-atlas/main/pig-ai-watch/edge/install-edge-control-macos.sh)</code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            'bash <(curl -sSL https://raw.githubusercontent.com/arcelmacasling/prisma-atlas/main/pig-ai-watch/edge/install-edge-control-macos.sh)',
                            'mac-curl',
                            'macOS Install Command'
                          )
                        }
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white ml-2 shrink-0"
                      >
                        {copiedKey === 'mac-curl' ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-900">Method B: Manual Setup</div>
                    <pre className="bg-slate-900 text-slate-200 p-3.5 rounded-xl overflow-x-auto text-[11px] leading-relaxed">
{`cd pig-ai-watch/edge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Open .env and insert your camera RTSP addresses
python agent.py`}
                    </pre>
                  </div>
                </motion.div>
              )}

              {selectedOS === 'windows' && (
                <motion.div
                  key="windows"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 font-mono text-xs"
                >
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="font-bold text-slate-900 flex items-center justify-between">
                      <span>Method A: Windows Installer Script</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-slate-600 font-sans text-xs">
                      Download and run the installer script. It will configure the service to start automatically:
                    </p>
                    <div className="flex items-center gap-3">
                      <a
                        href="/downloads/edge/install-edge-control-windows.cmd"
                        download
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-sm"
                      >
                        <Download size={14} /> Download install-edge-control-windows.cmd
                      </a>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-900">Method B: Run via PowerShell</div>
                    <div className="bg-slate-900 text-emerald-300 p-3.5 rounded-xl flex items-center justify-between">
                      <code>powershell -ExecutionPolicy Bypass -File .\\install-edge-control-windows.cmd</code>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            'powershell -ExecutionPolicy Bypass -File .\\install-edge-control-windows.cmd',
                            'win-cmd',
                            'PowerShell Command'
                          )
                        }
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white ml-2 shrink-0"
                      >
                        {copiedKey === 'win-cmd' ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {selectedOS === 'linux' && (
                <motion.div
                  key="linux"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 font-mono text-xs"
                >
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="font-bold text-slate-900">Linux Background Service (systemd)</div>
                    <p className="text-slate-600 font-sans text-xs">
                      Run the service in the background so it restarts automatically on reboot:
                    </p>
                    <pre className="bg-slate-900 text-slate-200 p-3.5 rounded-xl overflow-x-auto text-[11px] leading-relaxed">
{`sudo tee /etc/systemd/system/prisma-edge.service << EOF
[Unit]
Description=PRISMA ATLAS Edge Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/prisma-atlas/pig-ai-watch/edge
ExecStart=/opt/prisma-atlas/pig-ai-watch/edge/.venv/bin/python agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now prisma-edge`}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Edge .env Configuration Box */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-slate-800">Configuration Settings (.env)</span>
                <button
                  onClick={() =>
                    copyToClipboard(
`CLOUD_API_URL=https://prisma-atlas-cloud.com/api/v1
EDGE_API_KEY=edge_secret_live_barn01
MODEL_PATH=weights/yolov11-farrowing.pt
INFERENCE_FPS=30
CAMERA_PEN_1=${generatedRtspUrl}
CAMERA_PEN_2=rtsp://user:pass@192.168.1.121:554/Streaming/Channels/101`,
                      'env-snippet',
                      'Edge .env template'
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 text-[11px] font-bold"
                >
                  {copiedKey === 'env-snippet' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>Copy .env Template</span>
                </button>
              </div>

              <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl overflow-x-auto font-mono text-xs leading-relaxed">
{`# PRISMA ATLAS Edge Settings
CLOUD_API_URL=https://prisma-atlas-cloud.com/api/v1
EDGE_API_KEY=edge_secret_live_barn01
MODEL_PATH=weights/yolov11-farrowing.pt
INFERENCE_FPS=30

# Camera RTSP Addresses
CAMERA_PEN_1=${generatedRtspUrl}
CAMERA_PEN_2=rtsp://user:pass@192.168.1.121:554/Streaming/Channels/101`}
              </pre>
            </div>

            {/* Expected Terminal Output Showcase */}
            <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-[11px] text-emerald-400">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Terminal Log (Working Normally)
                </span>
                <span>STATUS: OPERATIONAL</span>
              </div>
              <pre className="text-[11px] text-emerald-200/90 leading-relaxed overflow-x-auto">
{`[INFO] [EdgeInit] PRISMA Edge Agent started on local machine
[INFO] [RTSP] Camera feed connected: CAMERA_PEN_1 (1920x1080 @ 30 FPS)
[INFO] [Detection] Loaded posture model (Inference time: ~34ms)
[INFO] [Pen 01] Sow status: Lateral Lying | Piglets nearby: 8 | Crushing Risk: Low (0.04)
[HEARTBEAT] Status synced to Dashboard`}
              </pre>
            </div>
          </SpotlightCard>
        </motion.section>

        {/* ================================================================= */}
        {/* STEP 5: ADDING PEN & LINKING CAMERA IN DASHBOARD */}
        {/* ================================================================= */}
        <motion.section
          id="step-5"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="scroll-mt-36 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shadow-emerald-600/25">
              05
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Connect Camera to a Pen in the Dashboard
              </h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                Map camera feeds to farrowing crates
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-6">
            <p className="text-sm text-slate-700 leading-relaxed">
              Once your edge service is running, follow these steps to add the camera feed to your dashboard:
            </p>

            {/* Stepper Card */}
            <div className="space-y-4 font-mono text-xs">
              {[
                {
                  step: '5.1',
                  title: 'Open Camera Setup',
                  desc: 'In the sidebar, click Camera Setup or go directly to /camera-setup.',
                  badge: 'Dashboard',
                },
                {
                  step: '5.2',
                  title: 'Choose a Pen Slot',
                  desc: 'Click "Add Pen" or select an existing pen slot (e.g. "Pen 01 - Crate East"). Assign the Sow ID in the crate.',
                  badge: 'Pen Selection',
                },
                {
                  step: '5.3',
                  title: 'Paste RTSP Stream URL',
                  desc: 'Paste your generated RTSP address into the URL field. Click "Test Connection" to check the video feed.',
                  badge: 'Video Feed',
                },
                {
                  step: '5.4',
                  title: 'Save & Start Monitoring',
                  desc: 'Set your alert sensitivity and click Save. Live video and sow postures will immediately appear in your monitoring view.',
                  badge: 'Save & Active',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-4 hover:border-emerald-300 transition"
                >
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-300 text-emerald-700 font-bold flex items-center justify-center shrink-0 shadow-xs">
                    {item.step}
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm font-sans">{item.title}</span>
                      <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-slate-600 font-sans text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Direct Link to Camera Setup */}
            <div className="pt-2">
              <button
                onClick={() => navigate('/camera-setup')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-bold text-white shadow-xl shadow-emerald-600/25 transition hover:scale-105"
              >
                <Camera size={16} />
                <span>Open Camera Setup Page</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </SpotlightCard>
        </motion.section>

        {/* ================================================================= */}
        {/* STEP 6: DIAGNOSTIC & TROUBLESHOOTING MATRIX */}
        {/* ================================================================= */}
        <motion.section
          id="step-6"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="scroll-mt-36 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shadow-emerald-600/25">
              06
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Troubleshooting & Quick Fixes
              </h2>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                Solutions for common connection and camera issues
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4 text-xs font-sans">
              <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 text-red-800 font-bold">
                  <AlertTriangle size={16} className="text-red-600 shrink-0" />
                  <span>Connection Timed Out / Unreachable</span>
                </div>
                <ul className="text-slate-600 space-y-1 pl-4 list-disc text-[11px] leading-relaxed">
                  <li>Ping the camera IP to check if it's reachable: <code className="bg-white px-1 font-mono">ping 192.168.1.120</code>.</li>
                  <li>Check that the camera has power and the network cable is connected.</li>
                  <li>Verify that port 554 is open on your local network.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>401 Unauthorized / Bad Login</span>
                </div>
                <ul className="text-slate-600 space-y-1 pl-4 list-disc text-[11px] leading-relaxed">
                  <li>Make sure the password doesn't contain symbols like <code className="bg-white px-1 font-mono">@</code> or <code className="bg-white px-1 font-mono">:</code>.</li>
                  <li>Log into the camera's web page and confirm RTSP streaming is turned on.</li>
                  <li>For Hikvision or Dahua cameras, check that the ONVIF/RTSP user is enabled.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center gap-2 text-blue-800 font-bold">
                  <HelpCircle size={16} className="text-blue-600 shrink-0" />
                  <span>Choppy Video or Dropped Frames</span>
                </div>
                <ul className="text-slate-600 space-y-1 pl-4 list-disc text-[11px] leading-relaxed">
                  <li>Switch from the 4K main stream to a 720p or 1080p sub-stream.</li>
                  <li>Set the camera frame rate to 15–20 FPS in its video settings.</li>
                  <li>Use a wired Ethernet cable for the edge computer rather than Wi-Fi.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>Need More Help?</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Check that your edge computer and cameras share the same router, or check the system logs in your dashboard.
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-1.5 text-emerald-700 font-bold hover:underline text-xs pt-1 font-mono"
                >
                  <span>Go to System Dashboard</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </SpotlightCard>
        </motion.section>

      </main>

      {/* ── Footer matching LandingPage ───────────────────────────────────── */}
      <footer className="border-t border-slate-200/80 bg-white py-12 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[10px]">
              P
            </div>
            <span>PRISMA ATLAS LIVESTOCK INTELLIGENCE</span>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/welcome')} className="hover:text-emerald-600 transition">
              Home
            </button>
            <button onClick={() => navigate('/camera-setup')} className="hover:text-emerald-600 transition">
              Camera Setup
            </button>
            <button onClick={() => navigate('/')} className="hover:text-emerald-600 transition">
              Live Dashboard
            </button>
          </div>

          <div>
            <span>© 2026 PRISMA ATLAS. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
