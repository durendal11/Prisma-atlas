import { Link } from 'react-router-dom';
import { useState } from 'react';
import { PageInfoButton, PageInfoModal } from '@/components/ui/PageInfoModal';
import { useSettingsStore, useAuthStore } from '@/store';import { requestFirebaseToken } from '../lib/firebase';
import api from '../api';import { useTranslation } from '@/hooks/useTranslation';
import { 
  Bell, 
  Volume2, 
  Moon,
  Sun,
  Gauge,
  User,
  Shield,
  Save,
  Activity,
  ChevronRight,
  Database,
  Languages
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const { t } = useTranslation();
  const { 
    theme, 
    language,
    notifications, 
    soundEnabled, 
    crushingRiskThreshold,
    watchThreshold,
    actionThreshold,
    setTheme,
    setLanguage,
    setNotifications,
    setSoundEnabled,
    setCrushingRiskThreshold,
    setWatchThreshold,
    setActionThreshold
  } = useSettingsStore();

  const { user } = useAuthStore();

  const handleSave = () => {
    toast.success('Settings saved successfully');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-in-left">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <PageInfoButton onClick={() => setIsInfoOpen(true)} />
        </div>
        <p className="text-gray-500 dark:text-slate-400">Manage your application preferences</p>
      </div>

      {/* User Profile */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User Profile</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Username</label>
            <p className="font-medium text-gray-900 dark:text-white">{user?.username}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Email</label>
            <p className="font-medium text-gray-900 dark:text-white">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Full Name</label>
            <p className="font-medium text-gray-900 dark:text-white">{user?.full_name || '-'}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-1">Role</label>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary-500 dark:text-primary-400" />
              <p className="font-medium text-gray-900 dark:text-white capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors duration-200">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Push Notifications</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">Receive alerts for critical events (requires OS permission)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  setNotifications(enabled);
                  
                  if (enabled) {
                    toast.loading('Requesting permissions...', { id: 'push-req' });
                    try {
                      // Attempt to grab token explicitly triggered by the user
                      const token = await requestFirebaseToken();
                      if (token) {
                        await api.post('/api/auth/fcm-token', { token });
                        toast.success('Push enabled! Ensure macOS System Settings allows notifications.', { id: 'push-req' });
                        
                        // Fire a small local test so they know it works
                        if (Notification.permission === 'granted') {
                           new Notification("Test Local Notif", { body: "Your browser can show notifications!" });
                        }
                      } else {
                         toast.error('Permission blocked by browser.', { id: 'push-req' });
                         setNotifications(false);
                      }
                    } catch (err) {
                      toast.error('Failed to enable push setup', { id: 'push-req' });
                      setNotifications(false);
                    }
                  } else {
                     toast.success('Push disabled visually (token still exists)', { id: 'push-req' });
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-slate-600 peer-focus:ring-4 peer-focus:ring-primary-100 dark:peer-focus:ring-primary-900/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 dark:peer-checked:bg-primary-600" />
            </label>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors duration-200">
            <div>
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                <p className="font-medium text-gray-900 dark:text-white">Sound Alerts</p>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Play sound for critical alerts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-slate-600 peer-focus:ring-4 peer-focus:ring-primary-100 dark:peer-focus:ring-primary-900/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 dark:peer-checked:bg-primary-600" />
            </label>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          <Languages className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('language')}</h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              language === 'en'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-md'
                : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">🇺🇸</span>
              <span className="font-medium">{t('english')}</span>
            </div>
          </button>
          <button
            onClick={() => setLanguage('fil')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              language === 'fil'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-md'
                : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">🇵🇭</span>
              <span className="font-medium">{t('filipino')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          {theme === 'dark' ? (
            <Moon className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          ) : (
            <Sun className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          )}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('theme')}</h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              theme === 'light'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-md'
                : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Sun className="h-5 w-5" />
              <span className="font-medium">{t('light')}</span>
            </div>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              theme === 'dark'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-md'
                : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Moon className="h-5 w-5" />
              <span className="font-medium">{t('dark')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Alert Thresholds */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          <Gauge className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alert Thresholds</h2>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-gray-900 dark:text-white">Crushing Risk Threshold</p>
            <span className="text-sm font-medium text-primary-600 dark:text-primary-400 px-2 py-1 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
              {Math.round(crushingRiskThreshold * 100)}%
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
            Alerts will be triggered when risk exceeds this level
          </p>
          <input
            type="range"
            min="0.3"
            max="0.9"
            step="0.1"
            value={crushingRiskThreshold}
            onChange={(e) => setCrushingRiskThreshold(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
          <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-1">
            <span>30%</span>
            <span>60%</span>
            <span>90%</span>
          </div>
        </div>
      </div>

      {/* Data & Analytics */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          <Database className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Data & Analytics</h2>
        </div>

        <div className="space-y-3">
          <Link 
            to="/behavior-logs"
            className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/30 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-dark-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/50 rounded-lg">
                <Activity className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Behavior Logs</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">View 12-second interval detection logs</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400 dark:text-slate-500" />
          </Link>
        </div>
      </div>

      {/* Farrowing Thresholds */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="h-5 w-5 text-gray-500 dark:text-slate-400 group-hover:scale-110 transition-transform duration-200" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Farrowing Thresholds</h2>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-gray-900 dark:text-white">Watch Threshold (Days Overdue)</p>
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400 px-2 py-1 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
              +{watchThreshold} days
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
            Trigger Tier 1 watch alerts when sow is this many days past her expected date
          </p>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            value={watchThreshold}
            onChange={(e) => setWatchThreshold(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-1">
            <span>0</span>
            <span>1</span>
            <span>2</span>
            <span>3</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-gray-900 dark:text-white">Action Threshold (Days Overdue)</p>
            <span className="text-sm font-medium text-red-600 dark:text-red-400 px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded-lg">
              +{actionThreshold} days
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
            Trigger Tier 2 action alerts (induction eligibility)
          </p>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={actionThreshold}
            onChange={(e) => setActionThreshold(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-red-500"
          />
          <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-1">
            <span>1</span>
            <span>3</span>
            <span>5</span>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-500 text-white rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
        >
          <Save className="h-4 w-4" />
          Save Settings
        </button>
      </div>

      <PageInfoModal 
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        title="Settings Guide"
        section="settings"
        steps={[
          "User Preferences: Control app-wide UI parameters (Language, Theme Mode).",
          "Notification Filters: Manually override when sound/visual alerts execute on specific severity tiers.",
          "Threshold Definitions: Customize minimum thresholds for Farrowing engine outputs based on specific operational guidelines."
        ]}
      />
    </div>
  );
}
