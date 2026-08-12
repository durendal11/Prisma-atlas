import axios from 'axios';
import type { 
  AuthToken, 
  User, 
  Sow, 
  SowCreate, 
  SowUpdate,
  Alert, 
  AlertCreate, 
  Event, 
  EventCreate,
  DashboardStats,
  PenStatus,
  Pen,
  AlertStats
} from '@/types';

// Always prefer same-origin /api routing. If VITE_API_URL is absolute http:// while
// the page is loaded on https://, upgrade it to https:// to avoid mixed-content blocks.
const resolveApiBaseUrl = () => {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (!raw) return '';
  if (typeof window === 'undefined') return raw;

  const isHttpsPage = window.location.protocol === 'https:';
  if (isHttpsPage && raw.startsWith('http://')) {
    return raw.replace('http://', 'https://');
  }
  return raw;
};

const API_BASE_URL = resolveApiBaseUrl();
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LANDING_URL = isLocalDev ? 'http://localhost:3000' : '/';

console.log('API Base URL:', API_BASE_URL);

// Guard to prevent multiple simultaneous 401 redirects (race condition)
let _sessionExpiredRedirectInProgress = false;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Only force-logout on 401 from actual API calls
    // Skip for /api/auth/me (ProtectedRoute handles its own validation)
    // Skip for /api/auth/login (login form handles errors)
    const url = error.config?.url || '';
    const isAuthMeCall = url.includes('/api/auth/me');
    const isLoginCall = url.includes('/api/auth/login');

    if (error.response?.status === 401 && !isAuthMeCall && !isLoginCall && !_sessionExpiredRedirectInProgress) {
      // Before force-logging out, verify the token is truly expired.
      // A 401 can happen from cross-origin redirects (307 trailing-slash) that
      // strip the Authorization header — the token is still valid in that case.
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        try {
          const baseUrl = isLocalDev ? 'http://localhost:8000' : '';
          const checkResponse = await fetch(`${baseUrl}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${storedToken}` },
          });
          if (checkResponse.ok) {
            // Token is still valid — this was a false 401 (e.g. redirect stripped auth).
            // Don't logout, just let the calling code handle the error.
            console.warn('401 on', url, 'but token still valid — not logging out');
            return Promise.reject(error);
          }
        } catch {
          // Network error checking token — don't logout, could be transient
          console.warn('401 on', url, 'but cannot verify token — not logging out');
          return Promise.reject(error);
        }
      }

      console.warn('401 received on', url, '— session truly expired, redirecting');
      _sessionExpiredRedirectInProgress = true;
      localStorage.removeItem('access_token');

      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        window.location.replace('/login');
      } else {
        window.location.href = `${LANDING_URL}?logout=true`;
      }

      setTimeout(() => { _sessionExpiredRedirectInProgress = false; }, 3000);
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (username: string, password: string): Promise<AuthToken> => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await api.post('/api/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  googleLogin: async (credential: string): Promise<AuthToken> => {
    const response = await api.post('/api/auth/google', { credential });
    return response.data;
  },
  
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
  
  register: async (userData: { 
    username: string; 
    email: string; 
    password: string; 
    full_name?: string 
  }): Promise<User> => {
    const response = await api.post('/api/auth/register', userData);
    return response.data;
  },
};

// Sows API
export const sowsApi = {
  getAll: async (params?: { 
    skip?: number; 
    limit?: number; 
    status?: string; 
    pen_id?: number;
    search?: string;
    archived?: boolean;
  }): Promise<Sow[]> => {
    const response = await api.get('/api/sows', { params });
    return response.data;
  },
  
  getById: async (id: number): Promise<Sow> => {
    const response = await api.get(`/api/sows/${id}`);
    return response.data;
  },
  
  create: async (data: SowCreate): Promise<Sow> => {
    const response = await api.post('/api/sows', data);
    return response.data;
  },
  
  update: async (id: number, data: SowUpdate): Promise<Sow> => {
    const response = await api.put(`/api/sows/${id}`, data);
    return response.data;
  },
  
  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/sows/${id}`);
  },

  archive: async (id: number): Promise<Sow> => {
    const response = await api.post(`/api/sows/${id}/archive`);
    return response.data;
  },
  
  restore: async (id: number): Promise<Sow> => {
    const response = await api.post(`/api/sows/${id}/restore`);
    return response.data;
  },
};

// Alerts API
export const alertsApi = {
  getAll: async (params?: {
    skip?: number;
    limit?: number;
    type?: string;
    severity?: string;
    is_read?: boolean;
    is_resolved?: boolean;
    pen_id?: number;
    sow_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<Alert[]> => {
    const response = await api.get('/api/alerts', { params });
    return response.data;
  },
  
  getStats: async (): Promise<AlertStats> => {
    const response = await api.get('/api/alerts/stats');
    return response.data;
  },
  
  getById: async (id: number): Promise<Alert> => {
    const response = await api.get(`/api/alerts/${id}`);
    return response.data;
  },
  
  create: async (data: AlertCreate): Promise<Alert> => {
    const response = await api.post('/api/alerts', data);
    return response.data;
  },
  
  update: async (id: number, data: { is_read?: boolean; is_resolved?: boolean; is_archived?: boolean }): Promise<Alert> => {
    const response = await api.patch(`/api/alerts/${id}`, data);
    return response.data;
  },

  archiveAlert: async (id: number): Promise<Alert> => {
    const response = await api.post(`/api/alerts/${id}/archive`);
    return response.data;
  },

  restoreAlert: async (id: number): Promise<Alert> => {
    const response = await api.post(`/api/alerts/${id}/restore`);
    return response.data;
  },
  
  markAllRead: async (): Promise<{ message: string }> => {
    const response = await api.post('/api/alerts/mark-all-read');
    return response.data;
  },

  archiveAll: async (): Promise<{ message: string; count: number }> => {
    const response = await api.post('/api/alerts/archive-all');
    return response.data;
  },

  getArchived: async (params?: { skip?: number; limit?: number }): Promise<Alert[]> => {
    const response = await api.get('/api/alerts/archived', { params });
    return response.data;
  },

  deleteArchivedRead: async (): Promise<{ message: string; count: number }> => {
    const response = await api.delete('/api/alerts/archived-read');
    return response.data;
  },

  deleteAlert: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/api/alerts/${id}`);
    return response.data;
  },

  createTest: async (penId: number = 1): Promise<Alert> => {
    const response = await api.post(`/api/alerts/test?pen_id=${penId}`);
    return response.data;
  },
};

// Events API
export const eventsApi = {
  getAll: async (params?: {
    skip?: number;
    limit?: number;
    type?: string;
    category?: string;
    pen_id?: number;
    sow_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<Event[]> => {
    const response = await api.get('/api/events', { params });
    return response.data;
  },
  
  create: async (data: EventCreate): Promise<Event> => {
    const response = await api.post('/api/events', data);
    return response.data;
  },
  
  getTypes: async (): Promise<{ types: string[]; categories: string[] }> => {
    const response = await api.get('/api/events/types');
    return response.data;
  },
};

// Advisory API
export const advisoryApi = {
  getPenAdvisory: async (data: Record<string, any>): Promise<{
    urgency: 'critical' | 'high' | 'medium' | 'low';
    headline: string;
    body: string;
    recommended_action: string;
    source_basis: string;
    error?: string;
  }> => {
    const response = await api.post('/api/advisory/pen-advisory', data);
    return response.data;
  },

  getDailyDigest: async (data: Record<string, any>): Promise<{ markdown: string }> => {
    const response = await api.post('/api/advisory/daily-digest', data);
    return response.data;
  },
};

// Dashboard API
export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/api/dashboard/stats');
    return response.data;
  },
  
  getPenStatus: async (): Promise<PenStatus[]> => {
    const response = await api.get('/api/dashboard/pen-status');
    return response.data;
  },
};

// Pens API
export const pensApi = {
  getAll: async (is_active?: boolean): Promise<Pen[]> => {
    const response = await api.get('/api/pens', { params: { is_active } });
    return response.data;
  },
  
  getById: async (id: number): Promise<Pen> => {
    const response = await api.get(`/api/pens/${id}`);
    return response.data;
  },
  
  create: async (data: { name: string; location?: string; camera_source?: string; edge_camera_source?: string | null }): Promise<Pen> => {
    const response = await api.post('/api/pens', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; location?: string; camera_source?: string | null; edge_camera_source?: string | null; is_active?: boolean }): Promise<Pen> => {
    const response = await api.put(`/api/pens/${id}`, data);
    return response.data;
  },

  remove: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/api/pens/${id}`);
    return response.data;
  },

  testCamera: async (rtspUrl: string): Promise<{ success: boolean; message: string; details?: any }> => {
    const response = await api.post('/api/pens/test-camera', { rtsp_url: rtspUrl }, { timeout: 30000 });
    return response.data;
  },
};

// Stream API
export const streamApi = {
  getStreamUrl: (penId: string): string => {
    const token = localStorage.getItem('access_token');
    return `${API_BASE_URL}/api/stream/${penId}?token=${token}`;
  },
  
  getSnapshotUrl: (penId: string): string => {
    const token = localStorage.getItem('access_token');
    return `${API_BASE_URL}/api/stream/${penId}/snapshot?token=${token}`;
  },

  stopStream: async (penId: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/stream/${penId}/stop`);
    return response.data;
  },

  restartStream: async (penId: string): Promise<{ message: string; is_running: boolean }> => {
    const response = await api.post(`/api/stream/${penId}/restart`);
    return response.data;
  },
};


// Farrowing API
export const farrowingApi = {
  getRecords: async (params?: Record<string, unknown>): Promise<unknown[]> => {
    const response = await api.get('/api/farrowing/records', { params });
    return response.data;
  },

  getRecord: async (id: number): Promise<unknown> => {
    const response = await api.get(`/api/farrowing/records/${id}`);
    return response.data;
  },
  
  getDueSows: async (days?: number): Promise<unknown[]> => {
    const response = await api.get('/api/farrowing/due-sows', { params: { days } });
    return response.data;
  },
  
  getStatistics: async (days?: number): Promise<unknown> => {
    const response = await api.get('/api/farrowing/statistics', { params: { period_days: days } });
    return response.data;
  },
  
  createRecord: async (data: unknown): Promise<unknown> => {
    const response = await api.post('/api/farrowing/records', data);
    return response.data;
  },

  updateRecord: async (id: number, data: unknown): Promise<unknown> => {
    const response = await api.put(`/api/farrowing/records/${id}`, data);
    return response.data;
  },
  
  completeRecord: async (id: number, data: unknown): Promise<unknown> => {
    const response = await api.post(`/api/farrowing/records/${id}/complete`, data);
    return response.data;
  },

  addPiglet: async (recordId: number, data: unknown): Promise<unknown> => {
    const response = await api.post(`/api/farrowing/records/${recordId}/piglets`, data);
    return response.data;
  },

  getPiglet: async (pigletId: number): Promise<unknown> => {
    const response = await api.get(`/api/farrowing/piglets/${pigletId}`);
    return response.data;
  },

  updatePiglet: async (pigletId: number, data: unknown): Promise<unknown> => {
    const response = await api.put(`/api/farrowing/piglets/${pigletId}`, data);
    return response.data;
  },
};

export const recordingApi = {
  getSchedule: async (pen_id: number) => {
    const response = await api.get(`/api/recording/schedules/${pen_id}`);
    return response.data;
  },
  saveSchedule: async (pen_id: number, schedule: any) => {
    const response = await api.put(`/api/recording/schedules/${pen_id}`, { schedule });
    return response.data;
  },
  getRecordings: async (pen_id: number) => {
    // Merge both endpoints into one response format expected by the frontend
    const clipsRes = await api.get(`/api/recording/clips/${pen_id}`);
    const storageRes = await api.get(`/api/recording/storage`);
    
    // Find matching storage for this pen
    const penStorage = storageRes.data.find((s: any) => s.pen_id === pen_id);
    
    // Map backend clip response fields to the mocked UI response fields
    const recordings = clipsRes.data.map((clip: any) => ({
      ...clip,
      duration_sec: clip.duration_seconds,
      size_bytes: clip.file_size_bytes,
      filename: clip.file_path ? clip.file_path.split('/').pop() : `${clip.id}.mp4`
    }));

    return {
      recordings,
      storage: penStorage ? {
        total: penStorage.total_bytes,
        used: penStorage.total_bytes - penStorage.free_bytes,
        free: penStorage.free_bytes,
        storage_path: penStorage.storage_path
      } : null
    };
  },
  getStorage: async () => {
    const response = await api.get(`/api/recording/storage`);
    return response.data;
  },
  deleteRecording: async (clipId: string) => {
    const response = await api.delete(`/api/recording/clips/${clipId}`);
    return response.data;
  },
};

export default api;
