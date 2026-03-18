import { useState, useEffect, useRef } from 'react';
import { EventListItem } from '@/components';
import { useEvents, useEventTypes } from '@/hooks';
import { Filter, RefreshCw, ClipboardList, Activity } from 'lucide-react';
import clsx from 'clsx';
import { useTestPenStore } from '@/store';
import { behaviorLogger } from '@/services/behaviorLogger';
import { reportDetection } from '@/services/detectionReporter';

export default function EventLogsPage() {
  const [type, setType] = useState('all');
  const [category, setCategory] = useState('all');
  const [limit, setLimit] = useState(50);

  const { data: events, isLoading, refetch, isRefetching } = useEvents({
    type: type === 'all' ? undefined : type,
    category: category === 'all' ? undefined : category,
    limit,
  });

  const { data: eventTypes } = useEventTypes();

  const testPenRunning = useTestPenStore((s) => s.isRunning);
  const lastPostedFrame = useRef<number>(-1);

  // Auto-refresh events list every 12 seconds to capture new behavior logs
  useEffect(() => {
    const interval = setInterval(() => refetch(), 12000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Post behavior log + events + alerts every 12 seconds when test pen is running (pen 10)
  useEffect(() => {
    if (!testPenRunning) return;
    behaviorLogger.startLogging(10); // pen 10 = test pen
    const interval = setInterval(() => {
      const result = useTestPenStore.getState().latestResult;
      if (!result || result.frameTimestamp === lastPostedFrame.current) return;
      lastPostedFrame.current = result.frameTimestamp;
      const bs = result.behaviorSummary;
      const an = result.analytics;
      // Post behavior log
      behaviorLogger.updateBehavior(bs, result.detections.length, an.avgConfidence, an.detectionDensity, an.movementEstimate);
      // Post events + alerts based on detection results
      reportDetection(result, 10);
    }, 12000);
    return () => {
      clearInterval(interval);
      behaviorLogger.stopLogging();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testPenRunning]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="animate-slide-in-left">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Event Logs</h1>
          <p className="text-gray-500 dark:text-slate-400">View system and detection events</p>
        </div>

        <div className="flex items-center gap-3">
          {testPenRunning && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Activity className="h-3.5 w-3.5" />
              Pen 10 — logging every 12s
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700/50 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-all duration-200 hover:-translate-y-0.5 text-gray-700 dark:text-slate-300"
          >
            <RefreshCw className={clsx('h-4 w-4', isRefetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-500 dark:text-slate-400" />
          <span className="font-medium text-gray-700 dark:text-slate-300">Filters</span>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Event Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all duration-200"
            >
              <option value="all" className="dark:bg-slate-700">All Types</option>
              {eventTypes?.types.map((t) => (
                <option key={t} value={t} className="capitalize dark:bg-slate-700">
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all duration-200"
            >
              <option value="all" className="dark:bg-slate-700">All Categories</option>
              {eventTypes?.categories.map((c) => (
                <option key={c} value={c} className="capitalize dark:bg-slate-700">
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Show</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white transition-all duration-200"
            >
              <option value={25} className="dark:bg-slate-700">Last 25</option>
              <option value={50} className="dark:bg-slate-700">Last 50</option>
              <option value={100} className="dark:bg-slate-700">Last 100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events list */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-200 dark:border-primary-800 border-t-primary-500 dark:border-t-primary-400" />
          </div>
        ) : events?.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="text-lg">No events found</p>
            <p className="text-sm mt-1">Events will appear here as they occur</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700/50">
            {events?.map((event, index) => (
              <div key={event.id} className="animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
                <EventListItem event={event} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
