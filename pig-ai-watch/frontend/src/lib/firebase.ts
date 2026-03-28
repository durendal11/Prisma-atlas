import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// TODO: Replace with your Firebase config from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDCazx89VdGajpbxp7PYwhjF8_Mc_tM5is",
  authDomain: "prisma-fcm.firebaseapp.com",
  projectId: "prisma-fcm",
  storageBucket: "prisma-fcm.firebasestorage.app",
  messagingSenderId: "717813926100",
  appId: "1:717813926100:web:41f441310dca3a75865341"
};

const app = initializeApp(firebaseConfig);

// Initialize messaging only if supported in browser
let messaging: any = null;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn("Firebase Messaging not supported in this environment");
}

export const requestFirebaseToken = async () => {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, { 
        // TODO: Replace with your VAPID key
        vapidKey: "BKxdsAC5D66Cq2z5JYF3VkpdRoSm8ism3bzqo1pT93UvddQLRWtjnbq4xkqAfYl1MKmr2CYZJ-fZGVGyYlTXhsM",
        serviceWorkerRegistration: swRegistration
      });
      return token;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
  }
  return null;
};

export const setupForegroundListener = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
};
