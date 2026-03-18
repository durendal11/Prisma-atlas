import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import type { Sow } from '@/types';
import {
  CalendarDaysIcon,
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';
import { getPrePostComparison, PrePostComparison } from '@/services/behaviorLogger';
import {
  estimateBirthIntervals,
  computeAverageInterval,
  computeLongestInterval,
  classifySession,
  generateClinicalSummary,
} from '@/utils/farrowingMetrics';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts';

interface DueSow {
  id: number;
  tag_id: string;
  name?: string;
  pen_id?: number;
  expected_date?: string;
  days_until?: number;
  parity?: number;
  status: string;
  urgency: string;
}

interface FarrowingRecord {
  id: number;
  sow_id: number;
  pen_id?: number;
  farrowing_started?: string;
  farrowing_completed?: string;
  total_born?: number;
  born_alive?: number;
  stillborn?: number;
  sow_condition?: string;
}

interface FarrowingStats {
  period_days: number;
  total_farrowings: number;
  avg_born_alive: number;
  avg_stillborn: number;
  stillborn_rate: number;
  avg_litter_size: number;
  total_piglets_born: number;
  total_alive: number;
  total_stillborn: number;
  interventions_required: number;
}

const urgencyColors = {
  critical: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700/50',
  high: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700/50',
  normal: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/50',
};

export default function FarrowingPage() {
  // const { t } = useTranslation();
  const api = useApi();
  
  const [dueSows, setDueSows] = useState<{ sows: DueSow[]; critical_count: number; high_count: number }>({ sows: [], critical_count: 0, high_count: 0 });
  const [recentRecords, setRecentRecords] = useState<FarrowingRecord[]>([]);
  const [stats, setStats] = useState<FarrowingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysAhead, setDaysAhead] = useState(7);
  const [allSows, setAllSows] = useState<Sow[]>([]);

  // Pre/Post Analytics state
  const [comparisonSowId, setComparisonSowId] = useState<number | null>(null);
  const [comparison, setComparison] = useState<PrePostComparison | null>(null);
  const [compLoading, setCompLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [daysAhead]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dueResponse, recordsResponse, statsResponse, sowsResponse] = await Promise.all([
        api.get(`/api/farrowing/due-sows?days_ahead=${daysAhead}`),
        api.get('/api/farrowing/records?limit=10'),
        api.get('/api/farrowing/statistics?days_back=30'),
        api.get('/api/sows', { params: { limit: 100 } }),
      ]);
      
      setDueSows(dueResponse.data);
      setRecentRecords(recordsResponse.data);
      setStats(statsResponse.data);
      if (Array.isArray(sowsResponse.data)) setAllSows(sowsResponse.data);
    } catch (error) {
      console.error('Failed to load farrowing data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Pre/Post comparison loader
  useEffect(() => {
    if (!comparisonSowId) { setComparison(null); return; }
    let cancelled = false;
    setCompLoading(true);
    getPrePostComparison(comparisonSowId, 48)
      .then(data => { if (!cancelled) setComparison(data); })
      .catch(err => console.error('Pre/post fetch error', err))
      .finally(() => { if (!cancelled) setCompLoading(false); });
    return () => { cancelled = true; };
  }, [comparisonSowId]);

  // Prepare chart data from comparison timeline
  const timelineChartData = useMemo(() => {
    if (!comparison?.timeline) return [];
    return comparison.timeline
      .filter(p => p.log_count > 0)
      .map(p => ({
        time: new Date(p.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }),
        phase: p.phase,
        health: p.avg_health_score,
        risk: p.avg_crushing_risk != null ? +(p.avg_crushing_risk * 100).toFixed(1) : null,
        piglets: p.avg_piglet_count,
        nursing: p.nursing_pct,
        feeding: p.feeding_pct,
        sleeping: p.sleeping_pct,
        // Restlessness estimate: inverse of sleeping % clamped to 0-100
        restlessness: p.sleeping_pct != null ? Math.min(100, Math.max(0, Math.round(100 - (p.sleeping_pct ?? 0)))) : null,
      }));
  }, [comparison]);

  const startFarrowing = async (sow: DueSow) => {
    try {
      await api.post('/api/farrowing/records', {
        sow_id: sow.id,
        farrowing_started: new Date().toISOString()
      });
      
      // Generate farrowing tasks
      await api.post(`/api/tasks/generate-farrowing-tasks/${sow.id}?trigger_day=0`);
      
      loadData();
    } catch (error) {
      console.error('Failed to start farrowing:', error);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDaysUntilText = (days?: number) => {
    if (days === undefined || days === null) return '';
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-100 dark:bg-pink-900/50 rounded-xl">
            <HeartIcon className="w-8 h-8 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Farrowing Management</h1>
            <p className="text-gray-500 dark:text-slate-400">Track sow farrowing and piglet records</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Total Farrowings (30d)</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white transition-transform duration-300 group-hover:scale-105 origin-left">{stats.total_farrowings}</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Avg Born Alive</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 transition-transform duration-300 group-hover:scale-105 origin-left">{stats.avg_born_alive.toFixed(1)}</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Stillborn Rate</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 transition-transform duration-300 group-hover:scale-105 origin-left">{stats.stillborn_rate.toFixed(1)}%</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/50 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Total Piglets</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 transition-transform duration-300 group-hover:scale-105 origin-left">{stats.total_piglets_born}</div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Due Sows Section */}
        <div className="bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Sows Due to Farrow
              </h2>
              
              <select
                value={daysAhead}
                onChange={(e) => setDaysAhead(Number(e.target.value))}
                title="Days ahead"
                className="text-sm bg-white dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-gray-700 dark:text-slate-300 transition-all duration-200"
              >
                <option value={3}>Next 3 days</option>
                <option value={7}>Next 7 days</option>
                <option value={14}>Next 14 days</option>
                <option value={30}>Next 30 days</option>
              </select>
            </div>
            
            {/* Urgency Summary */}
            <div className="flex items-center gap-3 mt-2">
              {dueSows.critical_count > 0 && (
                <span className="text-sm bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 px-2.5 py-0.5 rounded-full animate-pulse">
                  {dueSows.critical_count} critical
                </span>
              )}
              {dueSows.high_count > 0 && (
                <span className="text-sm bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2.5 py-0.5 rounded-full">
                  {dueSows.high_count} high priority
                </span>
              )}
            </div>
          </div>
          
          <div className="divide-y divide-gray-100 dark:divide-slate-700/50 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
              </div>
            ) : dueSows.sows.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                <CalendarDaysIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-slate-600 mb-2" />
                No sows due in the selected period
              </div>
            ) : (
              dueSows.sows.map((sow) => (
                <div
                  key={sow.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-all duration-200 ${
                    sow.urgency === 'critical' ? 'bg-red-50/50 dark:bg-red-900/20' : 
                    sow.urgency === 'high' ? 'bg-orange-50/50 dark:bg-orange-900/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{sow.tag_id}</span>
                        {sow.name && (
                          <span className="text-gray-500 dark:text-slate-400">({sow.name})</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${urgencyColors[sow.urgency as keyof typeof urgencyColors]}`}>
                          {sow.urgency}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-slate-400">
                        <span>Pen {sow.pen_id || '-'}</span>
                        <span>Parity {sow.parity || 0}</span>
                        {sow.expected_date && (
                          <span className={sow.urgency === 'critical' ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                            {formatDate(sow.expected_date)}
                          </span>
                        )}
                      </div>
                      
                      {sow.days_until !== undefined && (
                        <div className={`text-sm mt-1 font-medium ${
                          sow.days_until <= 0 ? 'text-red-600 dark:text-red-400' : 
                          sow.days_until <= 1 ? 'text-orange-600 dark:text-orange-400' : 
                          'text-gray-600 dark:text-slate-400'
                        }`}>
                          {getDaysUntilText(sow.days_until)}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startFarrowing(sow)}
                        className="px-3 py-1.5 bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-300 rounded-lg text-sm font-medium hover:bg-pink-200 dark:hover:bg-pink-800/50 transition-all duration-200 flex items-center gap-1 hover:scale-105"
                      >
                        <HeartIcon className="w-4 h-4" />
                        Start
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Farrowings Section */}
        <div className="bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-slate-700/50">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              Recent Farrowings
            </h2>
          </div>
          
          <div className="divide-y divide-gray-100 dark:divide-slate-700/50 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
              </div>
            ) : recentRecords.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                <HeartIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-slate-600 mb-2" />
                No farrowing records yet
              </div>
            ) : (
              recentRecords.map((record) => (
                <div key={record.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">Sow #{record.sow_id}</span>
                        {record.farrowing_completed ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                            Completed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 animate-pulse">
                            In Progress
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {formatDate(record.farrowing_started)}
                        {record.pen_id && ` • Pen ${record.pen_id}`}
                      </div>
                    </div>
                    
                    {record.born_alive !== undefined && (
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          {record.born_alive} alive
                        </div>
                        <div className="text-sm text-gray-500 dark:text-slate-400">
                          {record.total_born} total
                          {record.stillborn ? ` • ${record.stillborn} stillborn` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Health indicator */}
                  {record.sow_condition && (
                    <div className="mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        record.sow_condition === 'good' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                        record.sow_condition === 'fair' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                        'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                      }`}>
                        Sow condition: {record.sow_condition}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Farrowing Timeline / Calendar View */}
      <div className="mt-6 bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          7-Day Farrowing Timeline
        </h2>
        
        <div className="overflow-x-auto -mx-1 px-1 pb-2">
          <div className="grid grid-cols-7 gap-2 min-w-[600px]">
          {Array.from({ length: 7 }).map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            const sowsOnDay = dueSows.sows.filter(s => {
              if (!s.expected_date) return false;
              return s.expected_date.split('T')[0] === dateStr;
            });
            
            const isToday = i === 0;
            
            return (
              <div
                key={i}
                className={`p-3 rounded-lg border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-dark-lg ${
                  isToday ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-slate-700/50 dark:bg-slate-700/30'
                }`}
              >
                <div className={`text-xs font-medium ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400'}`}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className={`text-lg font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                  {date.getDate()}
                </div>
                
                {sowsOnDay.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {sowsOnDay.slice(0, 3).map(sow => (
                      <div
                        key={sow.id}
                        className={`text-xs px-2 py-1 rounded transition-transform duration-200 hover:scale-105 ${
                          sow.urgency === 'critical' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                          sow.urgency === 'high' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300' :
                          'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {sow.tag_id}
                      </div>
                    ))}
                    {sowsOnDay.length > 3 && (
                      <div className="text-xs text-gray-500 dark:text-slate-400">+{sowsOnDay.length - 3} more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* ──────────────── Pre / Post Farrowing Analytics ──────────────── */}
      <div className="mt-6 bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Pre / Post Farrowing Comparison
          </h2>

          {/* Sow selector — all registered sows */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 dark:text-slate-400">Sow:</label>
            <select
              value={comparisonSowId ?? ''}
              onChange={e => setComparisonSowId(e.target.value ? Number(e.target.value) : null)}
              title="Select sow for comparison"
              className="text-sm bg-white dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-gray-700 dark:text-slate-300 transition-all min-w-[220px]"
            >
              <option value="">Select sow…</option>
              {allSows.length > 0 && (
                <>
                  {/* Sows with farrowing records first */}
                  {(() => {
                    const sowIdsWithRecords = new Set(recentRecords.map(r => r.sow_id));
                    const sowsWithRecords = allSows.filter(s => sowIdsWithRecords.has(s.id));
                    const sowsWithoutRecords = allSows.filter(s => !sowIdsWithRecords.has(s.id));
                    return (
                      <>
                        {sowsWithRecords.length > 0 && (
                          <optgroup label="With Farrowing Records">
                            {sowsWithRecords.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.tag_id}{s.name ? ` (${s.name})` : ''} — {s.status}{s.pen_id ? ` • Pen #${s.pen_id}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {sowsWithoutRecords.length > 0 && (
                          <optgroup label="All Registered Sows">
                            {sowsWithoutRecords.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.tag_id}{s.name ? ` (${s.name})` : ''} — {s.status}{s.pen_id ? ` • Pen #${s.pen_id}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </select>
          </div>
        </div>

        {compLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 dark:border-purple-400" />
          </div>
        )}

        {!compLoading && !comparison && (
          <div className="text-center py-10 text-gray-400 dark:text-slate-500">
            <ChartBarIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a sow from a recent farrowing to view analytics</p>
          </div>
        )}

        {!compLoading && comparison && comparison.pre && comparison.post && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {(() => {
                const metrics = [
                  { label: 'Health Score', pre: comparison.pre.avg_health_score, post: comparison.post.avg_health_score, suffix: '', better: 'higher' as const },
                  { label: 'Nursing %', pre: comparison.pre.nursing_pct, post: comparison.post.nursing_pct, suffix: '%', better: 'higher' as const },
                  { label: 'Crushing Risk', pre: +(comparison.pre.avg_crushing_risk * 100).toFixed(1), post: +(comparison.post.avg_crushing_risk * 100).toFixed(1), suffix: '%', better: 'lower' as const },
                  { label: 'Piglet Count', pre: comparison.pre.avg_piglet_count, post: comparison.post.avg_piglet_count, suffix: '', better: 'higher' as const },
                ];
                return metrics.map(m => {
                  const diff = m.post - m.pre;
                  const improved = m.better === 'higher' ? diff > 0 : diff < 0;
                  return (
                    <div key={m.label} className="bg-gray-50 dark:bg-slate-700/40 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">{m.label}</div>
                      <div className="flex items-center justify-center gap-3 text-lg font-bold">
                        <span className="text-gray-400 dark:text-slate-500">{m.pre.toFixed(1)}{m.suffix}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${improved ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                        </span>
                        <span className="text-gray-900 dark:text-white">{m.post.toFixed(1)}{m.suffix}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                        <span>Pre</span><span>Post</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Behavior comparison bar chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Activity Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={[
                      { name: 'Nursing', pre: comparison.pre.nursing_pct, post: comparison.post.nursing_pct },
                      { name: 'Feeding', pre: comparison.pre.feeding_pct, post: comparison.post.feeding_pct },
                      { name: 'Sleeping', pre: comparison.pre.sleeping_pct, post: comparison.post.sleeping_pct },
                    ]}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis type="category" dataKey="name" width={70} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pre" name="Pre-Farrowing" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="post" name="Post-Farrowing" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Timeline line chart */}
              <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Health &amp; Risk Timeline</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timelineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine
                      x={timelineChartData.find(d => d.phase === 'during')?.time}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Farrowing', position: 'top', fill: '#ef4444', fontSize: 10 }}
                    />
                    <Line type="monotone" dataKey="health" name="Health" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="risk" name="Risk %" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="nursing" name="Nursing %" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="restlessness" name="Restlessness" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Farrowing outcome summary */}
            <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
              <span>Born alive: <strong className="text-green-600 dark:text-green-400">{comparison.born_alive ?? '-'}</strong></span>
              <span>Total born: <strong>{comparison.total_born ?? '-'}</strong></span>
              <span>Stillborn: <strong className="text-red-500">{comparison.stillborn ?? 0}</strong></span>
              <span>Duration: <strong>{comparison.duration_minutes ? `${comparison.duration_minutes} min` : '-'}</strong></span>
              <span>Condition: <strong className="capitalize">{comparison.sow_condition ?? '-'}</strong></span>
            </div>

            {/* ── 2️⃣ Session Classification Badge ──────────────────────── */}
            {(() => {
              const totalBorn = comparison.total_born ?? 0;
              const durationMin = comparison.duration_minutes ?? 0;
              const stillborn = comparison.stillborn ?? 0;
              const intervals = totalBorn > 1 && durationMin > 0
                ? estimateBirthIntervals(totalBorn, durationMin)
                : [];
              const avgInterval = computeAverageInterval(intervals);
              const longestInterval = computeLongestInterval(intervals);
              // Crushing incidents estimate: use post-farrowing crushing risk > 0.5 as proxy
              const crushingIncidents = comparison.post
                ? (comparison.post.avg_crushing_risk > 0.5 ? Math.round(comparison.post.avg_crushing_risk * 10) : 0)
                : 0;
              const session = classifySession({ totalDurationMinutes: durationMin, longestInterval, stillbornCount: stillborn, crushingIncidents });
              // Peak restlessness from timeline
              const peakRestlessness = timelineChartData.reduce((max, d) => Math.max(max, d.restlessness ?? 0), 0);
              const clinicalText = generateClinicalSummary({ averageInterval: avgInterval, longestInterval, totalDurationMinutes: durationMin, stillbornCount: stillborn, crushingIncidents, peakRestlessness });

              return (
                <div className="space-y-4 mt-4">
                  {/* Session Classification */}
                  <div className={`rounded-lg p-3 flex items-center gap-3 border ${session.bg} border-current/10`}>
                    <div className="flex-shrink-0">
                      <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${session.bg} ${session.color}`}>
                        {session.label}
                      </span>
                    </div>
                    <p className={`text-sm ${session.color}`}>
                      {session.label === 'NORMAL FARROWING'
                        ? 'Farrowing completed within expected parameters.'
                        : session.label === 'PROLONGED FARROWING'
                        ? `Total duration of ${durationMin} min exceeds 6-hour threshold.`
                        : session.label === 'DYSTOCIA SUSPECTED'
                        ? `Longest estimated inter-birth interval of ${longestInterval} min indicates possible dystocia.`
                        : session.label === 'HIGH STILLBORN RISK'
                        ? `${stillborn} stillborn piglets recorded — elevated risk.`
                        : `Multiple crushing risk incidents detected during session.`
                      }
                    </p>
                  </div>

                  {/* 1️⃣ Inter-Birth Interval Analytics */}
                  {intervals.length > 0 && (
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-indigo-500" />
                        Inter-Birth Interval Analysis
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-auto">Estimated from total duration ÷ piglets</span>
                      </h3>

                      {/* Summary stats */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="text-center bg-white dark:bg-slate-800/40 rounded-lg p-2">
                          <div className="text-lg font-bold text-gray-900 dark:text-white">{avgInterval} min</div>
                          <div className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Avg Interval</div>
                        </div>
                        <div className="text-center bg-white dark:bg-slate-800/40 rounded-lg p-2">
                          <div className={`text-lg font-bold ${longestInterval >= 45 ? 'text-red-600' : longestInterval >= 30 ? 'text-amber-600' : 'text-green-600'}`}>
                            {longestInterval} min
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Longest Gap</div>
                        </div>
                        <div className="text-center bg-white dark:bg-slate-800/40 rounded-lg p-2">
                          <div className="text-lg font-bold text-gray-900 dark:text-white">{totalBorn}</div>
                          <div className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Total Born</div>
                        </div>
                      </div>

                      {/* Interval table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-slate-600">
                              <th className="text-left py-1.5 px-2">Piglet</th>
                              <th className="text-left py-1.5 px-2">Est. Time</th>
                              <th className="text-left py-1.5 px-2">Interval</th>
                              <th className="text-left py-1.5 px-2">Risk</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-100 dark:border-slate-700">
                              <td className="py-1.5 px-2 font-medium">#1</td>
                              <td className="py-1.5 px-2 text-gray-500">Start</td>
                              <td className="py-1.5 px-2">—</td>
                              <td className="py-1.5 px-2">—</td>
                            </tr>
                            {intervals.map((iv) => (
                              <tr key={iv.pigletNumber} className="border-b border-gray-100 dark:border-slate-700">
                                <td className="py-1.5 px-2 font-medium">#{iv.pigletNumber}</td>
                                <td className="py-1.5 px-2 text-gray-500">+{iv.intervalMinutes * (iv.pigletNumber - 1)} min</td>
                                <td className="py-1.5 px-2">{iv.intervalMinutes} min</td>
                                <td className="py-1.5 px-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    iv.risk === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                                    : iv.risk === 'delayed' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                  }`}>
                                    {iv.risk === 'critical' ? 'Critical Delay' : iv.risk === 'delayed' ? 'Delayed' : 'Normal'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 4️⃣ Automated Clinical Interpretation */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800/50">
                    <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Automated Clinical Interpretation
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300/80 leading-relaxed">
                      {clinicalText}
                    </p>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {!compLoading && comparison && comparison.message && (
          <p className="text-center py-6 text-gray-400 dark:text-slate-500 text-sm">{comparison.message}</p>
        )}
      </div>
    </div>
  );
}
