/**
 * PRISMA ATLAS — Dedicated Login Page (/login)
 * Fully consistent with the PRISMA ATLAS Edge Vision & Telemetry design system.
 * Features:
 * - Emerald/Slate futuristic glassmorphism aesthetic matching the Landing Page & Dashboard
 * - High-security lockout protection with rate-limit countdown
 * - Google Sign-In integration via @react-oauth/google and branded Google fallback
 * - 1-Click Demo credential auto-fill for testing
 * - Deep link redirection support (location.state.from)
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { authApi } from '@/api';
import { useAuthStore } from '@/store';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const hasGoogleClientId = googleClientId.length > 0;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState<number[]>([]);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  const from = location.state?.from?.pathname || '/';

  // Lockout countdown timer
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (left <= 0) {
        setLockedUntil(null);
        setAttempts([]);
        setCountdown(0);
      } else {
        setCountdown(left);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // Standard username & password login
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (lockedUntil) return;

      if (!username.trim() || !password.trim()) {
        setError('Please enter your username and password');
        return;
      }

      setError('');
      setLoading(true);

      try {
        const tokenData = await authApi.login(username, password);
        localStorage.setItem('access_token', tokenData.access_token);
        const user = await authApi.getCurrentUser();
        setAuth(user, tokenData.access_token);
        toast.success(`Welcome back, ${user.full_name || user.username}!`);
        navigate(from, { replace: true });
      } catch (err: any) {
        const msg = err.response?.data?.detail || 'Invalid username or password';
        setError(msg);
        const now = Date.now();
        const newAttempts = [...attempts.filter((t) => now - t < 15 * 60 * 1000), now];
        setAttempts(newAttempts);
        if (newAttempts.length >= MAX_ATTEMPTS) {
          setLockedUntil(now + LOCKOUT_MS);
          toast.error('Too many failed attempts. Temporary lockout initiated.');
        }
      } finally {
        setLoading(false);
      }
    },
    [username, password, attempts, lockedUntil, setAuth, navigate, from]
  );

  // Google OAuth credential callback
  const handleGoogleSuccess = useCallback(
    async (credentialResponse: any) => {
      if (!credentialResponse.credential) return;
      setLoading(true);
      setError('');
      try {
        const tokenData = await authApi.googleLogin(credentialResponse.credential);
        localStorage.setItem('access_token', tokenData.access_token);
        const user = await authApi.getCurrentUser();
        setAuth(user, tokenData.access_token);
        toast.success(`Signed in with Google as ${user.full_name || user.username}`);
        navigate(from, { replace: true });
      } catch (err: any) {
        const msg = err.response?.data?.detail || 'Google sign-in failed. Please try again.';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [setAuth, navigate, from]
  );

  const fillDemo = () => {
    setUsername('admin');
    setPassword('admin123');
    setError('');
  };

  const handleCustomGoogleClick = () => {
    if (!hasGoogleClientId) {
      toast(
        () => (
          <div className="text-xs space-y-1">
            <p className="font-semibold text-slate-900">Google Sign-In Configuration</p>
            <p className="text-slate-600">
              To connect your Google Workspace account, configure <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">VITE_GOOGLE_CLIENT_ID</code> in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">frontend/.env</code>.
            </p>
            <p className="text-emerald-700 font-medium pt-1">
              Tip: You can use the 1-click <b>Demo Credentials</b> above to test immediately!
            </p>
          </div>
        ),
        {
          duration: 6000,
          icon: 'ℹ️',
          style: {
            borderRadius: '16px',
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          },
        }
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden select-none">
      {/* ── Background Farm Texture & Ambient Lighting ────────────────── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-20 bg-cover bg-center filter blur-[1px]"
        style={{ backgroundImage: `url('/assets/philippine_pig_farm.png')` }}
      />
      <div className="fixed inset-0 z-0 pointer-events-none bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950" />

      {/* Futuristic Telemetry Grid Pattern */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(to_right,#10b9810a_1px,transparent_1px),linear-gradient(to_bottom,#10b9810a_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Floating Animated Gradient Glows */}
      <div className="fixed -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="fixed -bottom-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Top Bar / Header ────────────────────────────────────────── */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <Link
          to="/welcome"
          className="group inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-white transition-colors duration-200"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-all">
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          </div>
          <span className="hidden sm:inline">Back to Overview</span>
        </Link>

        {/* Center Logo on mobile or brand pill */}
        <Link to="/welcome" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black shadow-lg shadow-emerald-600/30 group-hover:scale-105 transition-transform">
            ◈
          </div>
          <span className="font-extrabold text-base sm:text-lg tracking-wider text-white">
            PRISMA <span className="text-emerald-400">ATLAS</span>
          </span>
        </Link>

        {/* Security badge and Setup Guide link */}
        <div className="flex items-center gap-3">
          <Link
            to="/setup-guide"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-400 hover:text-white transition"
          >
            <BookOpen size={14} className="text-emerald-400" />
            <span>Setup Guide</span>
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-[11px] font-mono font-medium text-emerald-400 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">EDGE VISION SECURE</span>
            <span className="sm:hidden">SECURE</span>
          </div>
        </div>
      </header>

      {/* ── Main Content Area: Centered Glassmorphic Card ────────────── */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-[440px]"
        >
          <div className="bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
            {/* Brand Header Inside Card */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                  <Sparkles size={22} className="stroke-[2.2]" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white leading-tight">
                    Sign In to <span className="text-emerald-400">PRISMA</span> ATLAS
                  </h1>
                  <p className="text-[11px] font-mono text-emerald-400/90 mt-0.5 tracking-wide">
                    FARROWING TELEMETRY & VISION CORE
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Access real-time farrowing crates, posture anomalies, and automated crushing alert telemetry.
              </p>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-start gap-2.5 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/80 rounded-xl p-3"
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                  <span className="leading-snug">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Rate-limit lockout notification */}
            <AnimatePresence>
              {lockedUntil && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-start gap-2.5 text-xs text-amber-300 bg-amber-950/50 border border-amber-800/80 rounded-xl p-3"
                >
                  <KeyRound size={16} className="shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-semibold text-amber-200">Too many failed attempts</div>
                    <div className="text-amber-300/80 mt-0.5">
                      Security lock active. Retry in {Math.floor(countdown / 60)}:
                      {String(countdown % 60).padStart(2, '0')}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                  <span>Username</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin"
                    autoComplete="username"
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder:text-slate-600 text-sm focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                  <span>Password</span>
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-950/70 border border-slate-800 text-white placeholder:text-slate-600 text-sm focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !!lockedUntil}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Demo Credentials Box */}
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                  Demo Credentials
                </span>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 transition"
                >
                  Auto-fill Demo
                </button>
              </div>
              <div className="flex items-center justify-between font-mono text-slate-300 text-xs bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800/80">
                <span>
                  <span className="text-slate-500">user:</span> admin
                </span>
                <span className="text-slate-700">|</span>
                <span>
                  <span className="text-slate-500">pass:</span> admin123
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[10px] font-mono text-slate-500 uppercase tracking-wider absolute">
                or continue with
              </span>
            </div>

            {/* Google Sign-in Option */}
            <div className="flex flex-col items-center justify-center">
              {hasGoogleClientId ? (
                <div className="w-full flex justify-center [&>div]:w-full">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => {
                      setError('Google sign-in was cancelled or failed.');
                      toast.error('Google sign-in failed');
                    }}
                    theme="filled_black"
                    shape="rectangular"
                    text="signin_with"
                    width="100%"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCustomGoogleClick}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 font-medium text-sm transition-all shadow-sm group"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>

            {/* Bottom Security Info Inside Card */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck size={14} className="text-emerald-500" />
                256-bit TLS Encrypted
              </span>
              <span className="text-slate-500">PRISMA ATLAS · Edge v2.4</span>
            </div>
          </div>
        </motion.div>
      </main>

      {/* ── Page Footer ──────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full py-4 text-center text-xs font-mono text-slate-600">
        <p>© 2026 PRISMA ATLAS. Autonomous Swine Farrowing Vision & Telemetry System.</p>
      </footer>
    </div>
  );
}
