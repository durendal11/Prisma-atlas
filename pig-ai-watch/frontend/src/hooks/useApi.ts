import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { sowsApi, alertsApi, eventsApi, dashboardApi, pensApi, authApi, farrowingApi } from '@/api';
import type { SowCreate, SowUpdate, AlertCreate, EventCreate } from '@/types';

// Generic API hook for farrowing and other pages
// Returns the raw axios instance + specific API modules
// Memoized so the reference is stable across renders (prevents infinite loops in useCallback/useEffect)
export function useApi() {
  return useMemo(() => ({
    // Raw axios methods for direct API calls
    get: api.get.bind(api),
    post: api.post.bind(api),
    put: api.put.bind(api),
    delete: api.delete.bind(api),
    // Specific API modules
    farrowing: farrowingApi,
    sows: sowsApi,
    pens: pensApi,
    alerts: alertsApi,
  }), []);
}

// Auth hooks
export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: authApi.getCurrentUser,
    retry: false,
  });
}

// Dashboard hooks
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function usePenStatus() {
  return useQuery({
    queryKey: ['penStatus'],
    queryFn: async () => {
      const statusList = await dashboardApi.getPenStatus();

      // Some deployments return an empty pen-status list until streams/detections are active.
      // Fall back to active pens so Live Monitoring and Dashboard still show registered pens.
      if (statusList.length > 0) {
        return statusList;
      }

      const activePens = await pensApi.getAll(true);
      return activePens.map((pen) => ({
        pen_id: pen.id,
        pen_name: pen.name,
        sow_tag: null,
        piglet_count: 0,
        sow_posture: 'unknown',
        crushing_risk: 0,
        last_updated: new Date().toISOString(),
        is_streaming: false,
      }));
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

// Sows hooks
export function useSows(params?: { status?: string; pen_id?: number; search?: string; archived?: boolean }) {
  return useQuery({
    queryKey: ['sows', params],
    queryFn: () => sowsApi.getAll(params),
  });
}

export function useSow(id: number) {
  return useQuery({
    queryKey: ['sow', id],
    queryFn: () => sowsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateSow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: SowCreate) => sowsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sows'] });
    },
  });
}

export function useUpdateSow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SowUpdate }) => 
      sowsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['sows'] });
      queryClient.invalidateQueries({ queryKey: ['sow', id] });
    },
  });
}

export function useDeleteSow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => sowsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sows'] });
    },
  });
}

export function useArchiveSow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => sowsApi.archive(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sows'] });
      queryClient.invalidateQueries({ queryKey: ['sow', id] });
    },
  });
}

export function useRestoreSow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => sowsApi.restore(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sows'] });
      queryClient.invalidateQueries({ queryKey: ['sow', id] });
    },
  });
}

// Alerts hooks
export function useAlerts(params?: {
  type?: string;
  severity?: string;
  is_resolved?: boolean;
  limit?: number;
  pen_id?: number;
  sow_id?: number;
}) {
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: () => alertsApi.getAll(params),
    refetchInterval: 15000,
  });
}

export function useAlertStats() {
  return useQuery({
    queryKey: ['alertStats'],
    queryFn: alertsApi.getStats,
    refetchInterval: 15000,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AlertCreate) => alertsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useUpdateAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { is_read?: boolean; is_resolved?: boolean } }) =>
      alertsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useArchivedAlerts() {
  return useQuery({
    queryKey: ['archivedAlerts'],
    queryFn: () => alertsApi.getArchived(),
    refetchInterval: 15000,
  });
}

export function useArchiveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => alertsApi.archiveAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['archivedAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useRestoreAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => alertsApi.restoreAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['archivedAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useArchiveAllAlerts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: alertsApi.archiveAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['archivedAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useDeleteArchivedReadAlerts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: alertsApi.deleteArchivedRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archivedAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => alertsApi.deleteAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['archivedAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['alertStats'] });
    },
  });
}

// Events hooks
export function useEvents(params?: {
  type?: string;
  category?: string;
  pen_id?: number;
  sow_id?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => eventsApi.getAll(params),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: EventCreate) => eventsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useEventTypes() {
  return useQuery({
    queryKey: ['eventTypes'],
    queryFn: eventsApi.getTypes,
  });
}

// Pens hooks
export function usePens(isActive?: boolean) {
  return useQuery({
    queryKey: ['pens', isActive],
    queryFn: () => pensApi.getAll(isActive),
  });
}

export function usePen(id: number) {
  return useQuery({
    queryKey: ['pen', id],
    queryFn: () => pensApi.getById(id),
    enabled: !!id,
  });
}
