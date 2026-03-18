import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Bell, 
  ClipboardList, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  X,
  Activity,
  ListTodo,
  Heart,
  Sparkles,
  Camera,
  Eye,
  BarChart3,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, useAlertStore } from '@/store';
import clsx from 'clsx';
import TestPenPage from '@/pages/TestPenPage';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Live Monitoring', href: '/monitoring', icon: Video },
  { name: 'Test Pen', href: '/test-pen', icon: Video },
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
  { name: 'Farrowing', href: '/farrowing', icon: Heart },
  { name: 'Replay', href: '/replay', icon: Eye },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  { name: 'Event Logs', href: '/events', icon: ClipboardList },
  { name: 'Sow Profiles', href: '/sows', icon: Users },
  { name: 'Statistics', href: '/stats', icon: BarChart3 },
  { name: 'Camera Setup', href: '/camera-setup', icon: Camera },
  { name: 'Settings', href: '/settings', icon: Settings },
];

// Get landing page URL based on environment
const getLandingPageUrl = () => {
  // Check if running in Electron
  if (window.electronAPI) {
    return null; // Stay in app, don't redirect
  }
  // Development: redirect to landing page
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://localhost:3000';
  }
  // Production: same origin
  return window.location.origin;
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const unreadCount = useAlertStore((state) => state.unreadCount);

  const handleLogout = () => {
    logout();
    
    // Redirect to landing page with logout flag
    const landingUrl = getLandingPageUrl();
    if (landingUrl) {
      window.location.href = `${landingUrl}?logout=true`;
    } else {
      // Electron or same-origin: just navigate to login
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl dark:shadow-dark-xl',
          'border-r border-gray-200/50 dark:border-slate-700/50',
          'transform transition-all duration-300 ease-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200/50 dark:border-slate-700/50">
          <div className="flex items-center gap-3 group">
            <div className="relative">
              <Activity className="h-8 w-8 text-primary-500 transition-transform duration-300 group-hover:scale-110" />
              <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 dark:from-primary-400 dark:to-primary-300 bg-clip-text text-transparent">
              PRISMA ATLAS
            </span>
          </div>
          <button 
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item, index) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              style={{ animationDelay: `${index * 50}ms` }}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                  'transition-all duration-200 ease-out group animate-fade-in',
                  isActive
                    ? 'bg-gradient-to-r from-primary-500/20 to-primary-500/10 dark:from-primary-500/30 dark:to-primary-500/10 text-primary-600 dark:text-primary-400 shadow-sm dark:shadow-glow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100/80 dark:hover:bg-slate-800/80 hover:text-gray-900 dark:hover:text-white hover:translate-x-1'
                )
              }
            >
              <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              <span className="transition-all duration-200">{item.name}</span>
              {item.name === 'Alerts' && unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-bounce-in shadow-lg shadow-red-500/30">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User Profile Section */}
        <div className="border-t border-gray-200/50 dark:border-slate-700/50 p-4 bg-gray-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3 mb-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/25 transition-transform duration-200 group-hover:scale-105">
              <span className="text-white font-semibold">
                {user?.full_name?.[0] || user?.username?.[0] || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {user?.full_name || user?.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 capitalize flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                {user?.role}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all duration-200 group"
          >
            <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 transition-all duration-300">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 flex items-center px-4 lg:px-6 shadow-sm">
          <button
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl mr-3 transition-all duration-200 hover:scale-105 active:scale-95"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-gray-600 dark:text-slate-400" />
          </button>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-3">
            <NavLink
              to="/alerts"
              className="relative p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 group"
            >
              <Bell className="h-5 w-5 text-gray-600 dark:text-slate-400 transition-transform duration-200 group-hover:rotate-12" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
              )}
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 animate-fade-in">
          {/* TestPenPage stays mounted at all times so detection doesn't stop.
              It is hidden (display:none) when the user is not on /test-pen. */}
          <div style={{ display: location.pathname === '/test-pen' ? 'block' : 'none' }}>
            <TestPenPage />
          </div>
          {location.pathname !== '/test-pen' && <Outlet />}
        </main>
      </div>
    </div>
  );
}
