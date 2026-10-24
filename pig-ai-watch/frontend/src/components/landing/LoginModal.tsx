/**
 * PRISMA ATLAS — Login Sidebar Drawer (Landing Page)
 * Sleek right-sliding frosted glass drawer matching the landing page theme.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
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
} from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { authApi } from '@/api';
import { useAuthStore } from '@/store';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const googleEnabled = !!googleClientId;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState<number[]>([]);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Lock body scroll and listen for Escape key when drawer is open
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // Lockout countdown
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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
      toast.success('Welcome back to PRISMA ATLAS!');
      onClose();
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Invalid username or password';
      setError(msg);
      const now = Date.now();
      const newAttempts = [...attempts.filter(t => now - t < 15 * 60 * 1000), now];
      setAttempts(newAttempts);
      if (newAttempts.length >= MAX_ATTEMPTS) {
        setLockedUntil(now + LOCKOUT_MS);
      }
    } finally {
      setLoading(false);
    }
  }, [username, password, attempts, lockedUntil, setAuth, navigate, onClose]);

  const handleGoogleSuccess = useCallback(async (credentialResponse: any) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    setError('');
    try {
      const tokenData = await authApi.googleLogin(credentialResponse.credential);
      localStorage.setItem('access_token', tokenData.access_token);
      const user = await authApi.getCurrentUser();
      setAuth(user, tokenData.access_token);
      toast.success('Google sign-in successful!');
      onClose();
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }, [setAuth, navigate, onClose]);

  const fillDemo = () => {
    setUsername('admin');
    setPassword('admin123');
    setError('');
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
          {/* Backdrop Overlay */}
          <motion.div
            key="login-backdrop"
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            onClick={onClose}
          />

          {/* Slide-over Right Sidebar Panel */}
          <motion.aside
            key="login-sidebar"
            aria-label="Login Sidebar"
            className="relative w-full max-w-md sm:max-w-[460px] h-full bg-white/95 backdrop-blur-2xl border-l border-slate-200/90 shadow-[-16px_0_48px_rgba(15,23,42,0.12)] z-10 flex flex-col justify-between overflow-y-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.82 }}
          >
            {/* Top Bar */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-mono font-medium text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>EDGE VISION SECURE</span>
              </div>

              <button
                onClick={onClose}
                className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="Close (Esc)"
              >
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-600 border border-slate-200 rounded px-1.5 py-0.5">
                  ESC
                </span>
                <X size={18} />
              </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 sm:px-8 py-6 space-y-6">
              {/* Brand Header */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-600/25">
                    <Sparkles size={24} className="stroke-[2.2]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
                      Sign In to <span className="text-emerald-600">PRISMA</span> ATLAS
                    </h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      FARROWING TELEMETRY & VISION CORE
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Enter your credentials to monitor real-time farrowing crates, posture anomalies, and automated crushing alerts.
                </p>
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono flex items-center justify-between">
                    <span>Username</span>
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin"
                      autoComplete="username"
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono flex items-center justify-between">
                    <span>Password</span>
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 rounded-xl p-3"
                  >
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                    <span className="leading-snug">{error}</span>
                  </motion.div>
                )}

                {/* Rate-limit lockout notification */}
                {lockedUntil && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-start gap-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl p-3"
                  >
                    <KeyRound size={16} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <div className="font-semibold">Too many failed attempts</div>
                      <div className="text-amber-700 mt-0.5">
                        Security lock in effect. Try again in {Math.floor(countdown / 60)}:
                        {String(countdown % 60).padStart(2, '0')}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || !!lockedUntil}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group mt-2"
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
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                    Demo Credentials
                  </span>
                  <button
                    type="button"
                    onClick={fillDemo}
                    className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold underline underline-offset-2 transition"
                  >
                    Auto-fill Demo
                  </button>
                </div>
                <div className="flex items-center justify-between font-mono text-slate-700 text-xs bg-white px-3 py-2 rounded-lg border border-slate-200/60">
                  <span>
                    <span className="text-slate-400">user:</span> admin
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    <span className="text-slate-400">pass:</span> admin123
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-mono text-slate-400 uppercase tracking-wider absolute">
                  or
                </span>
              </div>

              {/* Google Sign-in */}
              <div className="flex flex-col items-center justify-center pt-1">
                {googleEnabled ? (
                  <div className="w-full flex justify-center [&>div]:w-full">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => setError('Google sign-in failed')}
                      theme="outline"
                      shape="rectangular"
                      text="signin_with"
                      width="100%"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
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
                    }}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 font-medium text-sm transition-all shadow-sm group"
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
            </div>

            {/* Bottom Footer Info */}
            <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1.5 text-slate-600">
                <ShieldCheck size={14} className="text-emerald-600" />
                256-bit TLS Encrypted
              </span>
              <span className="text-slate-400">PRISMA ATLAS · Edge v2.4</span>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
