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

// Always use relative URL so the Vite dev proxy (or nginx in prod) handles routing.
// Direct absolute URLs bypass the proxy and trigger CORS errors.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
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
  
  update: async (id: number, data: { is_read?: boolean; is_resolved?: boolean }): Promise<Alert> => {
    const response = await api.patch(`/api/alerts/${id}`, data);
    return response.data;
  },
  
  markAllRead: async (): Promise<{ message: string }> => {
    const response = await api.post('/api/alerts/mark-all-read');
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
  
  create: async (data: { name: string; location?: string; camera_source?: string }): Promise<Pen> => {
    const response = await api.post('/api/pens', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; location?: string; camera_source?: string | null; is_active?: boolean }): Promise<Pen> => {
    const response = await api.put(`/api/pens/${id}`, data);
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

// Tasks API
export const tasksApi = {
  getAll: async (params?: Record<string, unknown>): Promise<unknown[]> => {
    const response = await api.get('/api/tasks/', { params });
    return response.data;
  },
  
  getTemplates: async (): Promise<unknown[]> => {
    const response = await api.get('/api/tasks/templates/');
    return response.data;
  },
  
  getDashboardSummary: async (): Promise<unknown> => {
    const response = await api.get('/api/tasks/dashboard-summary');
    return response.data;
  },
  
  create: async (data: unknown): Promise<unknown> => {
    const response = await api.post('/api/tasks/', data);
    return response.data;
  },
  
  update: async (id: number, data: unknown): Promise<unknown> => {
    const response = await api.put(`/api/tasks/${id}`, data);
    return response.data;
  },
  
  startTask: async (id: number): Promise<unknown> => {
    const response = await api.post(`/api/tasks/${id}/start`);
    return response.data;
  },
  
  completeTask: async (id: number, data?: unknown): Promise<unknown> => {
    const response = await api.post(`/api/tasks/${id}/complete`, data);
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

export default api;
