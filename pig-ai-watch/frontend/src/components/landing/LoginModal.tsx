/**
 * PRISMA ATLAS — Login Modal (Landing Page)
 * Animated slide-in modal with rate limiting
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Lock, Loader2 } from 'lucide-react';
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState<number[]>([]);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

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
      setError('Please enter username and password');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const tokenData = await authApi.login(username, password);
      localStorage.setItem('access_token', tokenData.access_token);
      const user = await authApi.getCurrentUser();
      setAuth(user, tokenData.access_token);
      onClose();
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Login failed';
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden"
            initial={{ scale: 0.9, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Close */}
            <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition" title="Close">
              <X size={20} />
            </button>

            {/* Header */}
            <div className="text-center pt-8 pb-4 px-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-pink-500 text-white text-2xl font-bold mb-4">
                ◈
              </div>
              <h2 className="text-xl font-bold text-white">Welcome Back</h2>
              <p className="text-sm text-white/50 mt-1">Sign in to access your dashboard</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Username</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition"
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.div>
              )}

              {lockedUntil && (
                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Too many attempts. Try again in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !!lockedUntil}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

              <p className="text-center text-xs text-white/30 pt-2">
                Don't have an account? <span className="text-indigo-400">Contact Admin</span>
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
