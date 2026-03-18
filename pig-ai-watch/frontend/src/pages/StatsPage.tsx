import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Baby,
  AlertTriangle,
  Monitor,
  Heart,
  Activity,
  TrendingUp,
  ArrowLeft,
  BarChart3,
} from 'lucide-react';
import { useDashboardStats, usePenStatus } from '@/hooks';
import { behaviorLogger, HealthSummary, FarrowingLikelihood, FarrowingLikelihoodTrend } from '@/services/behaviorLogger';
import { useApi } from '@/hooks/useApi';
import clsx from 'clsx';

interface CleaningScheduleItem {
  pen_id: number;
  pen_name: string;
  cleanliness_score: number;
  wetness_score: number;
  last_cleaned_at: string | null;
  next_cleaning_due: string | null;
  cleaning_interval_hours: number;
  status: 'overdue' | 'due_soon' | 'ok';
  is_overdue: boolean;
}

export default function StatsPage() {
  const api = useApi();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: penStatuses } = usePenStatus();

  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [farrowing, setFarrowing] = useState<FarrowingLikelihood | null>(null);
  const [farrowingTrend, setFarrowingTrend] = useState<FarrowingLikelihoodTrend | null>(null);
  const [cleaningSchedule, setCleaningSchedule] = useState<CleaningScheduleItem[]>([]);

  useEffect(() => {
    const fetchHealthSummary = async () => {
      try {
        const data = await behaviorLogger.getHealthSummary(24);
        setHealthSummary(data);
      } catch (error) {
        console.error('Failed to fetch health summary:', error);
      }
    };
    const fetchCleaningSchedule = async () => {
      try {
        const response = await api.get('/api/tasks/cleaning-schedule');
        setCleaningSchedule(response.data.schedule || []);
      } catch (error) {
        console.error('Failed to fetch cleaning schedule:', error);
      }
    };
    fetchHealthSummary();
    fetchCleaningSchedule();
    const interval = setInterval(() => { fetchHealthSummary(); fetchCleaningSchedule(); }, 12000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchExtras = async () => {
      try {
        const penId = penStatuses?.[0]?.pen_id || 1;
        const [fl, trend] = await Promise.all([
          behaviorLogger.getFarrowingLikelihood(penId, 12),
          behaviorLogger.getFarrowingLikelihoodTrend(penId, 48, 2),
        ]);
        setFarrowing(fl);
        setFarrowingTrend(trend);
      } catch (err) {
        console.warn('Extras fetch failed', err);
      }
    };
    fetchExtras();
    const interval = setInterval(fetchExtras, 12000);
    return () => clearInterval(interval);
  }, [penStatuses]);

  const avgHealthScore =
    healthSummary?.pens && healthSummary.pens.length > 0
      ? healthSummary.pens.reduce((sum, p) => sum + p.avg_health_score, 0) / healthSummary.pens.length
      : null;

  const avgNursingRate =
    healthSummary?.pens && healthSummary.pens.length > 0
      ? healthSummary.pens.reduce((sum, p) => sum + p.nursing_percentage, 0) / healthSummary.pens.length
      : null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-primary-200 dark:border-primary-800 border-t-primary-500" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Sows', value: stats?.total_sows || 0, icon: <Users className="h-5 w-5" />, color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-900/20' },
    { label: 'Lactating Sows', value: stats?.lactating_sows || 0, icon: <Users className="h-5 w-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Total Piglets', value: stats?.total_piglets || 0, icon: <Baby className="h-5 w-5" />, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { label: 'Active Alerts', value: stats?.active_alerts || 0, icon: <AlertTriangle className="h-5 w-5" />, color: (stats?.active_alerts || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400', bg: (stats?.active_alerts || 0) > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/30' },
    { label: 'Critical Alerts', value: stats?.critical_alerts || 0, icon: <AlertTriangle className="h-5 w-5" />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: 'Pens Monitored', value: stats?.pens_monitored || 0, icon: <Monitor className="h-5 w-5" />, color: 'text-gray-700 dark:text-slate-300', bg: 'bg-gray-50 dark:bg-slate-800/40' },
    { label: 'Health Score', value: avgHealthScore !== null ? avgHealthScore.toFixed(0) : '-', icon: <Heart className="h-5 w-5" />, color: avgHealthScore !== null && avgHealthScore >= 70 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400', bg: avgHealthScore !== null && avgHealthScore >= 70 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-orange-50 dark:bg-orange-900/20', subtitle: '24h average' },
    { label: 'Nursing Rate', value: avgNursingRate !== null ? `${avgNursingRate.toFixed(0)}%` : '-', icon: <Activity className="h-5 w-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', subtitle: '24h average' },
  ];

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden mb-6 shadow-lg bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-400 dark:from-indigo-800 dark:via-indigo-700 dark:to-blue-600">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
            <circle cx="720" cy="20" r="130" fill="white" />
            <circle cx="680" cy="190" r="90" fill="white" />
            <circle cx="80" cy="170" r="50" fill="white" />
          </svg>
        </div>
        <div className="relative px-8 pt-6 pb-8">
          <Link to="/" className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-white/80" />
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Farm Statistics</h1>
              <p className="text-white/70 text-sm">Detailed overview of your farrowing monitoring system</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide">{card.label}</span>
              <div className={clsx('p-2 rounded-xl', card.bg)}>
                <span className={card.color}>{card.icon}</span>
              </div>
            </div>
            <p className={clsx('text-3xl font-bold', card.color)}>{card.value}</p>
            {card.subtitle && <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">{card.subtitle}</p>}
          </div>
        ))}
      </div>

      {/* Farrowing Likelihood */}
      {farrowing && (
        <div className={clsx(
          'rounded-2xl p-6 mb-6 border shadow-sm',
          farrowing.likelihood === 'High' ? 'bg-red-50 dark:bg-red-900/20 border-red-200/60 dark:border-red-700/50' :
          farrowing.likelihood === 'Moderate' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200/60 dark:border-yellow-700/50' :
          'bg-green-50 dark:bg-green-900/20 border-green-200/60 dark:border-green-700/50'
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2.5 rounded-xl', farrowing.likelihood === 'High' ? 'bg-red-100 dark:bg-red-800/50' : farrowing.likelihood === 'Moderate' ? 'bg-yellow-100 dark:bg-yellow-800/50' : 'bg-green-100 dark:bg-green-800/50')}>
                <TrendingUp className={clsx('h-5 w-5', farrowing.likelihood === 'High' ? 'text-red-600 dark:text-red-400' : farrowing.likelihood === 'Moderate' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400')} />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  Farrowing Likelihood: <span className="font-bold">{farrowing.score}/100 — {farrowing.likelihood}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  {farrowing.expected_window_hours != null
                    ? `Expected within ~${farrowing.expected_window_hours} hours`
                    : farrowing.message || 'Start live monitoring to collect data.'}
                </p>
              </div>
            </div>
            <div className={clsx(
              'text-3xl font-bold px-5 py-2.5 rounded-2xl',
              farrowing.score >= 70 ? 'bg-red-200/60 dark:bg-red-800/40 text-red-800 dark:text-red-200' :
              farrowing.score >= 40 ? 'bg-yellow-200/60 dark:bg-yellow-800/40 text-yellow-800 dark:text-yellow-200' :
              'bg-green-200/60 dark:bg-green-800/40 text-green-800 dark:text-green-200'
            )}>
              {farrowing.score}
            </div>
          </div>

          {farrowing.components && (
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[
                { label: 'Posture', value: farrowing.components.posture_switching, max: 30 },
                { label: 'Movement', value: farrowing.components.movement, max: 20 },
                { label: 'Lying', value: farrowing.components.lying_time, max: 20 },
                { label: 'Feed ↓', value: farrowing.components.feeding_reduction, max: 15 },
                { label: 'Activity', value: farrowing.components.activity_increase, max: 15 },
              ].map(comp => (
                <div key={comp.label} className="text-center">
                  <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-1 uppercase font-medium">{comp.label}</div>
                  <div className="w-full bg-gray-200/60 dark:bg-gray-700/40 rounded-full h-1.5">
                    <div
                      className={clsx('h-1.5 rounded-full transition-all', (comp.value / comp.max) >= 0.7 ? 'bg-red-500' : (comp.value / comp.max) >= 0.4 ? 'bg-yellow-500' : 'bg-green-500')}
                      style={{ width: `${Math.min(100, (comp.value / comp.max) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-slate-300 mt-1">{comp.value.toFixed(0)}/{comp.max}</div>
                </div>
              ))}
            </div>
          )}

          {farrowingTrend && farrowingTrend.trend.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-1 uppercase font-medium">48h Trend</div>
              <div className="flex items-end gap-px h-12">
                {farrowingTrend.trend.map((point, i) => {
                  const val = point.score ?? 0;
                  return (
                    <div
                      key={i}
                      className={clsx('flex-1 rounded-t-sm', val >= 70 ? 'bg-red-400 dark:bg-red-500' : val >= 40 ? 'bg-yellow-400 dark:bg-yellow-500' : val > 0 ? 'bg-green-400 dark:bg-green-500' : 'bg-gray-200 dark:bg-gray-700')}
                      style={{ height: `${Math.max(2, val)}%` }}
                      title={`${new Date(point.timestamp).toLocaleTimeString()}: ${val}/100`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Behavior Health Attention Banner */}
      {healthSummary && healthSummary.pens_needing_attention > 0 && (
        <div className="rounded-2xl p-5 mb-6 border shadow-sm bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200/60 dark:border-yellow-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-100 dark:bg-yellow-800/50">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">{healthSummary.pens_needing_attention} pens need attention</p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">Based on behavior analysis</p>
            </div>
          </div>
          <Link to="/behavior-logs" className="px-4 py-2 rounded-xl text-sm font-medium bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-700/50 transition-colors">
            View Logs
          </Link>
        </div>
      )}

      {/* Cleaning Schedule */}
      {cleaningSchedule.filter(item => item.status !== 'ok').length > 0 && (
        <div className="rounded-2xl border border-amber-200/60 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-900/10 shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-800/50">
                <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Cleaning Schedule</h2>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {cleaningSchedule.filter(i => i.is_overdue).length} overdue · {cleaningSchedule.filter(i => i.status === 'due_soon').length} due soon
                </p>
              </div>
            </div>
            <Link to="/tasks" className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-100 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-700/50 transition-colors">
              View Tasks
            </Link>
          </div>
          <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cleaningSchedule
              .filter(i => i.status !== 'ok')
              .slice(0, 6)
              .map(item => (
                <div
                  key={item.pen_id}
                  className={clsx(
                    'flex items-center justify-between px-4 py-3 rounded-xl text-sm',
                    item.is_overdue
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                      : 'bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200'
                  )}
                >
                  <span className="font-medium">{item.pen_name}</span>
                  <span className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase',
                    item.is_overdue ? 'bg-red-200 dark:bg-red-800/50 text-red-700 dark:text-red-300' : 'bg-amber-200 dark:bg-amber-700/50 text-amber-700 dark:text-amber-300'
                  )}>
                    {item.is_overdue ? 'Overdue' : 'Due Soon'}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
