import { useAuthStore } from '@/store';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Integrated landing route for redirects
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LANDING_URL = '/welcome';
const API_BASE_URL = isLocalDev ? 'http://localhost:8000' : '';

// Determine redirect target: in Electron or local dev without landing, use /welcome
const getLogoutTarget = (withFlag = false): string => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return '/welcome';
  }
  // Always use in-app landing page now.
  if (isLocalDev) {
    return LANDING_URL;
  }
  return withFlag ? `${LANDING_URL}?logout=true` : LANDING_URL;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, logout, setAuth } = useAuthStore();
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      // Check for token in URL first (from landing page redirect)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      
      console.log('ProtectedRoute: Checking auth...');
      console.log('Token from URL:', urlToken ? 'Yes' : 'No');
      console.log('Token from store:', token ? 'Yes' : 'No');
      console.log('Token from localStorage:', localStorage.getItem('access_token') ? 'Yes' : 'No');
      
      const storedToken = urlToken || token || localStorage.getItem('access_token');
      
      if (!storedToken) {
        console.log('No token found, redirecting to landing page');
        setIsValidating(false);
        setIsValid(false);
        return;
      }

      // If token came from URL, store it immediately
      if (urlToken) {
        console.log('Storing token from URL');
        localStorage.setItem('access_token', urlToken);
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      try {
        console.log('Validating token with API...');
        // Validate token by calling the /me endpoint directly with fetch
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${storedToken}`,
          },
        });
        
        if (response.ok) {
          const userData = await response.json();
          console.log('Token valid, user:', userData.username);
          // Update auth store with user data
          setAuth(userData, storedToken);
          setIsValid(true);
        } else {
          console.log('Token invalid, status:', response.status);
          // Token is invalid, clear it
          logout();
          localStorage.removeItem('access_token');
          setIsValid(false);
        }
      } catch (error: any) {
        console.error('Token validation error:', error);
        // If backend is unreachable (network error), keep session alive
        if (error?.message?.includes('Failed to fetch') || error?.name === 'TypeError') {
          console.warn('Backend unreachable — keeping session alive with stored token');
          if (storedToken) {
            setIsValid(true);
          } else {
            setIsValid(false);
          }
        } else {
          // Token is genuinely invalid, clear it
          logout();
          localStorage.removeItem('access_token');
          setIsValid(false);
        }
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, []);

  // Show loading while validating
  if (isValidating) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400">Validating session...</p>
        </div>
      </div>
    );
  }

  if (!isValid) {
    // Redirect to landing page instead of internal login
    window.location.href = getLogoutTarget(true);
    return null;
  }

  return <>{children}</>;
}
