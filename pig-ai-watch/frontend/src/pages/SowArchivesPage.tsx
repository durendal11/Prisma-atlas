import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSows, useRestoreSow, usePens } from '@/hooks';
import { 
  Search, 
  RotateCcw,
  Users,
  MoreVertical,
  MapPin,
  Baby,
  TrendingUp,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const statusConfig: Record<string, { dot: string; bg: string; text: string; cardAccent: string }> = {
  active:   { dot: 'bg-green-500',  bg: 'bg-green-50 dark:bg-green-900/20',  text: 'text-green-700 dark:text-green-400',  cardAccent: 'border-l-green-500' },
  pregnant: { dot: 'bg-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-400', cardAccent: 'border-l-purple-500' },
  lactating:{ dot: 'bg-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-400',   cardAccent: 'border-l-blue-500' },
  weaned:   { dot: 'bg-cyan-500',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',   text: 'text-cyan-700 dark:text-cyan-400',   cardAccent: 'border-l-cyan-500' },
  farrowing:{ dot: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', cardAccent: 'border-l-orange-500' },
  inactive: { dot: 'bg-gray-400',   bg: 'bg-gray-50 dark:bg-slate-700/30',   text: 'text-gray-500 dark:text-slate-400',   cardAccent: 'border-l-gray-400' },
};

const statusFilterChips = [
  { value: 'all',       label: 'All' },
  { value: 'active',    label: 'Active' },
  { value: 'pregnant',  label: 'Pregnant' },
  { value: 'lactating', label: 'Lactating' },
  { value: 'weaned',    label: 'Weaned' },
  { value: 'inactive',  label: 'Inactive' },
];

export default function SowArchivesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const { data: sows, isLoading } = useSows({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    archived: true,
  });
  const { data: pens } = usePens(true);
  const restoreSow = useRestoreSow();

  const handleRestore = (sowId: number, tagId: string) => {
    if (confirm(`Are you sure you want to restore ${tagId}?`)) {
      restoreSow.mutate(sowId, {
        onSuccess: () => {
          toast.success('Sow restored successfully');
          setMenuOpenId(null);
        },
        onError: () => toast.error('Failed to restore sow'),
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 shadow-lg">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
            <circle cx="700" cy="30" r="120" fill="white" />
            <circle cx="650" cy="180" r="80" fill="white" />
            <circle cx="100" cy="160" r="60" fill="white" />
          </svg>
        </div>
        <div className="relative px-8 py-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 mb-2 hover:text-white cursor-pointer w-fit" onClick={() => navigate('/sows')}>
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back to Active Profiles</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Archived Sows</h1>
            <p className="text-white/80 mt-1 text-sm">View historical data for sows that are no longer active</p>
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search by tag ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/60 rounded-full text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500/40 focus:border-gray-400 transition-all duration-200"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {statusFilterChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border',
                statusFilter === chip.value
                  ? 'bg-gray-500 dark:bg-gray-600 text-white border-gray-500 dark:border-gray-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/40'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-9 w-9 border-[3px] border-gray-200 dark:border-gray-800 border-t-gray-500 dark:border-t-gray-400" />
        </div>
      ) : sows?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-gray-100 dark:bg-slate-800/60 flex items-center justify-center mb-4">
            <Users className="h-10 w-10 text-gray-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No archived sows found</h3>
          <p className="text-gray-500 dark:text-slate-400">Archived sows will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sows?.map((sow) => {
            const cfg = statusConfig[sow.status] || statusConfig.active;
            const pen = pens?.find(p => p.id === sow.pen_id);
            return (
              <div
                key={sow.id}
                className={clsx(
                  'group relative bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200/60 dark:border-slate-700/50 shadow-sm opacity-80',
                  'hover:shadow-md hover:opacity-100 dark:hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4',
                  cfg.cardAccent
                )}
                onClick={() => navigate(`/sows/${sow.id}`)}
              >
                <div className="px-5 pt-5 pb-3 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className={clsx('h-2.5 w-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate line-through">
                        {sow.name || sow.tag_id}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 pl-5">
                      {sow.tag_id}{sow.breed ? ` · ${sow.breed}` : ''}
                    </p>
                  </div>

                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === sow.id ? null : sow.id);
                      }}
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                    </button>
                    {menuOpenId === sow.id && (
                      <div className="absolute right-0 top-8 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-slate-700 z-10 py-1 animate-scale-in">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestore(sow.id, sow.tag_id); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 pb-4 grid grid-cols-3 gap-3">
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                    <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs">Parity <span className="font-semibold text-gray-700 dark:text-slate-200">{sow.parity}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                    <Baby className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs">Litter <span className="font-semibold text-gray-700 dark:text-slate-200">{sow.current_litter_size}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs truncate">{pen?.name || '—'}</span>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700/40 flex items-center justify-between">
                  <span className={clsx('px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize', cfg.bg, cfg.text)}>
                    {sow.status}
                  </span>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                      <span>Archived: {sow.archived_at ? format(new Date(sow.archived_at), 'MMM d, yyyy') : 'Unknown'}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
