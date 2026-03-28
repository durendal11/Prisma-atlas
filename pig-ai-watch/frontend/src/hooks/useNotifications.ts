import { useEffect } from 'react';
import { requestFirebaseToken, setupForegroundListener } from '../lib/firebase';
import { toast } from 'react-hot-toast'; // or whatever toast library you are using
import { useAuthStore } from '../store';
import api from '../api';

export const useNotifications = () => {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;

    // Get token and send to backend
    const initializeNotifications = async () => {
      try {
        const token = await requestFirebaseToken();
        if (token) {
          // Send to backend
          await api.post('/api/auth/fcm-token', { token });
          console.log('FCM token registered with backend');
        }
      } catch (err) {
        console.error('Failed to initialize notifications:', err);
      }
    };

    initializeNotifications();

    // Handle messages when app is open
    const unsubscribe = setupForegroundListener((payload) => {
      console.log("FOREGROUND PAYLOAD RECEIVED: ", payload);
      // Firebase sometimes nests things depending on format
      const title = payload?.notification?.title || payload?.data?.title || "New Alert";
      const body = payload?.notification?.body || payload?.data?.body || "";
      
      toast(`${title}\n${body}`, {
        icon: '🔔',
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);
};
