import { useEffect, useRef } from 'react';
import { usePowerSavingStore } from '@/store';

/**
 * Hook that monitors the device battery and auto-enables power saving
 * when battery drops below 20% (and not charging).
 *
 * Uses the Battery Status API (navigator.getBattery) where available.
 */
export function usePowerSaving() {
  const { isPowerSaving, setPowerSaving, batteryLevel, setBatteryLevel } =
    usePowerSavingStore();
  const manualOverride = useRef(false);

  useEffect(() => {
    let battery: any = null;

    function update() {
      if (!battery) return;
      setBatteryLevel(Math.round(battery.level * 100));

      // Auto-enable when battery < 20% and not charging (unless user manually toggled)
      if (!manualOverride.current) {
        const shouldSave = battery.level < 0.2 && !battery.charging;
        setPowerSaving(shouldSave);
      }
    }

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((b: any) => {
        battery = b;
        update();
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
      });
    }

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', update);
        battery.removeEventListener('chargingchange', update);
      }
    };
  }, [setBatteryLevel, setPowerSaving]);

  /** Allow the user to manually toggle power saving mode. */
  function toggle() {
    manualOverride.current = true;
    setPowerSaving(!isPowerSaving);
  }

  return { isPowerSaving, batteryLevel, toggle };
}
