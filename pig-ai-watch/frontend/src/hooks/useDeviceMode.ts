import { useState, useEffect, useCallback } from 'react';

export type DeviceModePreference = 'auto' | 'desktop' | 'mobile';

const STORAGE_KEY = 'pig_ai_device_mode_pref';

/**
 * Hook to detect and manage Desktop vs. Mobile device mode.
 * - Live streaming is strictly restricted to desktop mode to eliminate mobile lag and bandwidth consumption.
 * - Automatically transitions on viewport resize (< 1024px or mobile UA).
 * - Supports manual simulation override ('desktop' | 'mobile' | 'auto').
 */
export function useDeviceMode() {
  const [preference, setPreference] = useState<DeviceModePreference>('auto');

  // Check hardware & viewport
  const [actualIsDesktop, setActualIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const isWide = window.innerWidth >= 1024;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isWide && !isMobileUA;
  });

  useEffect(() => {
    // Clear any previous stale override on mount to ensure auto-responsive mode works
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved === 'desktop' || saved === 'mobile') {
        setPreference(saved as DeviceModePreference);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }

    const checkMode = () => {
      const isWide = window.innerWidth >= 1024;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isDesktopNow = isWide && !isMobileUA;
      setActualIsDesktop(isDesktopNow);
      
      // When viewport is resized across breakpoint, automatically switch preference to 'auto'
      // so responsive DevTools and device dimension changes always automatically transition!
      setPreference('auto');
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    };

    window.addEventListener('resize', checkMode);
    window.addEventListener('orientationchange', checkMode);

    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia('(min-width: 1024px)');
      mql.addEventListener('change', checkMode);
    } catch {
      // ignore
    }

    // Call checkMode on mount to ensure accurate initial detection
    const initialWide = window.innerWidth >= 1024;
    const initialMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setActualIsDesktop(initialWide && !initialMobileUA);

    return () => {
      window.removeEventListener('resize', checkMode);
      window.removeEventListener('orientationchange', checkMode);
      if (mql) {
        mql.removeEventListener('change', checkMode);
      }
    };
  }, []);

  const setSimulatedMode = useCallback((mode: DeviceModePreference) => {
    setPreference(mode);
    try {
      if (mode === 'auto') {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, mode);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleMode = useCallback(() => {
    setPreference((prev) => {
      const next = prev === 'mobile' ? 'desktop' : 'mobile';
      try {
        sessionStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Effective status: if preference is auto, use actualIsDesktop
  const isDesktop = preference === 'auto' ? actualIsDesktop : preference === 'desktop';
  const isMobile = !isDesktop;
  const isStreamingAllowed = isDesktop;

  return {
    isDesktop,
    isMobile,
    isStreamingAllowed,
    preference,
    actualIsDesktop,
    setSimulatedMode,
    toggleMode,
  };
}
