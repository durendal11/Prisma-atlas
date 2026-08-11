import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArchivedAlerts, useDeleteArchivedReadAlerts, useDeleteAlert } from '@/hooks';
import { PageSkeleton, useLoading } from '@/components/ui/Skeleton';
import { 
  Archive, 
  Trash2, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RefreshCw,
  BellOff
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function AlertArchivesPage() {
  const navigate = useNavigate();
  const { data: archivedAlerts, isLoading: loadingAlerts, refetch, isRefetching } = useArchivedAlerts();
  const { isLoading } = useLoading(loadingAlerts);
  const deleteArchivedRead = useDeleteArchivedReadAlerts();
  const deleteAlert = useDeleteAlert();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDeleteRead = () => {
    deleteArchivedRead.mutate(undefined, {
      onSuccess: (res) => toast.success(res.message || 'Deleted read notifications'),
      onError: () => toast.error('Failed to delete read notifications'),
    });
  };

  const handleDeleteSingle = (id: number) => {
    setDeletingId(id);
    deleteAlert.mutate(id, {
      onSuccess: () => {
        toast.success('Alert deleted');
        setDeletingId(null);
      },
      onError: () => {
        toast.error('Failed to delete alert');
        setDeletingId(null);
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
        <div className="relative px-5 sm:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/alerts')}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
                title="Back to active alerts"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Archive className="h-7 w-7 text-indigo-300" />
                  Alert Archives
                </h1>
                <p className="text-white/70 text-sm">Review and manage archived notifications</p>
              </div>
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
                onClick={handleDeleteRead}
                disabled={deleteArchivedRead.isPending || readCount === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/80 hover:bg-red-600 backdrop-blur-sm text-white text-xs font-medium transition-colors disabled:opacity-50"
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
            <div
              key={alert.id}
              className={clsx(
                'bg-white dark:bg-slate-800/60 rounded-2xl border p-4 shadow-sm transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                alert.is_read
                  ? 'border-gray-200/60 dark:border-slate-700/50 opacity-85'
                  : 'border-indigo-200 dark:border-indigo-800/50 ring-1 ring-indigo-500/20'
              )}
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      alert.severity === 'critical' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                      alert.severity === 'high' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                      alert.severity === 'medium' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                      alert.severity === 'low' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    )}
                  >
                    {alert.severity}
                  </span>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</h4>
                  {alert.is_read ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Read
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="h-3 w-3" /> Unread
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-slate-300">{alert.message}</p>
                <div className="flex items-center gap-4 text-[11px] text-gray-400 dark:text-slate-500">
                  {alert.pen_id && <span>Pen {alert.pen_id}</span>}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Created: {new Date(alert.created_at).toLocaleString()}
                  </span>
                  {alert.archived_at && (
                    <span>Archived: {new Date(alert.archived_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDeleteSingle(alert.id)}
                disabled={deletingId === alert.id}
                className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1 text-xs self-end sm:self-center"
                title="Delete alert"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sm:hidden">Delete</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
