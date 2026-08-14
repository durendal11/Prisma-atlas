import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSow, useEvents, useAlerts, usePens } from '@/hooks';
import { farrowingApi } from '@/api';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Tag,
  Heart,
  Weight,
  Calendar,
  MapPin,
  Baby,
  Activity,
  AlertTriangle,
  Clock,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { format, formatDistanceToNow, subDays, isAfter } from 'date-fns';
import clsx from 'clsx';
import type { FarrowingRecord, Event as SowEvent, Alert } from '@/types';
import { ExportPdfButton } from '@/components/ui/ExportPdfButton';
import { generateSowPassportPDF } from '@/utils/pdfExporter';

/* ─── Status config ──────────────────────────────────────────────── */

const statusConfig: Record<string, { dot: string; bg: string; text: string; banner: string }> = {
  active:   { dot: 'bg-green-400',  bg: 'bg-green-50 dark:bg-green-900/20',  text: 'text-green-700 dark:text-green-400',  banner: 'from-green-600 via-green-500 to-emerald-400 dark:from-green-800 dark:via-green-700 dark:to-emerald-600' },
  pregnant: { dot: 'bg-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-400', banner: 'from-purple-600 via-purple-500 to-violet-400 dark:from-purple-800 dark:via-purple-700 dark:to-violet-600' },
  lactating:{ dot: 'bg-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-400',   banner: 'from-blue-600 via-blue-500 to-sky-400 dark:from-blue-800 dark:via-blue-700 dark:to-sky-600' },
  weaned:   { dot: 'bg-cyan-400',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',   text: 'text-cyan-700 dark:text-cyan-400',   banner: 'from-cyan-600 via-cyan-500 to-teal-400 dark:from-cyan-800 dark:via-cyan-700 dark:to-teal-600' },
  farrowing:{ dot: 'bg-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', banner: 'from-orange-600 via-orange-500 to-amber-400 dark:from-orange-800 dark:via-orange-700 dark:to-amber-600' },
  inactive: { dot: 'bg-gray-400',   bg: 'bg-gray-50 dark:bg-slate-700/30',   text: 'text-gray-500 dark:text-slate-400',   banner: 'from-gray-500 via-gray-400 to-slate-400 dark:from-gray-700 dark:via-gray-600 dark:to-slate-600' },
};

const severityConfig: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-900/20',    text: 'text-red-700 dark:text-red-400',    dot: 'bg-red-500' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  medium:   { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low:      { bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-400',   dot: 'bg-blue-500' },
};

type TabKey = 'overview' | 'farrowing' | 'alerts' | 'events';

export default function SowDetailPage() {
  const { sowId } = useParams<{ sowId: string }>();
  const navigate = useNavigate();
  const id = Number(sowId);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { data: sow, isLoading: sowLoading } = useSow(id);
  const { data: pens } = usePens(true);
  const { data: events } = useEvents({ sow_id: id, limit: 50 });
  const { data: alerts } = useAlerts({ sow_id: id, limit: 20 });
  const { data: farrowingRecords, isLoading: farrowingLoading } = useQuery({
    queryKey: ['farrowingRecords', id],
    queryFn: () => farrowingApi.getRecords({ sow_id: id, days_back: 365, limit: 50 }),
    enabled: !!id,
  });

  if (sowLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-primary-200 dark:border-primary-800 border-t-primary-500 dark:border-t-primary-400" />
      </div>
    );
  }

  if (!sow) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="h-20 w-20 rounded-full bg-gray-100 dark:bg-slate-800/60 flex items-center justify-center mb-4">
          <Tag className="h-10 w-10 text-gray-300 dark:text-slate-600" />
        </div>
        <p className="text-lg font-medium text-gray-600 dark:text-slate-300">Sow not found</p>
        <button onClick={() => navigate('/sows')} className="mt-3 text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors">
          Back to Sow Profiles
        </button>
      </div>
    );
  }

  const cfg = statusConfig[sow.status] || statusConfig.active;
  const penName = pens?.find(p => p.id === sow.pen_id)?.name || 'Unassigned';
  const records = (farrowingRecords || []) as FarrowingRecord[];
  const recentEvents = (events || []) as SowEvent[];
  const recentAlerts = (alerts || []) as Alert[];

  // Daily / weekly summary
  const now = new Date();
  const oneDayAgo = subDays(now, 1);
  const sevenDaysAgo = subDays(now, 7);
  const eventsToday = recentEvents.filter(e => isAfter(new Date(e.created_at), oneDayAgo));
  const eventsThisWeek = recentEvents.filter(e => isAfter(new Date(e.created_at), sevenDaysAgo));
  const alertsToday = recentAlerts.filter(a => isAfter(new Date(a.created_at), oneDayAgo));
  const alertsThisWeek = recentAlerts.filter(a => isAfter(new Date(a.created_at), sevenDaysAgo));
  const unresolvedAlerts = recentAlerts.filter(a => !a.is_resolved);

  // Farrowing stats
  const totalFarrowings = records.length;
  const avgBornAlive = totalFarrowings > 0
    ? (records.reduce((sum, r) => sum + (r.born_alive || 0), 0) / totalFarrowings).toFixed(1)
    : '—';
  const avgTotalBorn = totalFarrowings > 0
    ? (records.reduce((sum, r) => sum + (r.total_born || 0), 0) / totalFarrowings).toFixed(1)
    : '—';
  const totalStillborn = records.reduce((sum, r) => sum + (r.stillborn || 0), 0);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'farrowing', label: 'Farrowing', count: totalFarrowings },
    { key: 'alerts',    label: 'Alerts',    count: unresolvedAlerts.length },
    { key: 'events',    label: 'Events',    count: recentEvents.length },
  ];

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* ── Hero Banner (Google Classroom style) ──────────────────────── */}
      <div className={clsx('relative rounded-2xl overflow-hidden mb-6 shadow-lg bg-gradient-to-r', cfg.banner)}>
        {/* Decorative circles */}
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
            <circle cx="720" cy="20" r="130" fill="white" />
            <circle cx="680" cy="190" r="90" fill="white" />
            <circle cx="80" cy="170" r="50" fill="white" />
          </svg>
        </div>

        <div className="relative px-8 pt-6 pb-8">
          {/* Top action row */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/sows')}
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors"
              title="Back to Sow Profiles"
            >
              <ArrowLeft className="h-4 w-4" />
              Sow Profiles
            </button>
            <ExportPdfButton
              label="Export Sow Passport PDF"
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
              onExport={() => {
                generateSowPassportPDF({
                  sow: {
                    id: sow.id,
                    tag_id: sow.tag_id,
                    name: sow.name,
                    breed: sow.breed,
                    parity: sow.parity,
                    status: sow.status,
                    pen_id: sow.pen_id,
                    birth_date: sow.birth_date,
                  },
                  farrowingHistory: records,
                  alertsHistory: recentAlerts,
                });
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-white tracking-tight">
                  {sow.name || sow.tag_id}
                </h1>
                <span className="px-3 py-1 rounded-full text-xs font-semibold capitalize bg-white/20 text-white backdrop-blur-sm">
                  {sow.status}
                </span>
                {sow.is_archived && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/80 text-white shadow-sm border border-white/20 backdrop-blur-sm whitespace-nowrap flex-shrink-0">
                    Archived
                  </span>
                )}
              </div>
              <p className="text-white/70 text-sm">
                Tag ID: {sow.tag_id}
                {sow.breed ? ` · ${sow.breed}` : ''}
                {' · '}Registered {format(new Date(sow.created_at), 'MMM d, yyyy')}
              </p>
            </div>

            {/* Quick stats in banner */}
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{sow.parity}</p>
                <p className="text-xs text-white/60 uppercase tracking-wide">Parity</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{sow.current_litter_size}</p>
                <p className="text-xs text-white/60 uppercase tracking-wide">Litter</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{totalFarrowings}</p>
                <p className="text-xs text-white/60 uppercase tracking-wide">Farrowings</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-slate-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 -mb-px',
              activeTab === tab.key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600'
            )}
            title={tab.label}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={clsx(
                'ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                activeTab === tab.key
                  ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                  : 'bg-gray-100 dark:bg-slate-700/50 text-gray-500 dark:text-slate-400'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Profile info cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <InfoCard icon={<Tag className="h-4 w-4" />} label="Tag ID" value={sow.tag_id} />
              <InfoCard icon={<Heart className="h-4 w-4" />} label="Breed" value={sow.breed || 'N/A'} />
              <InfoCard icon={<Weight className="h-4 w-4" />} label="Weight" value={sow.weight ? `${sow.weight} kg` : 'N/A'} />
              <InfoCard icon={<TrendingUp className="h-4 w-4" />} label="Parity" value={String(sow.parity)} highlight />
              <InfoCard icon={<Baby className="h-4 w-4" />} label="Litter Size" value={String(sow.current_litter_size)} />
              <InfoCard icon={<MapPin className="h-4 w-4" />} label="Pen" value={penName} />
            </div>

            {/* Key Dates */}
            <SectionCard title="Key Dates" icon={<Calendar className="h-4.5 w-4.5" />}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                <DateField label="Birth Date" value={sow.birth_date} />
                <DateField label="Last Breeding" value={sow.last_breeding_date} />
                <DateField label="Expected Farrowing" value={sow.expected_farrowing_date} highlight />
                <DateField label="Last Farrowing" value={sow.last_farrowing_date} />
                <DateField label="Created" value={sow.created_at} />
                <DateField label="Last Updated" value={sow.updated_at} />
              </div>
            </SectionCard>

            {/* Daily / Weekly Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SectionCard title="Daily Summary" subtitle="Last 24 hours" icon={<Clock className="h-4.5 w-4.5" />}>
                <div className="grid grid-cols-2 gap-4">
                  <SummaryItem label="Events" value={eventsToday.length} color="text-blue-600 dark:text-blue-400" />
                  <SummaryItem label="Alerts" value={alertsToday.length} color="text-orange-600 dark:text-orange-400" />
                </div>
                {eventsToday.length === 0 && alertsToday.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-3">No activity in the last 24 hours.</p>
                )}
              </SectionCard>

              <SectionCard title="Weekly Summary" subtitle="Last 7 days" icon={<Activity className="h-4.5 w-4.5" />}>
                <div className="grid grid-cols-3 gap-4">
                  <SummaryItem label="Events" value={eventsThisWeek.length} color="text-blue-600 dark:text-blue-400" />
                  <SummaryItem label="Alerts" value={alertsThisWeek.length} color="text-orange-600 dark:text-orange-400" />
                  <SummaryItem label="Unresolved" value={unresolvedAlerts.length} color="text-red-600 dark:text-red-400" />
                </div>
              </SectionCard>
            </div>

            {/* Farrowing Summary Stats */}
            <SectionCard title="Farrowing Performance" icon={<Baby className="h-4.5 w-4.5" />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryItem label="Total Farrowings" value={totalFarrowings} color="text-gray-900 dark:text-white" />
                <SummaryItem label="Avg Born Alive" value={avgBornAlive} color="text-green-600 dark:text-green-400" />
                <SummaryItem label="Avg Total Born" value={avgTotalBorn} color="text-blue-600 dark:text-blue-400" />
                <SummaryItem label="Total Stillborn" value={totalStillborn} color="text-red-600 dark:text-red-400" />
              </div>
            </SectionCard>

            {/* Notes */}
            {sow.notes && (
              <SectionCard title="Notes" icon={<FileText className="h-4.5 w-4.5" />}>
                <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{sow.notes}</p>
              </SectionCard>
            )}
          </div>
        )}

        {activeTab === 'farrowing' && (
          <SectionCard title="Farrowing History" icon={<Baby className="h-4.5 w-4.5" />} noPadding>
            <div className="px-6 pb-4 border-b border-gray-100 dark:border-slate-700/40">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Parity {sow.parity} · {totalFarrowings} recorded · Avg born alive: {avgBornAlive} · Avg total born: {avgTotalBorn} · Total stillborn: {totalStillborn}
              </p>
            </div>

            {farrowingLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-7 w-7 border-[3px] border-primary-200 dark:border-primary-800 border-t-primary-500" />
              </div>
            ) : records.length === 0 ? (
              <EmptyState icon={<Baby className="h-10 w-10" />} message="No farrowing records found for this sow." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-700/40">
                      <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Date Started</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Completed</th>
                      <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Total</th>
                      <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Alive</th>
                      <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Stillborn</th>
                      <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Mummified</th>
                      <th className="px-4 py-3 text-center text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Crushed</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-700/30">
                    {records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-6 py-3.5 text-sm text-gray-900 dark:text-white">
                          {rec.farrowing_started ? format(new Date(rec.farrowing_started), 'MMM d, yyyy h:mm a') : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-slate-400">
                          {rec.farrowing_completed ? format(new Date(rec.farrowing_completed), 'MMM d, yyyy h:mm a') : (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">In Progress</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-center font-semibold text-gray-900 dark:text-white">{rec.total_born ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-center font-semibold text-green-600 dark:text-green-400">{rec.born_alive ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-center text-red-500 dark:text-red-400">{rec.stillborn ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-center text-gray-500 dark:text-slate-400">{rec.mummified ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-center text-red-500 dark:text-red-400">{rec.crushed ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-slate-400 capitalize">{rec.sow_condition || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {activeTab === 'alerts' && (
          <SectionCard title="Alerts" icon={<AlertTriangle className="h-4.5 w-4.5 text-orange-500" />} noPadding>
            {recentAlerts.length === 0 ? (
              <EmptyState icon={<AlertTriangle className="h-10 w-10" />} message="No alerts recorded for this sow." />
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700/40">
                {recentAlerts.map((alert) => {
                  const sev = severityConfig[alert.severity] || severityConfig.low;
                  return (
                    <div
                      key={alert.id}
                      className={clsx(
                        'px-6 py-4 flex items-start gap-3',
                        !alert.is_resolved && 'bg-orange-50/30 dark:bg-orange-900/5'
                      )}
                    >
                      <div className={clsx('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', sev.dot)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</p>
                        {alert.message && (
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{alert.message}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase', sev.bg, sev.text)}>
                            {alert.severity}
                          </span>
                          {!alert.is_resolved && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 uppercase">
                              Open
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        )}

        {activeTab === 'events' && (
          <SectionCard title="Event Log" icon={<FileText className="h-4.5 w-4.5" />} noPadding>
            {recentEvents.length === 0 ? (
              <EmptyState icon={<FileText className="h-10 w-10" />} message="No events recorded for this sow." />
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700/40">
                {recentEvents.map((event) => (
                  <div key={event.id} className="px-6 py-4 flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">{event.description || event.type}</p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-slate-700/50 text-gray-500 dark:text-slate-400 uppercase">
                          {event.type}
                        </span>
                        {event.category && (
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">{event.category}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function SectionCard({ title, subtitle, icon, children, noPadding }: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200/60 dark:border-slate-700/50 shadow-sm overflow-hidden">
      <div className={clsx('flex items-center gap-2.5', noPadding ? 'px-6 pt-5 pb-3' : 'px-6 pt-5 pb-4')}>
        <span className="text-primary-500 dark:text-primary-400">{icon}</span>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 dark:text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className={noPadding ? '' : 'px-6 pb-6'}>
        {children}
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200/60 dark:border-slate-700/50 p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-slate-500 mb-1.5">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={clsx(
        'text-base font-bold truncate',
        highlight ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'
      )}>
        {value}
      </p>
    </div>
  );
}

function DateField({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide">{label}</span>
      {value ? (
        <span className={clsx(
          'text-sm font-medium',
          highlight ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'
        )}>
          {format(new Date(value), 'MMM d, yyyy')}
          <span className="text-gray-400 dark:text-slate-500 font-normal ml-1.5 text-xs">
            ({formatDistanceToNow(new Date(value), { addSuffix: true })})
          </span>
        </span>
      ) : (
        <span className="text-sm text-gray-300 dark:text-slate-600">—</span>
      )}
    </div>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="text-center py-2">
      <p className={clsx('text-2xl font-bold', color)}>{value}</p>
      <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-slate-800/60 flex items-center justify-center mb-3 text-gray-300 dark:text-slate-600">
        {icon}
      </div>
      <p className="text-sm text-gray-400 dark:text-slate-500">{message}</p>
    </div>
  );
}
