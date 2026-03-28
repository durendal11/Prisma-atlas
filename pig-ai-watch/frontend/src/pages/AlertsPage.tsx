import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCard } from '@/components';
import { useAlerts, useAlertStats, useUpdateAlert, useMarkAllAlertsRead } from '@/hooks';
import { PageSkeleton, useLoading } from '@/components/ui/Skeleton';
import { PageInfoButton, PageInfoModal } from '@/components/ui/PageInfoModal';
import { 
  Filter, 
  CheckCircle, 
  Bell, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const severityOptions = ['all', 'critical', 'high', 'medium', 'low'];
const typeOptions = ['all', 'crushing_risk', 'posture_change', 'piglet_count_change', 'system'];

export default function AlertsPage() {
  const navigate = useNavigate();
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const { data: alerts, isLoading: loadingAlerts, refetch, isRefetching } = useAlerts({
    severity: severity === 'all' ? undefined : severity,
    type: type === 'all' ? undefined : type,
    is_resolved: showResolved ? undefined : false,
    limit: 100,
  });
  const { isLoading } = useLoading(loadingAlerts);

  const { data: stats } = useAlertStats();
  const updateAlert = useUpdateAlert();
  const markAllRead = useMarkAllAlertsRead();

  const handleResolveAlert = (alertId: number) => {
    updateAlert.mutate(
      { id: alertId, data: { is_resolved: true, is_read: true } },
      {
        onSuccess: () => toast.success('Alert resolved'),
        onError: () => toast.error('Failed to resolve alert'),
      }
    );
  };

  const handleMarkRead = (alertId: number) => {
    updateAlert.mutate(
      { id: alertId, data: { is_read: true } },
      {
        onError: () => toast.error('Failed to mark alert as read'),
      }
    );
  };

  const handleAlertClick = (alert: any) => {
    if (!alert.is_read) {
      handleMarkRead(alert.id);
    }
    
    // Check if there is a specific pen related to the alert first
    if (alert.pen_id) {
      navigate(`/pen/${alert.pen_id}`);
      return;
    }

    const alertType = (alert.type || '').toLowerCase();
    const alertTitle = (alert.title || '').toLowerCase();
    
    // Farrowing related navigation fallback
    if (alertType.includes('farrowing') || alertType.includes('gestation') || alertTitle.includes('farrowing')) {
      navigate('/farrowing');
    }
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast.success('All alerts marked as read'),
      onError: () => toast.error('Failed to mark alerts as read'),
    });
  };

  if (isLoading && !alerts) return <PageSkeleton />;

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Hero Header */}
      <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-r from-red-600 via-rose-500 to-orange-400 dark:from-red-800 dark:via-rose-700 dark:to-orange-600">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 160" preserveAspectRatio="none">
            <circle cx="700" cy="20" r="110" fill="white" />
            <circle cx="80" cy="140" r="50" fill="white" />
          </svg>
        </div>
        <div className="relative px-5 sm:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Alerts</h1>
                <p className="text-white/70 text-sm">Monitor and manage system alerts</p>
              </div>
              <PageInfoButton onClick={() => setIsInfoOpen(true)} className="text-white hover:bg-white/20" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isRefetching}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white/80 backdrop-blur-sm transition-colors"
              >
                <RefreshCw className={clsx('h-4 w-4', isRefetching && 'animate-spin')} />
              </button>
              <button
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Mark All Read
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 p-4 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary-500 dark:text-primary-400 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-xs text-gray-500 dark:text-slate-400">Unread</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{stats?.unread_count || 0}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 rounded-2xl border border-red-200/60 dark:border-red-700/50 p-4 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-xs text-red-600 dark:text-red-400">Critical</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-red-700 dark:text-red-300">
            {stats?.unresolved_by_severity?.critical || 0}
          </p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/30 rounded-2xl border border-orange-200/60 dark:border-orange-700/50 p-4 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-xs text-orange-600 dark:text-orange-400">High</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-orange-700 dark:text-orange-300">
            {stats?.unresolved_by_severity?.high || 0}
          </p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-2xl border border-yellow-200/60 dark:border-yellow-700/50 p-4 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500 dark:text-yellow-400 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-xs text-yellow-600 dark:text-yellow-400">Medium/Low</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-yellow-700 dark:text-yellow-300">
            {(stats?.unresolved_by_severity?.medium || 0) + 
             (stats?.unresolved_by_severity?.low || 0)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-400 dark:text-slate-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Filters</span>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="px-3 py-1.5 border border-gray-200/60 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all"
            >
              {severityOptions.map((opt) => (
                <option key={opt} value={opt} className="capitalize dark:bg-slate-700">
                  {opt === 'all' ? 'All Severities' : opt}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-3 py-1.5 border border-gray-200/60 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all"
            >
              {typeOptions.map((opt) => (
                <option key={opt} value={opt} className="dark:bg-slate-700">
                  {opt === 'all' ? 'All Types' : opt.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-primary-500 focus:ring-primary-500 dark:focus:ring-primary-400 dark:bg-slate-700 transition-all"
              />
              <span className="text-sm text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Show resolved</span>
            </label>
          </div>
        </div>
      </div>

      {/* Alerts list */}
      <div className="space-y-3">
        {alerts?.length === 0 ? (
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 p-12 text-center shadow-sm">
            <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="text-base font-medium text-gray-600 dark:text-slate-300">No alerts found</p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          alerts?.map((alert, index) => (
            <div key={alert.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
              <AlertCard
                alert={alert}
                onClick={() => handleAlertClick(alert)}
                onResolve={() => handleResolveAlert(alert.id)}
                onMarkRead={() => handleMarkRead(alert.id)}
              />
            </div>
          ))
        )}
      </div>

      <PageInfoModal 
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        title="Alerts Interface"
        section="alerts"
        steps={[
          "Global Event Inbox: View all urgent engine events across every active stream and pen.",
          "Categorizations: Filter alerts explicitly by operational urgency (e.g., Critical vs Warning) or origin type.",
          "Dismissal: Mark read, bulk select, or definitively resolve historical alerting traces.",
          "Real-time: Stream directly synchronized against engine WebSocket data."
        ]}
      />
    </div>
  );
}
