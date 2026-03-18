import { useState, useEffect, useCallback } from 'react';
import { 
  Camera, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Wifi, 
  WifiOff,
  Link2, 
  Shield, 
  Globe, 
  CircleDot, 
  AlertCircle,
  Info,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Save,
  Video,
  Unplug,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { pensApi, streamApi } from '@/api';
import type { Pen } from '@/types';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CameraBrand {
  name: string;
  logo: string;
  supportsRTSP: boolean;
  rtspTemplate: string;
  defaultPort: number;
  notes: string;
}

interface CameraConfig {
  id: string;
  penId: number | null;
  penName: string;
  brand: string;
  customBrand: string;
  supportsRTSP: boolean;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  rtspPath: string;
  rtspUrl: string;
  connectionStatus: 'untested' | 'testing' | 'connected' | 'failed';
  isStaticIP: boolean;
  subnetMask: string;
  gateway: string;
  notes: string;
}

// ─── Camera Brand Database ────────────────────────────────────────────────────

const CAMERA_BRANDS: CameraBrand[] = [
  {
    name: 'Hikvision',
    logo: '🔵',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/Streaming/Channels/101',
    defaultPort: 554,
    notes: 'Most models support RTSP. Use channel 101 for main stream, 102 for sub stream.',
  },
  {
    name: 'Dahua',
    logo: '🔴',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/cam/realmonitor?channel=1&subtype=0',
    defaultPort: 554,
    notes: 'subtype=0 for main stream, subtype=1 for sub stream.',
  },
  {
    name: 'Reolink',
    logo: '🟢',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/h264Preview_01_main',
    defaultPort: 554,
    notes: 'Use h264Preview_01_sub for sub stream. Ensure RTSP is enabled in camera settings.',
  },
  {
    name: 'TP-Link (Tapo)',
    logo: '🟡',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/stream1',
    defaultPort: 554,
    notes: 'stream1 for HD, stream2 for SD. Set camera account in Tapo app first.',
  },
  {
    name: 'Amcrest',
    logo: '🟠',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/cam/realmonitor?channel=1&subtype=0',
    defaultPort: 554,
    notes: 'Similar RTSP format to Dahua. Supports ONVIF as well.',
  },
  {
    name: 'Axis',
    logo: '⚪',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/axis-media/media.amp',
    defaultPort: 554,
    notes: 'Professional-grade. Supports multiple stream profiles.',
  },
  {
    name: 'Wyze',
    logo: '🔵',
    supportsRTSP: false,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/live',
    defaultPort: 554,
    notes: '⚠️ Requires custom firmware (wyze-bridge or docker-wyze-bridge) for RTSP support.',
  },
  {
    name: 'Ring',
    logo: '🔵',
    supportsRTSP: false,
    rtspTemplate: '',
    defaultPort: 0,
    notes: '❌ Does not natively support RTSP. Cloud-only streaming.',
  },
  {
    name: 'Generic ONVIF',
    logo: '📷',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/onvif1',
    defaultPort: 554,
    notes: 'Generic ONVIF-compatible camera. RTSP path may vary — check manufacturer docs.',
  },
  {
    name: 'Other / Custom',
    logo: '🎥',
    supportsRTSP: true,
    rtspTemplate: 'rtsp://{username}:{password}@{ip}:{port}/',
    defaultPort: 554,
    notes: 'Enter the RTSP URL manually for unsupported brands.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function buildRtspUrl(config: CameraConfig): string {
  const brand = CAMERA_BRANDS.find(b => b.name === config.brand);
  if (!brand || !brand.rtspTemplate) return config.rtspUrl;

  return brand.rtspTemplate
    .replace('{username}', config.username || 'admin')
    .replace('{password}', config.password || 'password')
    .replace('{ip}', config.ipAddress || '192.168.1.100')
    .replace('{port}', String(config.port || 554));
}

function createEmptyConfig(pen?: Pen): CameraConfig {
  return {
    id: generateId(),
    penId: pen?.id ?? null,
    penName: pen?.name ?? '',
    brand: '',
    customBrand: '',
    supportsRTSP: false,
    ipAddress: '',
    port: 554,
    username: 'admin',
    password: '',
    rtspPath: '',
    rtspUrl: '',
    connectionStatus: 'untested',
    isStaticIP: true,
    subnetMask: '255.255.255.0',
    gateway: '192.168.1.1',
    notes: '',
  };
}

// ─── Step Components ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: 'Select Brand', icon: Camera, description: 'Choose your camera brand' },
  { id: 2, title: 'RTSP Availability', icon: Wifi, description: 'Check RTSP protocol support' },
  { id: 3, title: 'Camera Account', icon: Shield, description: 'Set up camera credentials' },
  { id: 4, title: 'Network Setup', icon: Globe, description: 'Configure static IP' },
  { id: 5, title: 'Connect to Pen', icon: Link2, description: 'Link camera to pen' },
  { id: 6, title: 'Test & Save', icon: CheckCircle2, description: 'Verify and save configuration' },
];

// ─── Global Cache ──────────────────────────────────────────────────────────────
// This prevents re-testing camera streams every time the user swaps pages.
const cameraStatusCache: Record<number, 'checking' | 'online' | 'offline'> = {};

// ─── Main Component ──────────────────────────────────────────────────────────

type PageView = 'overview' | 'wizard';

export default function CameraSetupPage() {
  const [view, setView] = useState<PageView>('overview');
  const [currentStep, setCurrentStep] = useState(1);
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [activeCameraIdx, setActiveCameraIdx] = useState(0);
  const [pens, setPens] = useState<Pen[]>([]);
  const [loadingPens, setLoadingPens] = useState(true);
  const [savingCamera, setSavingCamera] = useState(false);
  const [disconnectingPen, setDisconnectingPen] = useState<number | null>(null);
  const [showUrlFor, setShowUrlFor] = useState<number | null>(null);
  const [cameraStatuses, setCameraStatuses] = useState<Record<number, 'checking' | 'online' | 'offline'>>(cameraStatusCache);

  const connectedPens = pens.filter(p => p.camera_source);
  const unconnectedPens = pens.filter(p => !p.camera_source);

  // Function to check if a specific camera URL is reachable
  const checkCameraStatus = async (penId: number, url: string) => {
    cameraStatusCache[penId] = 'checking';
    setCameraStatuses(prev => ({ ...prev, [penId]: 'checking' }));
    try {
      // Use the generic test-camera backend endpoint
      const result = await pensApi.testCamera(url);
      const status = result.success ? 'online' : 'offline';
      cameraStatusCache[penId] = status;
      setCameraStatuses(prev => ({ 
        ...prev, 
        [penId]: status 
      }));
    } catch {
      cameraStatusCache[penId] = 'offline';
      setCameraStatuses(prev => ({ ...prev, [penId]: 'offline' }));
    }
  };

  // Automatically check the status of all connected pens
  useEffect(() => {
    if (view === 'overview' && connectedPens.length > 0) {
      connectedPens.forEach(pen => {
        if (pen.camera_source && !cameraStatuses[pen.id]) {
          void checkCameraStatus(pen.id, pen.camera_source);
        }
      });
    }
  }, [connectedPens, view, cameraStatuses]);

  // Fetch available pens
  const fetchPens = useCallback(async () => {
    try {
      setLoadingPens(true);
      const data = await pensApi.getAll(true);
      setPens(data);
    } catch {
      toast.error('Failed to load pens');
    } finally {
      setLoadingPens(false);
    }
  }, []);

  useEffect(() => {
    fetchPens();
  }, [fetchPens]);

  // Initialize with one camera config
  useEffect(() => {
    if (cameras.length === 0) {
      setCameras([createEmptyConfig()]);
    }
  }, [cameras.length]);

  const activeCamera = cameras[activeCameraIdx] || createEmptyConfig();

  const updateCamera = (updates: Partial<CameraConfig>) => {
    setCameras(prev => {
      const copy = [...prev];
      copy[activeCameraIdx] = { ...copy[activeCameraIdx], ...updates };
      return copy;
    });
  };

  const addCamera = () => {
    setCameras(prev => [...prev, createEmptyConfig()]);
    setActiveCameraIdx(cameras.length);
    setCurrentStep(1);
    setView('wizard');
  };

  const removeCamera = (idx: number) => {
    if (cameras.length <= 1) return;
    setCameras(prev => prev.filter((_, i) => i !== idx));
    if (activeCameraIdx >= cameras.length - 1) {
      setActiveCameraIdx(Math.max(0, cameras.length - 2));
    }
  };

  const switchCamera = (idx: number) => {
    setActiveCameraIdx(idx);
    setCurrentStep(1);
  };

  const nextStep = () => setCurrentStep(s => Math.min(s + 1, STEPS.length));
  const prevStep = () => setCurrentStep(s => Math.max(s - 1, 1));

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1: return activeCamera.brand !== '';
      case 2: return activeCamera.supportsRTSP;
      case 3: return activeCamera.username !== '' && activeCamera.password !== '';
      case 4: return activeCamera.ipAddress !== '';
      case 5: return activeCamera.penId !== null;
      case 6: return true;
      default: return false;
    }
  };

  const handleTestConnection = async () => {
    updateCamera({ connectionStatus: 'testing' });
    const rtspUrl = buildRtspUrl(activeCamera);
    updateCamera({ rtspUrl: rtspUrl });

    if (!activeCamera.ipAddress || !activeCamera.username || !activeCamera.password) {
      updateCamera({ connectionStatus: 'failed' });
      toast.error('Please fill in IP address, username, and password first.');
      return;
    }

    try {
      toast.loading('Step 1/3: Checking if camera is on the network...', { id: 'cam-test' });
      
      // Call backend to do real ping + TCP + RTSP test
      const result = await pensApi.testCamera(rtspUrl);
      
      if (result.success) {
        updateCamera({ connectionStatus: 'connected' });
        const details = result.details;
        const resolution = details ? `${details.width}x${details.height}` : '';
        toast.success(
          `Camera connected! ${resolution ? `Resolution: ${resolution}` : ''}`,
          { id: 'cam-test' }
        );
      } else {
        updateCamera({ connectionStatus: 'failed' });
        // Show specific error based on which step failed
        const step = result.details?.step;
        if (step === 'network_check') {
          toast.error(
            `Camera at ${activeCamera.ipAddress} is offline — check power and WiFi connection.`,
            { id: 'cam-test', duration: 6000 }
          );
        } else if (step === 'port_check') {
          toast.error(
            `Camera is online but RTSP port ${activeCamera.port} is not responding. Camera may be rebooting.`,
            { id: 'cam-test', duration: 6000 }
          );
        } else {
          toast.error(result.message, { id: 'cam-test', duration: 6000 });
        }
      }
    } catch (error: any) {
      updateCamera({ connectionStatus: 'failed' });
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        toast.error('Connection test timed out. Camera may be slow to respond — try again.',
          { id: 'cam-test', duration: 6000 });
      } else {
        const errorMsg = error.response?.data?.message || error.message || 'Connection failed';
        toast.error(errorMsg, { id: 'cam-test' });
      }
    }
  };

  const handleSaveCamera = async () => {
    setSavingCamera(true);
    try {
      const rtspUrl = buildRtspUrl(activeCamera);
      if (activeCamera.penId) {
        // Update existing pen's camera_source via PUT
        await pensApi.update(activeCamera.penId, {
          camera_source: rtspUrl,
        });
        // Restart the stream so backend picks up the new URL
        try {
          await streamApi.restartStream(String(activeCamera.penId));
        } catch {
          // Stream restart is best-effort; camera saved regardless
        }
      }
      updateCamera({ rtspUrl, connectionStatus: 'connected' });
      toast.success(`Camera saved for ${activeCamera.penName || 'pen'}! Stream is now active.`);
      // Refresh pen list and go back to overview
      await fetchPens();
      setView('overview');
    } catch {
      toast.error('Failed to save camera configuration');
    } finally {
      setSavingCamera(false);
    }
  };

  // ─── Disconnect / Delete Camera ──────────────────────────────────────────

  const handleDisconnectCamera = async (pen: Pen) => {
    setDisconnectingPen(pen.id);
    try {
      // Stop the running stream
      try {
        await streamApi.stopStream(String(pen.id));
      } catch {
        // Might not be running, that's ok
      }
      // Clear camera_source in DB
      const updated = await pensApi.update(pen.id, { camera_source: null });
      
      // Verify the update actually cleared the camera
      if (updated.camera_source) {
        console.error('Disconnect failed: camera_source still set after update', updated);
        toast.error('Disconnect failed — camera source was not cleared. Try again.');
        return;
      }
      
      toast.success(`Camera disconnected from ${pen.name}`);
      await fetchPens();
    } catch (error: any) {
      console.error('Disconnect error:', error);
      const msg = error.response?.data?.detail || error.message || 'Unknown error';
      toast.error(`Failed to disconnect camera: ${msg}`);
    } finally {
      setDisconnectingPen(null);
    }
  };

  const handleRestartStream = async (penId: number) => {
    const toastId = toast.loading('Restarting stream...');
    try {
      const result = await streamApi.restartStream(String(penId));
      if (result.is_running) {
        toast.success('Stream restarted successfully', { id: toastId });
      } else {
        toast.error('Stream could not start — check camera connection', { id: toastId });
      }
    } catch {
      toast.error('Failed to restart stream', { id: toastId });
    }
  };

  // Parse RTSP URL to extract info for display
  const parseRtspUrl = (url: string) => {
    try {
      // rtsp://user:pass@ip:port/path
      const match = url.match(/rtsp:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?(\/.*)?/);
      if (match) {
        return {
          username: match[1],
          ip: match[3],
          port: match[4] || '554',
          path: match[5] || '/',
        };
      }
    } catch { /* ignore */ }
    return null;
  };

  // ─── Step 1: Brand Selection ──────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Select Camera Brand
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Choose the brand of IP camera you'll be installing in the pen. This determines the RTSP URL format.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CAMERA_BRANDS.map((brand) => (
          <button
            key={brand.name}
            onClick={() => {
              updateCamera({
                brand: brand.name,
                supportsRTSP: brand.supportsRTSP,
                port: brand.defaultPort,
              });
            }}
            className={clsx(
              'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 hover:-translate-y-0.5',
              activeCamera.brand === brand.name
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 shadow-md shadow-primary-500/20'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-gray-300 dark:hover:border-slate-600'
            )}
          >
            <span className="text-3xl">{brand.logo}</span>
            <span className={clsx(
              'text-sm font-medium text-center leading-tight',
              activeCamera.brand === brand.name
                ? 'text-primary-700 dark:text-primary-300'
                : 'text-gray-700 dark:text-slate-300'
            )}>
              {brand.name}
            </span>
            {activeCamera.brand === brand.name && (
              <div className="absolute top-2 right-2">
                <Check className="h-4 w-4 text-primary-500" />
              </div>
            )}
            {!brand.supportsRTSP && (
              <span className="text-xs text-red-500 dark:text-red-400 font-medium">No RTSP</span>
            )}
          </button>
        ))}
      </div>

      {activeCamera.brand === 'Other / Custom' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Custom Brand Name
          </label>
          <input
            type="text"
            value={activeCamera.customBrand}
            onChange={e => updateCamera({ customBrand: e.target.value })}
            placeholder="Enter camera brand name..."
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
          />
        </div>
      )}
    </div>
  );

  // ─── Step 2: RTSP Availability ────────────────────────────────────────────

  const renderStep2 = () => {
    const brand = CAMERA_BRANDS.find(b => b.name === activeCamera.brand);

    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            RTSP Protocol Availability
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            RTSP (Real Time Streaming Protocol) is required for live video monitoring. Here's the status for your selected camera.
          </p>
        </div>

        {/* RTSP Status Card */}
        <div className={clsx(
          'p-6 rounded-xl border-2 transition-all duration-300',
          brand?.supportsRTSP
            ? 'border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20'
            : 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20'
        )}>
          <div className="flex items-start gap-4">
            {brand?.supportsRTSP ? (
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/40">
                <Wifi className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            ) : (
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/40">
                <WifiOff className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            )}
            <div className="flex-1">
              <h4 className={clsx(
                'text-lg font-semibold',
                brand?.supportsRTSP
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              )}>
                {brand?.supportsRTSP ? 'RTSP Supported ✓' : 'RTSP Not Supported'}
              </h4>
              <p className="text-sm mt-1 text-gray-600 dark:text-slate-400">
                {brand?.notes}
              </p>
            </div>
          </div>
        </div>

        {/* RTSP URL Template */}
        {brand?.supportsRTSP && brand.rtspTemplate && (
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="h-4 w-4 text-primary-500" />
              <h4 className="font-medium text-gray-900 dark:text-white">RTSP URL Format</h4>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-3 bg-gray-100 dark:bg-slate-900/50 rounded-lg text-sm text-gray-800 dark:text-slate-300 font-mono break-all">
                {brand.rtspTemplate}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(brand.rtspTemplate);
                  toast.success('Copied to clipboard');
                }}
                title="Copy RTSP template"
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <Copy className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50">
          <Info className="h-5 w-5 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">What is RTSP?</p>
            <p className="text-blue-700 dark:text-blue-400">
              RTSP (Real Time Streaming Protocol) allows PrismaAtlas to receive live video feeds 
              from IP cameras over your local network. The camera must support RTSP and be accessible 
              on your LAN for monitoring to work.
            </p>
          </div>
        </div>

        {!brand?.supportsRTSP && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
            <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium mb-1">Camera Not Compatible</p>
              <p className="text-amber-700 dark:text-amber-400">
                This camera brand doesn't natively support RTSP. Consider using a different brand 
                (Hikvision, Dahua, Reolink recommended) or check if custom firmware is available.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Step 3: Camera Account Setup ─────────────────────────────────────────

  const renderStep3 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Camera Account Setup
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Create or enter the login credentials for your camera. These are required for RTSP access.
        </p>
      </div>

      {/* Setup Instructions */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-primary-500" />
          <h4 className="font-medium text-gray-900 dark:text-white">Before continuing</h4>
        </div>
        <ol className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-bold">1</span>
            <span>Connect your camera to the same network as this system (via Ethernet or Wi-Fi).</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-bold">2</span>
            <span>Open the camera's web interface or mobile app and create a dedicated account for RTSP streaming.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-bold">3</span>
            <span>Enable RTSP in the camera's network/streaming settings (if not enabled by default).</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-bold">4</span>
            <span>Enter the credentials you created below.</span>
          </li>
        </ol>
      </div>

      {/* Credentials Form */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-primary-500" />
          <h4 className="font-medium text-gray-900 dark:text-white">Camera Credentials</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={activeCamera.username}
              onChange={e => updateCamera({ username: e.target.value })}
              placeholder="admin"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={activeCamera.password}
              onChange={e => updateCamera({ password: e.target.value })}
              placeholder="Enter camera password"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Use a strong, unique password. Avoid using the default credentials. This account will be used exclusively by PrismaAtlas for video streaming.
          </p>
        </div>
      </div>
    </div>
  );

  // ─── Step 4: Network / Static IP Setup ────────────────────────────────────

  const renderStep4 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Network & Static IP Configuration
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Assign a static IP address to ensure the camera remains reachable on your network.
        </p>
      </div>

      {/* Static IP Toggle */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary-500" />
            <h4 className="font-medium text-gray-900 dark:text-white">IP Configuration</h4>
          </div>
          <div className="flex items-center gap-3">
            <span className={clsx('text-sm', !activeCamera.isStaticIP ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-500 dark:text-slate-400')}>DHCP</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={activeCamera.isStaticIP}
                onChange={e => updateCamera({ isStaticIP: e.target.checked })}
                className="sr-only peer"
                title="Toggle static IP"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-slate-600 peer-focus:ring-4 peer-focus:ring-primary-100 dark:peer-focus:ring-primary-900/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 dark:peer-checked:bg-primary-600" />
            </label>
            <span className={clsx('text-sm', activeCamera.isStaticIP ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-500 dark:text-slate-400')}>Static</span>
          </div>
        </div>

        {/* Setup Instruction Box */}
        <div className="flex items-start gap-3 p-4 mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/50">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-400">
            <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">How to set a static IP on your camera:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open the camera's web interface (usually http://camera-ip).</li>
              <li>Navigate to <strong>Network Settings</strong> → <strong>TCP/IP</strong>.</li>
              <li>Change from DHCP to <strong>Static</strong> / <strong>Manual</strong>.</li>
              <li>Enter the IP address, subnet mask, and gateway below.</li>
              <li>Save and reboot the camera.</li>
            </ol>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Camera IP Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={activeCamera.ipAddress}
              onChange={e => updateCamera({ ipAddress: e.target.value })}
              placeholder="192.168.1.100"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              RTSP Port
            </label>
            <input
              type="number"
              value={activeCamera.port}
              onChange={e => updateCamera({ port: parseInt(e.target.value) || 554 })}
              placeholder="554"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 font-mono"
            />
          </div>
          {activeCamera.isStaticIP && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Subnet Mask
                </label>
                <input
                  type="text"
                  value={activeCamera.subnetMask}
                  onChange={e => updateCamera({ subnetMask: e.target.value })}
                  placeholder="255.255.255.0"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Default Gateway
                </label>
                <input
                  type="text"
                  value={activeCamera.gateway}
                  onChange={e => updateCamera({ gateway: e.target.value })}
                  placeholder="192.168.1.1"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 font-mono"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* RTSP URL Preview */}
      {activeCamera.ipAddress && (
        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-4 w-4 text-primary-500" />
            <h4 className="font-medium text-gray-900 dark:text-white">Generated RTSP URL</h4>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-3 bg-gray-100 dark:bg-slate-900/50 rounded-lg text-sm text-gray-800 dark:text-slate-300 font-mono break-all">
              {buildRtspUrl(activeCamera)}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(buildRtspUrl(activeCamera));
                toast.success('RTSP URL copied!');
              }}
              title="Copy RTSP URL"
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Copy className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Step 5: Connect to Pen ───────────────────────────────────────────────

  const renderStep5 = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Assign Camera to Pen
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Select which pen this camera will monitor. Each pen should have one dedicated camera.
        </p>
      </div>

      {loadingPens ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
        </div>
      ) : pens.length === 0 ? (
        <div className="text-center py-12">
          <Camera className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400">No pens available. Create pens first in the Settings page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pens.map((pen) => {
            const isAssigned = cameras.some(c => c.penId === pen.id && c.id !== activeCamera.id);
            return (
              <button
                key={pen.id}
                disabled={isAssigned}
                onClick={() => updateCamera({ penId: pen.id, penName: pen.name })}
                className={clsx(
                  'relative flex flex-col p-4 rounded-xl border-2 transition-all duration-200 text-left',
                  isAssigned
                    ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/30 opacity-50 cursor-not-allowed'
                    : activeCamera.penId === pen.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 shadow-md shadow-primary-500/20'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-gray-300 dark:hover:border-slate-600 hover:-translate-y-0.5'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CircleDot className={clsx(
                    'h-4 w-4',
                    pen.is_active ? 'text-green-500' : 'text-gray-400 dark:text-slate-500'
                  )} />
                  <span className="font-semibold text-gray-900 dark:text-white">{pen.name}</span>
                </div>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {pen.location || 'No location set'}
                </span>
                {pen.camera_source && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <Video className="h-3 w-3" /> Has existing camera
                  </span>
                )}
                {isAssigned && (
                  <span className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Already assigned to another camera
                  </span>
                )}
                {activeCamera.penId === pen.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary-500" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Notes (Optional)
        </label>
        <textarea
          value={activeCamera.notes}
          onChange={e => updateCamera({ notes: e.target.value })}
          placeholder="Any additional notes about this camera installation..."
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 resize-none"
        />
      </div>
    </div>
  );

  // ─── Step 6: Test & Save ──────────────────────────────────────────────────

  const renderStep6 = () => {
    const rtspUrl = buildRtspUrl(activeCamera);

    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Review & Test Connection
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Review your camera configuration and test connectivity before saving.
          </p>
        </div>

        {/* Summary Card */}
        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5 space-y-4">
          <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary-500" />
            Configuration Summary
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-slate-400">Brand</span>
              <p className="font-medium text-gray-900 dark:text-white">{activeCamera.brand || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400">Assigned Pen</span>
              <p className="font-medium text-gray-900 dark:text-white">{activeCamera.penName || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400">IP Address</span>
              <p className="font-medium text-gray-900 dark:text-white font-mono">{activeCamera.ipAddress}:{activeCamera.port}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400">Username</span>
              <p className="font-medium text-gray-900 dark:text-white">{activeCamera.username}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400">IP Mode</span>
              <p className="font-medium text-gray-900 dark:text-white">{activeCamera.isStaticIP ? 'Static' : 'DHCP'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-slate-400">
                {activeCamera.isStaticIP ? 'Subnet / Gateway' : 'Network'}
              </span>
              <p className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {activeCamera.isStaticIP ? `${activeCamera.subnetMask} / ${activeCamera.gateway}` : 'Auto'}
              </p>
            </div>
          </div>

          <div>
            <span className="text-sm text-gray-500 dark:text-slate-400">RTSP URL</span>
            <code className="block mt-1 px-4 py-3 bg-gray-100 dark:bg-slate-900/50 rounded-lg text-sm text-gray-800 dark:text-slate-300 font-mono break-all">
              {rtspUrl}
            </code>
          </div>
        </div>

        {/* Connection Test */}
        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Wifi className="h-4 w-4 text-primary-500" />
              Connection Test
            </h4>
            <div className="flex items-center gap-2">
              {activeCamera.connectionStatus === 'connected' && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Connected
                </span>
              )}
              {activeCamera.connectionStatus === 'failed' && (
                <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
                  <XCircle className="h-4 w-4" /> Failed
                </span>
              )}
              {activeCamera.connectionStatus === 'testing' && (
                <span className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" /> Testing...
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={activeCamera.connectionStatus === 'testing'}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all duration-200',
              activeCamera.connectionStatus === 'testing'
                ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:-translate-y-0.5'
            )}
          >
            {activeCamera.connectionStatus === 'testing' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Testing Connection...</>
            ) : (
              <><Play className="h-4 w-4" /> Test Connection</>
            )}
          </button>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveCamera}
          disabled={savingCamera}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-semibold text-lg transition-all duration-200',
            savingCamera
              ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-xl shadow-primary-500/30 hover:-translate-y-0.5'
          )}
        >
          {savingCamera ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Saving...</>
          ) : (
            <><Save className="h-5 w-5" /> Save Camera Configuration</>
          )}
        </button>
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      default: return null;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  // ─── Connected Cameras Overview ──────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Connected Cameras */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Connected Cameras ({connectedPens.length})
            </h2>
          </div>
        </div>

        {connectedPens.length === 0 ? (
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 p-8 text-center">
            <Camera className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 mb-1">No cameras connected yet</p>
            <p className="text-sm text-gray-400 dark:text-slate-500">Click "Add New Camera" to set up your first camera</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {connectedPens.map((pen) => {
              const parsed = pen.camera_source ? parseRtspUrl(pen.camera_source) : null;
              const isDisconnecting = disconnectingPen === pen.id;

              return (
                <div
                  key={pen.id}
                  className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-5 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-green-100 dark:bg-green-900/40">
                        <Video className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{pen.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{pen.location || 'No location'}</p>
                      </div>
                    </div>
                    {/* Dynamic Status Badge */}
                    {(() => {
                      const status = cameraStatuses[pen.id];
                      if (status === 'checking') {
                        return (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                            <span className="w-2 h-2 border-[1.5px] border-amber-600 dark:border-amber-400 border-t-transparent rounded-full animate-spin" />
                            Checking
                          </span>
                        );
                      }
                      if (status === 'offline') {
                        return (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full border border-red-200 dark:border-red-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            Disconnected
                          </span>
                        );
                      }
                      // Online / fallback
                      return (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          Connected
                        </span>
                      );
                    })()}
                  </div>

                  {/* Camera Details */}
                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    {parsed && (
                      <>
                        <div>
                          <span className="text-gray-400 dark:text-slate-500 text-xs">IP Address</span>
                          <p className="font-mono text-gray-900 dark:text-white">{parsed.ip}:{parsed.port}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 dark:text-slate-500 text-xs">Username</span>
                          <p className="text-gray-900 dark:text-white">{parsed.username}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* RTSP URL (expandable) */}
                  <div className="mb-4">
                    <button
                      onClick={() => setShowUrlFor(showUrlFor === pen.id ? null : pen.id)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
                    >
                      {showUrlFor === pen.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showUrlFor === pen.id ? 'Hide' : 'Show'} RTSP URL
                    </button>
                    {showUrlFor === pen.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-slate-900/50 rounded-lg text-xs text-gray-700 dark:text-slate-300 font-mono break-all">
                          {pen.camera_source}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(pen.camera_source || '');
                            toast.success('URL copied');
                          }}
                          title="Copy URL"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"
                        >
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-slate-700/50">
                    <button
                      onClick={() => handleRestartStream(pen.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-all duration-200"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Restart Stream
                    </button>
                    <button
                      onClick={() => handleDisconnectCamera(pen)}
                      disabled={isDisconnecting}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
                        isDisconnecting
                          ? 'text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 cursor-not-allowed'
                          : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
                      )}
                    >
                      {isDisconnecting ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Disconnecting...</>
                      ) : (
                        <><Unplug className="h-3 w-3" /> Disconnect</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unconnected Pens */}
      {unconnectedPens.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CircleDot className="h-4 w-4 text-gray-400 dark:text-slate-500" />
            <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400">
              Pens Without Camera ({unconnectedPens.length})
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {unconnectedPens.map((pen) => (
              <div
                key={pen.id}
                className="flex items-center justify-between p-3 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30"
              >
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-gray-300 dark:text-slate-600" />
                  <span className="text-sm text-gray-600 dark:text-slate-400">{pen.name}</span>
                </div>
                <button
                  onClick={() => {
                    setCameras([createEmptyConfig(pen)]);
                    setActiveCameraIdx(0);
                    setCurrentStep(1);
                    setView('wizard');
                  }}
                  className="text-xs text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 font-medium"
                >
                  Setup
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Wizard View ─────────────────────────────────────────────────────────

  const renderWizard = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Camera Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {cameras.map((cam, idx) => (
          <div key={cam.id} className="flex items-center gap-1">
            <button
              onClick={() => switchCamera(idx)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                activeCameraIdx === idx
                  ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                  : 'bg-white dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50'
              )}
            >
              <Camera className="h-4 w-4" />
              {cam.penName || `Camera ${idx + 1}`}
            </button>
            {cameras.length > 1 && activeCameraIdx === idx && (
              <button
                onClick={() => removeCamera(idx)}
                title="Remove camera"
                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addCamera}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-all duration-200 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Camera
        </button>
      </div>

      {/* Stepper */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center flex-1 last:flex-initial">
              <button
                onClick={() => setCurrentStep(step.id)}
                className="flex items-center gap-2 group"
              >
                <div className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300',
                  currentStep === step.id
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30 scale-110'
                    : currentStep > step.id
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
                )}>
                  {currentStep > step.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                <div className="hidden lg:block text-left">
                  <p className={clsx(
                    'text-xs font-semibold',
                    currentStep === step.id
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 dark:text-slate-400'
                  )}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">{step.description}</p>
                </div>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={clsx(
                  'flex-1 h-0.5 mx-2 rounded-full transition-all duration-500',
                  currentStep > step.id
                    ? 'bg-green-400 dark:bg-green-600'
                    : 'bg-gray-200 dark:bg-slate-700'
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-6 min-h-[400px]">
        {renderCurrentStep()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          disabled={currentStep === 1}
          className={clsx(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all duration-200',
            currentStep === 1
              ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
              : 'text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-600/50 hover:-translate-y-0.5'
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        {currentStep < STEPS.length ? (
          <button
            onClick={nextStep}
            disabled={!canProceed()}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all duration-200',
              canProceed()
                ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/25 hover:-translate-y-0.5'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-300 dark:text-slate-600 cursor-not-allowed'
            )}
          >
            Next Step
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between animate-slide-in-left">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Camera className="h-7 w-7 text-primary-500" />
            Camera Setup
          </h1>
          <p className="text-gray-500 dark:text-slate-400">Configure cameras for each pen in your facility</p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'wizard' && (
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-600/50 rounded-lg transition-all duration-200"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Overview
            </button>
          )}
          {view === 'overview' && (
            <button
              onClick={() => {
                setCameras([createEmptyConfig()]);
                setActiveCameraIdx(0);
                setCurrentStep(1);
                setView('wizard');
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg shadow-lg shadow-primary-500/25 transition-all duration-200 hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" />
              Add New Camera
            </button>
          )}
        </div>
      </div>

      {loadingPens ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
        </div>
      ) : view === 'overview' ? renderOverview() : renderWizard()}
    </div>
  );
}
