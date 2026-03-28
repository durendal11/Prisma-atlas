// Sow interface
export interface Sow {
  id: number;
  tag_id: string;
  name: string | null;
  breed: string | null;
  birth_date: string | null;
  weight: number | null;
  parity: number;
  status: 'active' | 'pregnant' | 'farrowing' | 'lactating' | 'weaned' | 'inactive' | 'overdue_watch';
  current_litter_size: number;
  last_breeding_date: string | null;
  expected_farrowing_date: string | null;
  last_farrowing_date: string | null;
  pen_id: number | null;
  notes: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  detection_logs_count?: number;
  last_detection_at?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SowCreate {
  tag_id: string;
  name?: string;
  breed?: string;
  birth_date?: string;
  weight?: number;
  parity?: number;
  status?: string;
  current_litter_size?: number;
  last_breeding_date?: string;
  expected_farrowing_date?: string;
  pen_id?: number;
  notes?: string;
}

export interface SowUpdate {
  name?: string;
  breed?: string;
  weight?: number;
  parity?: number;
  status?: string;
  current_litter_size?: number;
  last_breeding_date?: string;
  expected_farrowing_date?: string;
  pen_id?: number;
  notes?: string;
}

// Alert interface
export interface Alert {
  id: number;
  type: 'crushing_risk' | 'posture_change' | 'piglet_count_change' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string | null;
  sow_id: number | null;
  pen_id: number | null;
  is_read: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  detection_data: string | null;
  created_at: string;
}

export interface AlertCreate {
  type: string;
  severity: string;
  title: string;
  message?: string;
  sow_id?: number;
  pen_id?: number;
  detection_data?: string;
}

// Event interface
export interface Event {
  id: number;
  type: string;
  category: string | null;
  description: string | null;
  sow_id: number | null;
  pen_id: number | null;
  user_id: number | null;
  metadata: string | null;
  created_at: string;
}

export interface EventCreate {
  type: string;
  category?: string;
  description?: string;
  sow_id?: number;
  pen_id?: number;
  metadata?: string;
}

// Detection interface
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
}

export interface Detection {
  id: number;
  pen_id: number;
  piglet_count: number;
  sow_posture: string;
  crushing_risk: number;
  bounding_boxes: BoundingBox[];
  frame_timestamp: string | null;
  processing_time_ms: number | null;
  created_at: string;
}

export interface DetectionWebSocket {
  type: 'detection' | 'alert' | 'push_alert';
  pen_id: string | number;
  data?: {
    piglet_count: number;
    posture: string;
    risk_level: number;
    bboxes: BoundingBox[];
    timestamp: string;
    processing_time_ms?: number;
    alert_type?: string;
    severity?: string;
    message?: string;
  };
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'ROUTINE' | string;
  alert_type?: string;
  push_title?: string;
  push_body?: string;
  timestamp?: string;
}

// Pen interface
export interface Pen {
  id: number;
  name: string;
  location: string | null;
  camera_source: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PenStatus {
  pen_id: number;
  pen_name: string;
  sow_tag: string | null;
  piglet_count: number;
  sow_posture: string;
  crushing_risk: number;
  last_updated: string;
  is_streaming: boolean;
}

// Dashboard stats
export interface DashboardStats {
  total_sows: number;
  total_piglets: number;
  active_alerts: number;
  pens_monitored: number;
}

// User interface
export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

// API Response types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AlertStats {
  unread_count: number;
  unresolved_by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  total_unresolved: number;
}

// Farrowing interfaces
export interface FarrowingRecord {
  id: number;
  sow_id: number;
  pen_id: number | null;
  farrowing_started: string | null;
  farrowing_completed: string | null;
  total_born: number | null;
  born_alive: number | null;
  stillborn: number | null;
  mummified: number | null;
  crushed: number | null;
  sow_condition: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  piglets?: PigletRecord[];
}

export interface FarrowingRecordCreate {
  sow_id: number;
  pen_id?: number;
  farrowing_started?: string;
  total_born?: number;
  born_alive?: number;
  stillborn?: number;
  mummified?: number;
  notes?: string;
}

export interface PigletRecord {
  id: number;
  farrowing_record_id: number;
  piglet_number: number;
  sex: 'male' | 'female' | 'unknown' | null;
  birth_weight: number | null;
  current_weight: number | null;
  status: 'alive' | 'dead' | 'fostered_out' | 'fostered_in' | null;
  is_runt: boolean;
  notes: string | null;
  created_at: string;
}

export interface PigletRecordCreate {
  farrowing_record_id: number;
  piglet_number?: number;
  sex?: string;
  birth_weight?: number;
  status?: string;
  is_runt?: boolean;
  notes?: string;
}

export interface FarrowingStats {
  period_days: number;
  total_farrowings: number;
  avg_born_alive: number;
  avg_stillborn: number;
  stillborn_rate: number;
  avg_litter_size: number;
  total_piglets_born: number;
  total_alive: number;
  total_stillborn: number;
  interventions_required: number;
}

export interface PenDetail extends Pen {
  sow?: Sow | null;
  farrowing_records?: FarrowingRecord[];
  recent_alerts?: Alert[];
  recent_events?: Event[];
}
