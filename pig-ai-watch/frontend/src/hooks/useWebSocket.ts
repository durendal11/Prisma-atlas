import { useEffect, useRef, useCallback } from 'react';
import { useDetectionStore, useAlertStore, useSettingsStore } from '@/store';
import type { DetectionWebSocket } from '@/types';
import toast from 'react-hot-toast';
import { createElement } from 'react';

/* ── Rich alert popup for the upper-right corner ─────────────────── */
function AlertPopup({ data, severity, t: toastInstance }: { data: any; severity: string; t: any }) {
  const colors: Record<string, { border: string; bg: string; icon: string; text: string }> = {
    critical: { border: 'border-red-400', bg: 'bg-red-50 dark:bg-red-950/80', icon: '🚨', text: 'text-red-800 dark:text-red-200' },
    high:     { border: 'border-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/80', icon: '⚠️', text: 'text-orange-800 dark:text-orange-200' },
    medium:   { border: 'border-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/80', icon: '⚠️', text: 'text-yellow-800 dark:text-yellow-200' },
    low:      { border: 'border-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/80', icon: 'ℹ️', text: 'text-blue-800 dark:text-blue-200' },
  };
  const c = colors[severity] || colors.medium;

  return createElement('div', {
    className: `${toastInstance.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full ${c.bg} shadow-xl rounded-2xl border-l-4 ${c.border} pointer-events-auto flex items-start gap-3 p-4`,
    onClick: () => toast.dismiss(toastInstance.id),
  },
    createElement('span', { className: 'text-xl flex-shrink-0 mt-0.5' }, c.icon),
    createElement('div', { className: 'flex-1 min-w-0' },
      createElement('p', { className: `text-sm font-semibold ${c.text}` },
        severity === 'critical' ? 'Critical Alert' : severity === 'high' ? 'High Alert' : 'Alert'
      ),
      createElement('p', { className: `text-xs ${c.text} opacity-80 mt-0.5 line-clamp-2` },
        data.message || 'New alert received'
      ),
      data.pen_name && createElement('p', { className: 'text-[10px] opacity-60 mt-1 uppercase font-medium ' + c.text },
        `📍 ${data.pen_name}`
      ),
    ),
    createElement('button', {
      className: 'flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors',
      onClick: (e: any) => { e.stopPropagation(); toast.dismiss(toastInstance.id); },
    }, '✕')
  );
}

interface UseWebSocketOptions {
  penId?: string;
  onDetection?: (detection: DetectionWebSocket) => void;
  onAlert?: (alert: DetectionWebSocket) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { penId = 'all', onDetection, onAlert } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const connectingRef = useRef(false);
  const setDetection = useDetectionStore((state) => state.setDetection);
  const addAlert = useAlertStore((state) => state.addAlert);
  const { notifications, soundEnabled } = useSettingsStore();

  // Store callbacks and settings in refs so they don't trigger reconnection
  const onDetectionRef = useRef(onDetection);
  const onAlertRef = useRef(onAlert);
  const notificationsRef = useRef(notifications);
  const soundEnabledRef = useRef(soundEnabled);
  const setDetectionRef = useRef(setDetection);
  const addAlertRef = useRef(addAlert);

  // Keep refs up to date without causing reconnection
  useEffect(() => { onDetectionRef.current = onDetection; }, [onDetection]);
  useEffect(() => { onAlertRef.current = onAlert; }, [onAlert]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { setDetectionRef.current = setDetection; }, [setDetection]);
  useEffect(() => { addAlertRef.current = addAlert; }, [addAlert]);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (connectingRef.current || wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }
    connectingRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.DEV
      ? 'localhost:8000'
      : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws/detections`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      connectingRef.current = false;
      
      // Subscribe to specific pen if needed
      if (penId !== 'all') {
        wsRef.current?.send(JSON.stringify({ type: 'subscribe', pen_id: penId }));
      }
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data: DetectionWebSocket = JSON.parse(event.data);

        if (data.type === 'detection') {
          setDetectionRef.current(data.pen_id, data);
          onDetectionRef.current?.(data);
        } else if (data.type === 'alert') {
          // Show rich popup notification for alerts in upper-right corner
          if (notificationsRef.current) {
            const severity = data.data.severity || 'medium';

            toast.custom(
              (t) => createElement(AlertPopup, { data: data.data, severity, t }),
              { duration: severity === 'critical' ? 8000 : 5000 }
            );

            // Play sound for critical alerts
            if (soundEnabledRef.current && severity === 'critical') {
              const audio = new Audio('/alert-sound.mp3');
              audio.play().catch(() => {});
            }
          }

          onAlertRef.current?.(data);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s...');
      connectingRef.current = false;
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      connectingRef.current = false;
    };
  }, [penId]); // Only reconnect when penId changes

  const sendMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent auto-reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
    connectingRef.current = false;
  }, []);

  useEffect(() => {
    connect();

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      disconnect();
    };
  }, [penId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sendMessage, disconnect, reconnect: connect };
}

export default useWebSocket;
