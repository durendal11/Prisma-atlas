import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useNavigate } from 'react-router-dom';
import { AlertCard } from '@/components';
import { useAlerts, useAlertStats, useUpdateAlert, useMarkAllAlertsRead } from '@/hooks';
import { PageSkeleton, useLoading } from '@/components/ui/Skeleton';
import { PageInfoButton } from '@/components/ui/PageInfoModal';
import { 
  Filter, 
  CheckCircle, 
  Bell, 
  AlertTriangle,
  RefreshCw,
  X,
  Smartphone,
  Server,
  CloudLightning,
  ChevronRight,
  ShieldAlert,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

import { alertsApi } from '@/api';

const severityOptions = ['all', 'critical', 'high', 'medium', 'low'];
const typeOptions = ['all', 'crushing_risk', 'posture_change', 'piglet_count_change', 'system'];

export default function AlertsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const handleSendTestAlert = async () => {
    setIsSendingTest(true);
    try {
      await alertsApi.createTest(1);
      toast.success('Test alert created & email notification triggered!');
      refetch();
    } catch {
      toast.error('Failed to trigger test alert');
    } finally {
      setIsSendingTest(false);
    }
  };

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
                onClick={handleSendTestAlert}
                disabled={isSendingTest}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium transition-colors disabled:opacity-50"
                title="Send a test alert & email notification"
              >
                <Bell className={clsx('h-3.5 w-3.5', isSendingTest && 'animate-bounce')} />
                {isSendingTest ? 'Sending...' : 'Test Email Alert'}
              </button>
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

      {/* Info Modal */}
      {isInfoOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 w-full max-w-4xl overflow-hidden animate-scale-in my-8 relative">
            <div className="sticky top-0 z-20 flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700/50 bg-white/95 dark:bg-slate-800/95 backdrop-blur">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400 font-bold text-lg">
                <Bell className="w-6 h-6" />
                <h2>{t('alertsModalTitle')}</h2>
              </div>
              <button 
                onClick={() => setIsInfoOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {/* Animation Container */}
              <div className="relative flex flex-col md:flex-row items-center justify-between mb-10 py-12 px-4 sm:px-8 bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 rounded-2xl overflow-hidden shadow-inner min-h-[220px] w-full">
                
                <style>{`
                  @keyframes flowRightFade {
                    0% { transform: translateX(-10px); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateX(20px); opacity: 0; }
                  }
                  @keyframes alertPing {
                    0% { transform: scale(1); opacity: 0.8; }
                    80% { transform: scale(1.5); opacity: 0; }
                    100% { transform: scale(1.5); opacity: 0; }
                  }
                  .animate-flow-right-fade { animation: flowRightFade 1.5s linear infinite; }
                  .animate-alert-ping { animation: alertPing 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
                  .delay-75 { animation-delay: 0.75s; }
                `}</style>

                {/* Background stars/dots */}
                <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 bg-white/70 rounded-full animate-pulse" />
                <div className="absolute top-3/4 right-1/4 w-2 h-2 bg-white/50 rounded-full animate-[pulse_3s_ease-in-out_infinite]" />
                <div className="absolute top-1/3 right-[15%] w-1 h-1 bg-white/80 rounded-full animate-[pulse_2s_ease-in-out_infinite]" />
                
                {/* Step 1: AI Edge Engine */}
                <div className="relative z-10 flex flex-col items-center flex-shrink-0 mb-6 md:mb-0 group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white shadow-xl rounded-2xl flex items-center justify-center border-2 border-red-100 relative group-hover:-translate-y-1 transition-transform">
                    <Server className="w-8 h-8 sm:w-10 sm:h-10 text-red-500" strokeWidth={1.5} />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>
                  </div>
                  <span className="absolute -bottom-8 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm">Edge AI Detection</span>
                </div>

                {/* Flow 1 */}
                <div className="relative flex-1 flex items-center justify-center px-1 sm:px-3 mx-1 hidden md:flex">
                  <div className="absolute w-full border-t-[3px] border-dotted border-white/40" />
                  <div className="relative w-full flex justify-center gap-2 overflow-hidden py-4">
                    <ChevronRight className="w-6 h-6 text-red-200 animate-flow-right-fade drop-shadow-md" strokeWidth={3} />
                    <ChevronRight className="w-6 h-6 text-red-200 animate-flow-right-fade delay-75 drop-shadow-md" strokeWidth={3} />
                  </div>
                </div>
                
                <div className="md:hidden py-4 text-white/50"><ChevronDown className="w-6 h-6 animate-bounce" /></div>

                {/* Step 2: System Cloud Processing */}
                <div className="relative z-10 flex flex-col items-center flex-shrink-0 mb-6 md:mb-0 group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.2)] border-2 border-white/30 relative group-hover:bg-white/20 transition-all">
                     <CloudLightning className="w-8 h-8 sm:w-10 sm:h-10 text-white" strokeWidth={1.5} />
                     <div className="absolute w-full h-full rounded-full animate-alert-ping bg-red-400/30"></div>
                  </div>
                  <span className="absolute -bottom-8 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm">System Database</span>
                </div>

                {/* Flow 2 */}
                <div className="relative flex-1 flex items-center justify-center px-1 sm:px-3 mx-1 hidden md:flex">
                  <div className="absolute w-full border-t-[3px] border-dotted border-white/40" />
                  <div className="relative w-full flex justify-center gap-2 overflow-hidden py-4">
                    <ChevronRight className="w-6 h-6 text-red-200 animate-flow-right-fade drop-shadow-md" strokeWidth={3} />
                    <ChevronRight className="w-6 h-6 text-red-200 animate-flow-right-fade delay-75 drop-shadow-md" strokeWidth={3} />
                  </div>
                </div>
                
                <div className="md:hidden py-4 text-white/50"><ChevronDown className="w-6 h-6 animate-bounce" /></div>

                {/* Step 3: Mobile Phone/Desktop Alert */}
                <div className="relative z-10 flex flex-col items-center flex-shrink-0 group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white shadow-xl rounded-[1.5rem] flex items-center justify-center border-b-4 border-orange-400 relative group-hover:scale-105 transition-transform">
                    <Smartphone className="w-8 h-8 sm:w-10 sm:h-10 text-slate-700" strokeWidth={1.5} />
                    <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 text-white text-[10px] sm:text-xs font-bold w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">1</div>
                  </div>
                  <span className="absolute -bottom-8 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm">Alert Dashboard</span>
                </div>
              </div>

              {/* Explanations */}
              <div className="space-y-8">
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400 mb-3 font-bold text-lg">1</div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-2">{t('alertsModalStep1Title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('alertsModalStep1Desc') }}></p>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3 font-bold text-lg">2</div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-2">{t('alertsModalStep2Title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('alertsModalStep2Desc') }}></p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400 mb-3 font-bold text-lg">3</div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-2">{t('alertsModalStep3Title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('alertsModalStep3Desc') }}></p>
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/20 p-5 rounded-xl border border-orange-100 dark:border-orange-800/50 flex gap-4">
                  <div className="shrink-0 mt-1">
                    <ShieldAlert className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-orange-900 dark:text-orange-300 mb-1">{t('alertsModalWarningTitle')}</h4>
                    <p className="text-sm text-orange-700 dark:text-orange-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('alertsModalWarningDesc') }}></p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-100 dark:border-slate-700/50 flex justify-end shrink-0">
              <button 
                onClick={() => setIsInfoOpen(false)}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-md shadow-red-500/20"
              >
                {t('modalBtnUnderstand')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
