import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Suspense, lazy, useEffect } from 'react';
import { Layout, ProtectedRoute } from '@/components';
import { useAuthStore } from '@/store';
import { requestNotificationPermission } from '@/lib/notifications';

// ── Lazy-loaded pages (code splitting) ──────────────────────────────────────
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LiveMonitoringPage = lazy(() => import('@/pages/LiveMonitoringPage'));
const AlertsPage = lazy(() => import('@/pages/AlertsPage'));
const EventLogsPage = lazy(() => import('@/pages/EventLogsPage'));
const SowProfilesPage = lazy(() => import('@/pages/SowProfilesPage'));
const SowArchivesPage = lazy(() => import('@/pages/SowArchivesPage'));
const SowDetailPage = lazy(() => import('@/pages/SowDetailPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const BehaviorLogsPage = lazy(() => import('@/pages/BehaviorLogsPage'));
const TasksPage = lazy(() => import('@/pages/TasksPage'));
const FarrowingPage = lazy(() => import('@/pages/FarrowingPage'));
const CameraSetupPage = lazy(() => import('@/pages/CameraSetupPage'));
const PenMonitorPage = lazy(() => import('@/pages/PenMonitorPage'));
const ReplayPage = lazy(() => import('@/pages/ReplayPage'));
const StatsPage = lazy(() => import('@/pages/StatsPage'));
const RecordingSchedulePage = lazy(() => import('@/pages/RecordingSchedulePage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Handle token from URL (passed from landing page)
function TokenHandler() {
  const setAuth = useAuthStore((state) => state.setAuth);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      console.log('Token received from landing page');
      // Store token in localStorage
      localStorage.setItem('access_token', token);
      
      // Fetch user info and set auth state
      const apiBase = import.meta.env.VITE_API_URL || '';
      fetch(`${apiBase}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(user => {
          setAuth(user, token);
          console.log('Auth state set for user:', user.username);
        })
        .catch(err => console.error('Failed to fetch user info:', err));
      
      // Clean URL (remove token param)
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setAuth]);
  
  return null;
}

function NotificationBootstrap() {
  const navigate = useNavigate();

  useEffect(() => {
    requestNotificationPermission().catch(() => {});

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ penId?: number | string }>;
      const penIdRaw = customEvent.detail?.penId;
      if (penIdRaw === undefined || penIdRaw === null) {
        return;
      }
      const penId = Number(penIdRaw);
      if (!Number.isNaN(penId)) {
        navigate(`/pen/${penId}`);
      }
    };

    window.addEventListener('push-alert-open-pen', handler as EventListener);
    return () => {
      window.removeEventListener('push-alert-open-pen', handler as EventListener);
    };
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TokenHandler />
        <NotificationBootstrap />
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" /></div>}>
        <Routes>
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="monitoring" element={<LiveMonitoringPage />} />
            <Route path="test-pen" element={<></>} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="events" element={<EventLogsPage />} />
            <Route path="sows" element={<SowProfilesPage />} />
            <Route path="sows/archives" element={<SowArchivesPage />} />
            <Route path="sows/:sowId" element={<SowDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="behavior-logs" element={<BehaviorLogsPage />} />
            <Route path="test-pen" element={<></>} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="farrowing" element={<FarrowingPage />} />
            <Route path="camera-setup" element={<CameraSetupPage />} />
            <Route path="pen/:penId" element={<PenMonitorPage />} />
            <Route path="replay" element={<ReplayPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="recording-schedule" element={<RecordingSchedulePage />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
    </QueryClientProvider>
  );
}
