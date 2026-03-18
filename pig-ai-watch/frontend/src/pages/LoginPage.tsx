import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Activity, Eye, EyeOff, Sparkles } from 'lucide-react';
import { authApi } from '@/api';
import { useAuthStore } from '@/store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error('Please enter username and password');
      return;
    }

    setIsLoading(true);

    try {
      const tokenData = await authApi.login(username, password);
      localStorage.setItem('access_token', tokenData.access_token);
      
      const user = await authApi.getCurrentUser();
      setAuth(user, tokenData.access_token);
      
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed. Please try again.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-400/20 dark:bg-primary-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-300/20 dark:bg-secondary-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent-400/10 dark:bg-accent-500/5 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="bg-white/95 dark:bg-slate-800/90 backdrop-blur-xl rounded-3xl shadow-2xl dark:shadow-dark-xl p-8 border border-white/20 dark:border-slate-700/50">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative group">
              <div className="h-20 w-20 bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 rounded-2xl flex items-center justify-center shadow-xl shadow-primary-500/30 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
                <Activity className="h-12 w-12 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent-400 animate-pulse" />
            </div>
            <h1 className="mt-4 text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              PRISMA ATLAS
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1">Farrowing Monitoring Dashboard</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-400 transition-all duration-200 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-400 transition-all duration-200 pr-12 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-all duration-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-slate-700/30 rounded-xl border border-gray-100 dark:border-slate-600/50">
            <p className="text-xs text-gray-500 dark:text-slate-400 text-center mb-2 font-medium">Demo Credentials</p>
            <div className="text-sm text-gray-600 dark:text-slate-300 text-center font-mono">
              <span className="text-gray-400 dark:text-slate-500">user:</span> admin
              <span className="mx-3 text-gray-300 dark:text-slate-600">|</span>
              <span className="text-gray-400 dark:text-slate-500">pass:</span> admin123
            </div>
          </div>
        </div>

        <p className="text-center text-white/70 dark:text-slate-500 text-sm mt-6">
          © 2024 PRISMA ATLAS. AI-Powered Farrowing Monitoring.
        </p>
      </div>
    </div>
  );
}
