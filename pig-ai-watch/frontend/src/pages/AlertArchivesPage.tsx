import { useNavigate } from 'react-router-dom';
import { useArchivedAlerts, useDeleteArchivedReadAlerts, useDeleteAlert, useRestoreAlert } from '@/hooks';
import { SwipeableAlertCard } from '@/components';
import { PageSkeleton, useLoading } from '@/components/ui/Skeleton';
import { 
  Archive, 
  Trash2, 
  ArrowLeft, 
  RefreshCw,
  BellOff,
  RotateCcw
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function AlertArchivesPage() {
  const navigate = useNavigate();
  const { data: archivedAlerts, isLoading: loadingAlerts, refetch, isRefetching } = useArchivedAlerts();
  const { isLoading } = useLoading(loadingAlerts);
  const deleteArchivedRead = useDeleteArchivedReadAlerts();
  const deleteAlert = useDeleteAlert();
  const restoreAlert = useRestoreAlert();

  const handleDeleteRead = () => {
    deleteArchivedRead.mutate(undefined, {
      onSuccess: (res) => toast.success(res.message || 'Deleted read notifications'),
      onError: () => toast.error('Failed to delete read notifications'),
    });
  };

  const handleRestoreSingle = (id: number) => {
    restoreAlert.mutate(id, {
      onSuccess: () => toast.success('Notification restored to active alerts'),
      onError: () => toast.error('Failed to restore notification'),
    });
  };

  const handleDeleteSingle = (id: number) => {
    deleteAlert.mutate(id, {
      onSuccess: () => {
        toast.success('Alert deleted');
      },
      onError: () => {
        toast.error('Failed to delete alert');
      },
    });
  };

  if (isLoading && !archivedAlerts) return <PageSkeleton />;

  const readCount = archivedAlerts?.filter(a => a.is_read).length || 0;

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Hero Header */}
      <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-r from-slate-800 via-slate-700 to-indigo-900 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 160" preserveAspectRatio="none">
            <circle cx="700" cy="20" r="110" fill="white" />
            <circle cx="80" cy="140" r="50" fill="white" />
          </svg>
        </div>
        <div className="relative px-4 sm:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/alerts')}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors shrink-0"
                title="Back to active alerts"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Archive className="h-5 w-5 sm:h-7 sm:w-7 text-indigo-300 shrink-0" />
                  Alert Archives
                </h1>
                <p className="text-white/70 text-xs sm:text-sm">Review and manage archived notifications</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isRefetching}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white/80 backdrop-blur-sm transition-colors shrink-0"
              >
                <RefreshCw className={clsx('h-4 w-4', isRefetching && 'animate-spin')} />
              </button>
              <button
                onClick={handleDeleteRead}
                disabled={deleteArchivedRead.isPending || readCount === 0}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-red-500/80 hover:bg-red-600 backdrop-blur-sm text-white text-[11px] sm:text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                title="Delete all archived notifications marked as read"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Marked as Read ({readCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Archived Alerts List */}
      <div className="space-y-3">
        {archivedAlerts && archivedAlerts.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[11px] text-gray-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5 text-emerald-500" />
              <span>Tip: Drag or swipe right (or click Restore) to return notification to active alerts</span>
            </span>
          </div>
        )}
        {!archivedAlerts || archivedAlerts.length === 0 ? (
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 p-12 text-center shadow-sm">
            <BellOff className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-800 dark:text-slate-200">No Archived Alerts</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              When you archive alerts from the main Alerts page, they will appear here.
            </p>
            <button
              onClick={() => navigate('/alerts')}
              className="mt-4 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Go to Active Alerts
            </button>
          </div>
        ) : (
          archivedAlerts.map((alert) => (
            <SwipeableAlertCard
              key={alert.id}
              alert={alert}
              mode="archived"
              onRestore={() => handleRestoreSingle(alert.id)}
              onDelete={() => handleDeleteSingle(alert.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
