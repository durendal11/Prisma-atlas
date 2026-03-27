import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

// Replace YOUR_GOOGLE_CLIENT_ID with actual ID later via env vars if preferred
// But typically, public client IDs are fine to inject directly in dev
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1028308480397-2l0607m9p3e7etf0p8nks5g51v6ls7ol.apps.googleusercontent.com"; // User usually provides this

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
