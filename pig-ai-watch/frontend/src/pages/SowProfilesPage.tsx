import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSows, useCreateSow, useUpdateSow, useDeleteSow, useArchiveSow, usePens } from '@/hooks';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Archive,
  X,
  Users,
  MoreVertical,
  MapPin,
  Baby,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { Sow, SowCreate, SowUpdate } from '@/types';

/* ─── Status visual config ──────────────────────────────────────────── */

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

export default function SowProfilesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSow, setEditingSow] = useState<Sow | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const { data: sows, isLoading } = useSows({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
  });
  const { data: pens } = usePens(true);
  const createSow = useCreateSow();
  const updateSow = useUpdateSow();
  const deleteSow = useDeleteSow();
  const archiveSow = useArchiveSow();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      tag_id: formData.get('tag_id') as string,
      name: formData.get('name') as string || undefined,
      breed: formData.get('breed') as string || undefined,
      weight: formData.get('weight') ? Number(formData.get('weight')) : undefined,
      parity: formData.get('parity') ? Number(formData.get('parity')) : 0,
      status: formData.get('status') as string,
      current_litter_size: formData.get('current_litter_size') ? Number(formData.get('current_litter_size')) : 0,
      pen_id: formData.get('pen_id') ? Number(formData.get('pen_id')) : undefined,
      notes: formData.get('notes') as string || undefined,
    };

    if (editingSow) {
      updateSow.mutate(
        { id: editingSow.id, data: data as SowUpdate },
        {
          onSuccess: () => {
            toast.success('Sow updated successfully');
            setIsModalOpen(false);
            setEditingSow(null);
          },
          onError: () => toast.error('Failed to update sow'),
        }
      );
    } else {
      createSow.mutate(data as SowCreate, {
        onSuccess: () => {
          toast.success('Sow created successfully');
          setIsModalOpen(false);
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.detail || 'Failed to create sow');
        },
      });
    }
  };

  const handleDelete = (sow: Sow) => {
    if (confirm(`Are you sure you want to delete ${sow.name || sow.tag_id}?`)) {
      deleteSow.mutate(sow.id, {
        onSuccess: () => toast.success('Sow deleted'),
        onError: () => toast.error('Failed to delete sow'),
      });
    }
  };

  const handleArchive = (sow: Sow) => {
    if (confirm(`Are you sure you want to archive ${sow.name || sow.tag_id}? This will hide the sow from active views but retain its data.`)) {
      archiveSow.mutate(sow.id, {
        onSuccess: () => toast.success('Sow archived'),
        onError: () => toast.error('Failed to archive sow'),
      });
    }
  };

  const openEditModal = (sow: Sow) => {
    setEditingSow(sow);
    setIsModalOpen(true);
    setMenuOpenId(null);
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      {/* ── Hero banner (Google Classroom style) ──────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-r from-primary-600 via-primary-500 to-primary-400 dark:from-primary-800 dark:via-primary-700 dark:to-primary-600 shadow-lg">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
            <circle cx="700" cy="30" r="120" fill="white" />
            <circle cx="650" cy="180" r="80" fill="white" />
            <circle cx="100" cy="160" r="60" fill="white" />
          </svg>
        </div>
        <div className="relative px-8 py-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Sow Profiles</h1>
            <p className="text-white/80 mt-1 text-sm">Manage and monitor all registered sows</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/sows/archives')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-full backdrop-blur-sm transition-all duration-200 hover:shadow-lg text-sm"
              title="View Archives"
            >
              <Archive className="h-4 w-4" />
              Archives
            </button>
            <button
              onClick={() => {
                setEditingSow(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white font-medium rounded-full backdrop-blur-sm transition-all duration-200 hover:shadow-lg text-sm"
              title="Add Sow"
            >
              <Plus className="h-4 w-4" />
              Add Sow
            </button>
          </div>
        </div>
      </div>

      {/* ── Search & filter chips ─────────────────────────────────────── */}
      <div className="mb-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search by tag ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700/60 rounded-full text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 transition-all duration-200"
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
                  ? 'bg-primary-500 dark:bg-primary-600 text-white border-primary-500 dark:border-primary-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/40'
              )}
              title={`Filter: ${chip.label}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sow cards grid (Google Classroom inspired) ────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-9 w-9 border-[3px] border-primary-200 dark:border-primary-800 border-t-primary-500 dark:border-t-primary-400" />
        </div>
      ) : sows?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-gray-100 dark:bg-slate-800/60 flex items-center justify-center mb-4">
            <Users className="h-10 w-10 text-gray-300 dark:text-slate-600" />
          </div>
          <p className="text-lg font-medium text-gray-600 dark:text-slate-300">No sows found</p>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Add your first sow to get started</p>
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
                  'group relative bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200/60 dark:border-slate-700/50 shadow-sm',
                  'hover:shadow-md dark:hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4',
                  cfg.cardAccent
                )}
                onClick={() => navigate(`/sows/${sow.id}`)}
              >
                {/* Card header */}
                <div className="px-5 pt-5 pb-3 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className={clsx('h-2.5 w-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                        {sow.name || sow.tag_id}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 pl-5">
                      {sow.tag_id}{sow.breed ? ` · ${sow.breed}` : ''}
                    </p>
                  </div>

                  {/* Three-dot menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === sow.id ? null : sow.id);
                      }}
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors"
                      title="More actions"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                    </button>
                    {menuOpenId === sow.id && (
                      <div className="absolute right-0 top-8 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-dark-lg border border-gray-200 dark:border-slate-700 z-10 py-1 animate-scale-in">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(sow); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
                          title="Edit sow"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleArchive(sow); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
                          title="Archive sow"
                        >
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleDelete(sow); }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                          title="Delete sow"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card body — key stats */}
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

                {/* Card footer */}
                <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700/40 flex items-center justify-between">
                  <span className={clsx('px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize', cfg.bg, cfg.text)}>
                    {sow.status}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors">
                    <span>{format(new Date(sow.created_at), 'MMM d, yyyy')}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add/Edit Modal ────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => { setIsModalOpen(false); setEditingSow(null); }}>
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl dark:shadow-dark-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in border border-gray-100 dark:border-slate-700/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-slate-700/50">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {editingSow ? 'Edit Sow' : 'Add New Sow'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingSow(null);
                }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-full transition-colors"
                title="Close"
              >
                <X className="h-5 w-5 text-gray-400 dark:text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tag ID *">
                  <input
                    name="tag_id"
                    defaultValue={editingSow?.tag_id}
                    required
                    disabled={!!editingSow}
                    placeholder="e.g. SOW-001"
                    className="gc-input disabled:opacity-60"
                  />
                </FormField>
                <FormField label="Name">
                  <input name="name" defaultValue={editingSow?.name || ''} placeholder="Optional name" className="gc-input" />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Breed">
                  <input name="breed" defaultValue={editingSow?.breed || ''} placeholder="e.g. Large White" className="gc-input" />
                </FormField>
                <FormField label="Weight (kg)">
                  <input name="weight" type="number" step="0.1" defaultValue={editingSow?.weight || ''} placeholder="0.0" className="gc-input" />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Status">
                  <select name="status" defaultValue={editingSow?.status || 'active'} className="gc-input" title="Status">
                    <option value="active">Active</option>
                    <option value="pregnant">Pregnant</option>
                    <option value="lactating">Lactating</option>
                    <option value="weaned">Weaned</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </FormField>
                <FormField label="Pen">
                  <select name="pen_id" defaultValue={editingSow?.pen_id || ''} className="gc-input" title="Pen">
                    <option value="">No Pen</option>
                    {pens?.map((pen) => (
                      <option key={pen.id} value={pen.id}>{pen.name}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Parity">
                  <input name="parity" type="number" min="0" defaultValue={editingSow?.parity || 0} className="gc-input" title="Parity" />
                </FormField>
                <FormField label="Current Litter Size">
                  <input name="current_litter_size" type="number" min="0" defaultValue={editingSow?.current_litter_size || 0} className="gc-input" title="Current litter size" />
                </FormField>
              </div>

              <FormField label="Notes">
                <textarea name="notes" rows={3} defaultValue={editingSow?.notes || ''} placeholder="Additional notes..." className="gc-input resize-none" />
              </FormField>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditingSow(null); }}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-full transition-colors"
                  title="Cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSow.isPending || updateSow.isPending}
                  className="px-6 py-2.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-500 text-white rounded-full transition-all duration-200 hover:shadow-md disabled:opacity-50"
                  title={editingSow ? 'Update Sow' : 'Create Sow'}
                >
                  {editingSow ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reusable form field wrapper ─────────────────────────────────── */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}
