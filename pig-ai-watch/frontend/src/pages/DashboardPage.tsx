import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  MapPin,
  Baby,
  Shield,
  Video,
  Cpu,
  Activity,
} from 'lucide-react';
import { AlertCard, RiskGauge } from '@/components';
import { AIBriefingCard } from '@/components/AIBriefingCard';
import { useDashboardStats, usePenStatus, useAlerts, useUpdateAlert } from '@/hooks';
import { useTranslation } from '@/hooks/useTranslation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDashboardStore, useTestPenStore } from '@/store';
import { behaviorLogger, FarrowingLikelihood } from '@/services/behaviorLogger';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: stats } = useDashboardStats();
  const { data: penStatuses } = usePenStatus();
  const { data: recentAlerts } = useAlerts({ limit: 5, is_resolved: false });
  const updateAlert = useUpdateAlert();

  const { setStats, setPenStatuses } = useDashboardStore();
  const { latestResult: testPenResult, isRunning: testPenRunning, totalFrames } = useTestPenStore();

  const [farrowing, setFarrowing] = useState<FarrowingLikelihood | null>(null);

  // Fetch farrowing likelihood
  useEffect(() => {
    const fetchFL = async () => {
      try {
        const penId = penStatuses?.[0]?.pen_id || 1;
        const fl = await behaviorLogger.getFarrowingLikelihood(penId, 12);
        setFarrowing(fl);
      } catch (err) { console.warn('FL fetch failed', err); }
    };
    fetchFL();
    const i = setInterval(fetchFL, 12000);
    return () => clearInterval(i);
  }, [penStatuses]);

  useWebSocket({
    onAlert: () => {
      // Alert notifications are handled in the shared WebSocket hook.
    },
  });

  useEffect(() => { if (stats) setStats(stats); }, [stats, setStats]);
  useEffect(() => { if (penStatuses) setPenStatuses(penStatuses); }, [penStatuses, setPenStatuses]);

  const handleResolveAlert = (alertId: number) => {
    updateAlert.mutate(
      { id: alertId, data: { is_resolved: true } },
      {
        onSuccess: () => toast.success('Alert resolved'),
        onError: () => toast.error('Failed to resolve alert'),
      }
    );
  };

  const totalSows = stats?.total_sows || 0;
  const totalPiglets = stats?.total_piglets || 0;
  const activeAlerts = stats?.active_alerts || 0;

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-5">
      {/* Compact hero header with mini-stats */}
      <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-r from-primary-600 via-primary-500 to-emerald-400 dark:from-primary-800 dark:via-primary-700 dark:to-emerald-600">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 160" preserveAspectRatio="none">
            <circle cx="720" cy="10" r="120" fill="white" />
            <circle cx="60" cy="150" r="60" fill="white" />
          </svg>
        </div>
        <div className="relative px-5 sm:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{t('dashboard')}</h1>
              <p className="text-white/70 text-sm">{t('dashboardSubtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <div className="text-center bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5">
                  <p className="text-lg font-bold text-white">{totalSows}</p>
                  <p className="text-[9px] text-white/60 uppercase tracking-wide">Sows</p>
                </div>
                <div className="text-center bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5">
                  <p className="text-lg font-bold text-white">{totalPiglets}</p>
                  <p className="text-[9px] text-white/60 uppercase tracking-wide">Piglets</p>
                </div>
                {activeAlerts > 0 && (
                  <div className="text-center bg-red-500/40 backdrop-blur-sm rounded-xl px-3 py-1.5">
                    <p className="text-lg font-bold text-white">{activeAlerts}</p>
                    <p className="text-[9px] text-white/60 uppercase tracking-wide">Alerts</p>
                  </div>
                )}
              </div>
              <Link
                to="/stats"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-medium backdrop-blur-sm transition-colors"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                All Stats
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* AI Morning Briefing Widget */}
      <AIBriefingCard penData={penStatuses || []} />

      {/* Farrowing Likelihood (compact) */}
      {farrowing && (
        <div className={clsx(
          'flex items-center justify-between rounded-2xl px-5 py-4 border shadow-sm',
          farrowing.likelihood === 'High' ? 'bg-red-50 dark:bg-red-900/15 border-red-200/60 dark:border-red-700/50' :
          farrowing.likelihood === 'Moderate' ? 'bg-yellow-50 dark:bg-yellow-900/15 border-yellow-200/60 dark:border-yellow-700/50' :
          'bg-green-50 dark:bg-green-900/15 border-green-200/60 dark:border-green-700/50'
        )}>
          <div className="flex items-center gap-3">
            <div className={clsx('p-2 rounded-xl', farrowing.likelihood === 'High' ? 'bg-red-100 dark:bg-red-800/50' : farrowing.likelihood === 'Moderate' ? 'bg-yellow-100 dark:bg-yellow-800/50' : 'bg-green-100 dark:bg-green-800/50')}>
              <Activity className={clsx('h-4 w-4', farrowing.likelihood === 'High' ? 'text-red-600' : farrowing.likelihood === 'Moderate' ? 'text-yellow-600' : 'text-green-600')} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Farrowing: {farrowing.score}/100 — {farrowing.likelihood}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {farrowing.expected_window_hours != null ? `~${farrowing.expected_window_hours}h` : farrowing.message || 'Start monitoring to collect data.'}
              </p>
            </div>
          </div>
          <div className={clsx(
            'text-xl font-bold px-3 py-1 rounded-xl',
            farrowing.score >= 70 ? 'bg-red-200/60 text-red-800 dark:bg-red-800/40 dark:text-red-200' :
            farrowing.score >= 40 ? 'bg-yellow-200/60 text-yellow-800 dark:bg-yellow-800/40 dark:text-yellow-200' :
            'bg-green-200/60 text-green-800 dark:bg-green-800/40 dark:text-green-200'
          )}>
            {farrowing.score}
          </div>
        </div>
      )}

      {/* Pen Cards Grid (mobile-first, tappable icons) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pens</h2>
          <Link to="/monitoring" className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 font-medium flex items-center gap-1">
            View live <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {(!penStatuses || penStatuses.length === 0) ? (
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 p-10 text-center shadow-sm">
            <MapPin className="h-10 w-10 mx-auto text-gray-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-slate-400">{t('noActivePens')}</p>
            <Link to="/monitoring" className="mt-3 inline-block text-xs text-primary-500 font-medium hover:underline">
              Add pens in Live Monitoring
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {penStatuses.map((pen) => {
              const risk = pen.crushing_risk || 0;
              const riskColor = risk >= 0.65 ? 'text-red-500' : risk >= 0.4 ? 'text-amber-500' : 'text-primary-500';
              const riskBg = risk >= 0.65 ? 'bg-red-50 dark:bg-red-900/20 border-red-200/60 dark:border-red-700/50' :
                risk >= 0.4 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/60 dark:border-amber-700/50' :
                'bg-white dark:bg-slate-800/60 border-gray-200/60 dark:border-slate-700/50';

              return (
                <button
                  key={pen.pen_id}
                  onClick={() => navigate(`/pen/${pen.pen_id}`)}
                  className={clsx(
                    'relative flex flex-col items-center justify-center rounded-2xl border p-4 shadow-sm transition-all duration-200',
                    riskBg, 'hover:shadow-md hover:-translate-y-0.5 active:scale-95 cursor-pointer'
                  )}
                  title={`${pen.pen_name} — ${pen.piglet_count} piglets — Risk ${(risk * 100).toFixed(0)}%`}
                >
                  <MapPin className={clsx('h-6 w-6 mb-1.5', riskColor)} />
                  <span className="text-xs font-semibold text-gray-900 dark:text-white truncate w-full text-center">{pen.pen_name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-slate-500">
                    {pen.piglet_count} <Baby className="inline h-2.5 w-2.5 -mt-0.5" />
                  </span>
                  {risk >= 0.4 && (
                    <div className={clsx(
                      'absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full',
                      risk >= 0.65 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
                    )} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column: Risk + Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-primary-500 dark:text-primary-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('overallRisk')}</h2>
          </div>
          <div className="flex justify-center">
            <RiskGauge
              value={penStatuses && penStatuses.length > 0 ? penStatuses.reduce((sum, pen) => sum + (pen.crushing_risk || 0), 0) / penStatuses.length : 0}
              size="lg"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('recentAlerts')}</h2>
            </div>
            <Link to="/alerts" className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium">
              {t('viewAll')}
            </Link>
          </div>
          <div className="px-5 pb-5 space-y-2.5">
            {recentAlerts?.slice(0, 3).map((alert) => (
              <AlertCard key={alert.id} alert={alert} onResolve={() => handleResolveAlert(alert.id)} />
            ))}
            {(!recentAlerts || recentAlerts.length === 0) && (
              <div className="text-center py-6 text-gray-400 dark:text-slate-500">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('noActiveAlerts')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test Pen widget (compact) */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary-500 dark:text-primary-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Test Pen</h2>
          </div>
          <Link to="/test-pen" className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium flex items-center gap-1">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="px-5 pb-5">
          {testPenRunning && testPenResult ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Detecting — {totalFrames} frames
                </span>
                <span className="text-xs text-gray-400">{testPenResult.inferenceTimeMs.toFixed(0)} ms</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-2.5">
                  <p className="text-lg font-bold text-pink-600 dark:text-pink-400">{testPenResult.sowCount}</p>
                  <p className="text-[10px] text-gray-500 uppercase">Sows</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-2.5">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{testPenResult.pigletCount}</p>
                  <p className="text-[10px] text-gray-500 uppercase">Piglets</p>
                </div>
                <div className={clsx('rounded-xl p-2.5', testPenResult.crushingRisk > 0.6 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-slate-700/30')}>
                  <p className={clsx('text-lg font-bold', testPenResult.crushingRisk > 0.6 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300')}>
                    {(testPenResult.crushingRisk * 100).toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">Risk</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-5 text-gray-400 dark:text-slate-500">
              <Video className="h-7 w-7 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active detection</p>
              <Link to="/test-pen" className="text-xs text-primary-500 hover:underline mt-1 inline-block">Start Test Pen →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
