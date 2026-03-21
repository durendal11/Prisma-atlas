import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, 
  Clock, 
  Heart, 
  AlertTriangle, 
  TrendingUp,
  ArrowLeft,
  RefreshCw,
  Filter
} from 'lucide-react';
import { behaviorLogger, BehaviorLogResponse } from '@/services/behaviorLogger';
import { subscribePollingTask } from '@/utils/pollingScheduler';
import clsx from 'clsx';

export default function BehaviorLogsPage() {
  const [logs, setLogs] = useState<BehaviorLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPen, setSelectedPen] = useState<number>(1);
  const [hours, setHours] = useState<number>(24);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await behaviorLogger.getLogs(selectedPen, hours);
      setLogs(data);
    } catch (err) {
      setError('Failed to fetch behavior logs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedPen, hours]);

  useEffect(() => {
    fetchLogs();
  }, [selectedPen, hours]);

  // Auto-refresh every 12 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    return subscribePollingTask(`behavior-logs:${selectedPen}:${hours}`, fetchLogs, 12000);
  }, [autoRefresh, selectedPen, hours, fetchLogs]);

  const getPostureColor = (posture: string) => {
    switch (posture) {
      case 'sow-sleep-lactate':
        return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300';
      case 'sow-stand-feed':
        return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300';
      case 'sow-sleep':
        return 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300';
      case 'sow-stand':
        return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300';
      case 'sow-sit':
        return 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300';
      default:
        return 'bg-gray-100 dark:bg-slate-700/50 text-gray-800 dark:text-slate-300';
    }
  };

  const getRiskColor = (risk: number) => {
    if (risk >= 0.7) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30';
    if (risk >= 0.4) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30';
    return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30';
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 animate-slide-in-left">
          <Link 
            to="/settings" 
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Behavior Logs</h1>
            <p className="text-gray-500 dark:text-slate-400">12-second interval detection logs</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg transition-all duration-200"
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600"
            />
            <span className="text-sm text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors duration-200">Auto-refresh</span>
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 dark:text-slate-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Filters:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-slate-400">Pen:</label>
            <select
              value={selectedPen}
              onChange={(e) => setSelectedPen(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all duration-200"
              title="Select pen"
              aria-label="Select pen"
            >
              {[1, 2, 3, 4, 5, 999].map((pen) => (
                <option key={pen} value={pen} className="dark:bg-slate-700">{pen === 999 ? 'Test Pen (999)' : `Pen ${pen}`}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="w-24 px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all duration-200"
              value={selectedPen}
              onChange={(e) => setSelectedPen(Number(e.target.value) || 1)}
              title="Enter pen id"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-slate-400">Period:</label>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all duration-200"
              title="Select period"
              aria-label="Select period"
            >
              <option value={1} className="dark:bg-slate-700">Last 1 hour</option>
              <option value={6} className="dark:bg-slate-700">Last 6 hours</option>
              <option value={12} className="dark:bg-slate-700">Last 12 hours</option>
              <option value={24} className="dark:bg-slate-700">Last 24 hours</option>
              <option value={48} className="dark:bg-slate-700">Last 48 hours</option>
              <option value={168} className="dark:bg-slate-700">Last 7 days</option>
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-500 dark:text-slate-400">
            <span className="font-medium text-gray-900 dark:text-white">{logs.length}</span> logs found
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg group-hover:scale-110 transition-transform duration-200">
                <Heart className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Avg Health Score</p>
                <p className={clsx(
                  "text-2xl font-bold",
                  getHealthColor(logs.reduce((sum, l) => sum + l.health_score, 0) / logs.length)
                )}>
                  {(logs.reduce((sum, l) => sum + l.health_score, 0) / logs.length).toFixed(1)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg group-hover:scale-110 transition-transform duration-200">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Avg Crushing Risk</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {((logs.reduce((sum, l) => sum + l.crushing_risk, 0) / logs.length) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg group-hover:scale-110 transition-transform duration-200">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Lactation Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {((logs.filter(l => l.is_nursing).length / logs.length) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5 group">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg group-hover:scale-110 transition-transform duration-200">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Avg Piglet Count</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(logs.reduce((sum, l) => sum + l.piglet_count, 0) / logs.length).toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 overflow-hidden shadow-sm">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 dark:border-primary-800 border-t-primary-500 dark:border-t-primary-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-slate-400">
            <AlertTriangle className="h-12 w-12 mb-3 text-gray-400 dark:text-slate-500" />
            <p>{error}</p>
            <button 
              onClick={fetchLogs}
              className="mt-3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
            >
              Try again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-slate-400">
            <Clock className="h-12 w-12 mb-3 text-gray-400 dark:text-slate-500" />
            <p>No behavior logs found</p>
            <p className="text-sm mt-1">Logs will appear here every 12 seconds during monitoring</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700/50">
              <thead className="bg-gray-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Posture</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Piglets</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Sows</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Health</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Cleanliness</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Wetness</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Risk</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Activity</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                {logs.map((log, index) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors duration-150 animate-fade-in" style={{ animationDelay: `${index * 20}ms` }}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                      {formatTime(log.logged_at || log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        "px-2 py-1 rounded-full text-xs font-medium transition-transform duration-200 hover:scale-105 inline-block",
                        getPostureColor(log.sow_posture)
                      )}>
                        {log.sow_posture}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-white">
                      {log.piglet_count}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-white">
                      {log.sow_count}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx(
                        "text-sm font-bold",
                        getHealthColor(log.health_score)
                      )}>
                        {log.health_score.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-slate-300">
                      {(log.cleanliness_score * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700 dark:text-slate-300">
                      {(log.wetness_score * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx(
                        "px-2 py-1 rounded text-xs font-medium",
                        getRiskColor(log.crushing_risk)
                      )}>
                        {(log.crushing_risk * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600 dark:text-slate-400">
                        {log.activity_level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {log.is_nursing && (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded text-xs">
                            Lactating
                          </span>
                        )}
                        {log.is_feeding && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs">
                            Feeding
                          </span>
                        )}
                        {log.is_sleeping && (
                          <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded text-xs">
                            Sleeping
                          </span>
                        )}
                        {!log.is_nursing && !log.is_feeding && !log.is_sleeping && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
