import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  SlidersHorizontal,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import clsx from 'clsx';
import api from '@/api';

interface CrushingEventSummary {
  total: number;
  prevented: number;
  likely_crush: number;
  false_positive: number;
  unresolved: number;
  false_positive_rate: number | null;
  period_days: number;
}

interface Props {
  penId?: number;
  days?: number;
  onManageThresholds?: () => void;
}

export const CrushingEventsWidget: React.FC<Props> = ({
  penId,
  days = 30,
  onManageThresholds,
}) => {
  const [summary, setSummary] = useState<CrushingEventSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get('/api/crush-events/summary', {
        params: {
          days_back: days,
          ...(penId ? { pen_id: penId } : {}),
        },
      });
      setSummary(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [penId, days]);

  const fpPct =
    summary?.false_positive_rate != null
      ? Math.round(summary.false_positive_rate * 100)
      : null;

  return (
    <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-gray-100 dark:border-slate-700/60 shadow-sm p-5 sm:p-6 transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                Crushing Risk Events
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                Last {days} Days
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Event outcomes and detection performance telemetry
            </p>
          </div>
        </div>

        {onManageThresholds && (
          <button
            onClick={onManageThresholds}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/50 hover:bg-primary-100 dark:hover:bg-primary-900/60 border border-primary-200/60 dark:border-primary-800/50 transition-all shadow-sm active:scale-95"
            title="Adjust AI detection sensitivity and thresholds"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Adjust Thresholds</span>
          </button>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl p-4 bg-gray-50 dark:bg-slate-700/30 border border-gray-100 dark:border-slate-700/40 animate-pulse"
            >
              <div className="h-3 w-16 bg-gray-200 dark:bg-slate-600 rounded mb-3" />
              <div className="h-7 w-12 bg-gray-200 dark:bg-slate-600 rounded mb-2" />
              <div className="h-2.5 w-24 bg-gray-200 dark:bg-slate-600 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center justify-between p-4 mt-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/50 text-xs text-red-700 dark:text-red-300">
          <span>Unable to load crushing event analytics.</span>
          <button
            onClick={fetchSummary}
            className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400 hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Loaded Content */}
      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
            {/* Prevented Card */}
            <div className="rounded-xl p-3.5 sm:p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/40 flex flex-col justify-between transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                  Prevented
                </span>
                <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-200 tracking-tight">
                  {summary.prevented}
                </div>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  Saved by intervention
                </p>
              </div>
            </div>

            {/* Confirmed Crush Card */}
            <div className="rounded-xl p-3.5 sm:p-4 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/40 flex flex-col justify-between transition-all hover:border-rose-300 dark:hover:border-rose-700">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
                  Confirmed
                </span>
                <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 dark:text-rose-200 tracking-tight">
                  {summary.likely_crush}
                </div>
                <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                  Likely or verified crushing
                </p>
              </div>
            </div>

            {/* Unresolved Card */}
            <div className="rounded-xl p-3.5 sm:p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/40 flex flex-col justify-between transition-all hover:border-amber-300 dark:hover:border-amber-700">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                  Unresolved
                </span>
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 dark:text-amber-200 tracking-tight">
                  {summary.unresolved}
                </div>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                  Pending caretaker check
                </p>
              </div>
            </div>

            {/* False Positives Card */}
            <div className="rounded-xl p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/50 flex flex-col justify-between transition-all hover:border-slate-300 dark:hover:border-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  False Pos.
                </span>
                <div className="p-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-700 dark:text-slate-200 tracking-tight">
                  {summary.false_positive}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Pen checked fine, no threat
                </p>
              </div>
            </div>
          </div>

          {/* Footer Telemetry Bar */}
          <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2">
              {summary.total === 0 ? (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <Sparkles className="h-4 w-4" />
                  <span>No risk events recorded in this period. Great job!</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-slate-400">Detection Accuracy:</span>
                  {fpPct !== null && (
                    <span
                      className={clsx(
                        'px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1',
                        fpPct >= 40
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          : fpPct >= 20
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      )}
                    >
                      {fpPct}% False Positive Rate
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="text-gray-400 dark:text-slate-500">
              Total Risk Events: <span className="font-semibold text-gray-700 dark:text-slate-200">{summary.total}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CrushingEventsWidget;
