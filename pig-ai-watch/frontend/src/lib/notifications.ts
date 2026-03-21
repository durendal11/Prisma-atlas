export type PushAlert = {
  pen_id: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'ROUTINE' | string;
  push_title: string;
  push_body: string;
  alert_type: string;
  timestamp?: string;
};

type NotificationPreferences = {
  quietStart: string;
  quietEnd: string;
  enabled: boolean;
};

const PREF_KEY = 'notificationPreferences';
const DEFAULT_PREFS: NotificationPreferences = {
  quietStart: '22:00',
  quietEnd: '06:00',
  enabled: true,
};

function parseMinutes(value: string): number | null {
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isWithinQuietHours(now: Date, prefs: NotificationPreferences): boolean {
  const start = parseMinutes(prefs.quietStart);
  const end = parseMinutes(prefs.quietEnd);
  if (start === null || end === null) return false;

  const current = now.getHours() * 60 + now.getMinutes();

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function getPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) {
      localStorage.setItem(PREF_KEY, JSON.stringify(DEFAULT_PREFS));
      return DEFAULT_PREFS;
    }
    const parsed = JSON.parse(raw);
    return {
      quietStart: typeof parsed?.quietStart === 'string' ? parsed.quietStart : DEFAULT_PREFS.quietStart,
      quietEnd: typeof parsed?.quietEnd === 'string' ? parsed.quietEnd : DEFAULT_PREFS.quietEnd,
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFS.enabled,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  return Notification.requestPermission();
}

export async function showNotification(alert: PushAlert): Promise<void> {
  const priority = String(alert.priority || 'ROUTINE').toUpperCase();
  if (priority === 'ROUTINE') {
    return;
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return;
  }

  const prefs = getPreferences();
  if (!prefs.enabled && priority !== 'CRITICAL') {
    return;
  }

  if (priority !== 'CRITICAL' && isWithinQuietHours(new Date(), prefs)) {
    return;
  }

  const notification = new Notification(alert.push_title, {
    body: alert.push_body,
    tag: alert.alert_type,
    icon: '/favicon.ico',
    silent: priority !== 'CRITICAL',
  });

  if (priority === 'CRITICAL') {
    const audio = new Audio('/alert-sound.mp3');
    audio.play().catch(() => {});
  }

  notification.onclick = () => {
    window.focus();
    window.dispatchEvent(
      new CustomEvent('push-alert-open-pen', {
        detail: { penId: alert.pen_id },
      }),
    );
  };
}
