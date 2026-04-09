import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  FastForward,
  RotateCcw,
  Activity,
  Baby,
  AlertTriangle,
  Heart,
  Eye,
  Info,
  X,
  Video,
  Download,
  HardDrive,
  ChevronRight,
  Database,
  MonitorPlay
} from 'lucide-react';
import { getReplayData, ReplayData, ReplayFrame } from '@/services/behaviorLogger';
import { recordingApi } from '@/api';
import { useTranslation } from '@/hooks/useTranslation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

type PlaybackSpeed = 1 | 2 | 4 | 8;

function parsePenFromQuery(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const pen = Math.floor(parsed);
  return pen >= 1 ? pen : null;
}

// --- Helper Component: Recordings Tab ---
function RecordingsTab({ penId }: { penId: number }) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{total: number, used: number, free: number, storage_path?: string | null} | null>(null);

  const inferredSavePath = useMemo(() => {
    if (storageInfo?.storage_path) return storageInfo.storage_path;

    const firstClipWithStorage = recordings.find((r) => typeof r.storage_path === 'string' && r.storage_path.trim().length > 0);
    if (firstClipWithStorage?.storage_path) return firstClipWithStorage.storage_path;

    const firstClipWithFile = recordings.find((r) => typeof r.file_path === 'string' && r.file_path.trim().length > 0);
    if (firstClipWithFile?.file_path) {
      const p = firstClipWithFile.file_path;
      const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
      if (idx > 0) return p.slice(0, idx);
    }

    return null;
  }, [recordings, storageInfo]);

  useEffect(() => {
    let mounted = true;
    const fetchRecordings = async () => {
      setLoading(true);
      try {
        const data = await recordingApi.getRecordings(penId);
        if (mounted) {
          setRecordings(data.recordings || []);
          if (data.storage) {
            setStorageInfo(data.storage);
          }
        }
      } catch (err) {
        console.error("Failed to load recordings", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchRecordings();
    return () => { mounted = false; };
  }, [penId]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-indigo-500" />
          Edge Clip Save Location
        </h3>
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
          Use this path to confirm clips are physically written on the edge device.
        </div>
        <div className="font-mono text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 break-all text-gray-700 dark:text-slate-300">
          {inferredSavePath || 'No recording path reported yet (save clips first).'}
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          {recordings.length > 0
            ? `Clips indexed and fetchable: ${recordings.length}`
            : 'No indexed clips yet for this pen.'}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-slate-400">Loading recordings...</div>
        ) : recordings.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-slate-400 flex flex-col items-center">
            <Video className="w-12 h-12 mb-3 opacity-30" />
            <p>No video recordings found for Pen {penId}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">Date & Time</th>
                <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">Duration</th>
                <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">Mode</th>
                <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">Size</th>
                <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">Saved Path</th>
                <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {recordings.map((rec, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                    <div className="font-medium">{new Date(rec.start_time).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-500">{new Date(rec.start_time).toLocaleTimeString()}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                    {Math.round(rec.duration_sec)}s
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`}>
                      {rec.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                    {(rec.size_bytes / (1024 * 1024)).toFixed(1)} MB
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                    <div className="font-mono text-xs break-all max-w-[260px]">
                      {rec.file_path || rec.storage_path || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a 
                      href={`/api/recording/download/${rec.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download Video File"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 rounded-lg transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700/50 shadow-sm hover:shadow"
                    >
                      <Download className="w-4 h-4" /> Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Storage Info Widget */}
      {storageInfo && (
        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700/50 p-6 flex items-center gap-6">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-full text-indigo-600 dark:text-indigo-400">
            <HardDrive className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-end mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                Storage Status
              </h3>
              <span className="text-sm text-gray-600 dark:text-slate-400">
                {((storageInfo.used / (1024**3)) || 0).toFixed(1)} GB / {((storageInfo.total / (1024**3)) || 0).toFixed(1)} GB
              </span>
            </div>
            <progress
              value={Math.min(100, Math.max(0, (storageInfo.used / storageInfo.total) * 100))}
              max={100}
              className="w-full h-2.5 rounded-full overflow-hidden bg-gray-200 dark:bg-slate-700"
            />
            <div className="mt-2 text-xs text-gray-500 dark:text-slate-400 flex justify-between">
              <span>{((storageInfo.free / (1024**3)) || 0).toFixed(1)} GB Free Space</span>
              <span>Loop recording cap: 5.0 GB</span>
            </div>
            {storageInfo.storage_path && (
              <div className="mt-2 font-mono text-[11px] text-gray-500 dark:text-slate-400 break-all">
                Saved under: {storageInfo.storage_path}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReplayPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'simulation' | 'recordings'>('simulation');
  const [showInfo, setShowInfo] = useState(false);

  // ── Data state ──
  const [penId, setPenId] = useState(() => parsePenFromQuery(searchParams.get('pen')) ?? 1);
  const [hours, setHours] = useState(24);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const penFromQuery = parsePenFromQuery(searchParams.get('pen'));
    if (penFromQuery && penFromQuery !== penId) {
      setPenId(penFromQuery);
    }
  }, [searchParams, penId]);

  // ── Playback state ──
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentFrame: ReplayFrame | null = replay?.frames[frameIdx] ?? null;
  const totalFrames = replay?.total_frames ?? 0;

  // ── Fetch replay data ──
  const fetchReplay = useCallback(async () => {
    setFetching(true);
    setLoadError(null);
    try {
      const data = await getReplayData(penId, hours);
      setReplay(data);
      setFrameIdx(0);
      setPlaying(false);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setFetching(false);
    }
  }, [penId, hours]);

  useEffect(() => { fetchReplay(); }, [fetchReplay]);

  // ── Playback loop ──
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!playing || !replay) return;

    // Normal 12s interval compressed by speed
    const ms = Math.max(50, 1000 / speed);
    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        if (prev >= totalFrames - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, ms);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, totalFrames, replay]);

  // ── Controls ──
  const togglePlay = () => setPlaying(p => !p);
  const stepForward = () => setFrameIdx(i => Math.min(i + 1, totalFrames - 1));
  const stepBack = () => setFrameIdx(i => Math.max(i - 1, 0));
  const cycleSpeed = () => setSpeed(s => (s === 8 ? 1 : (s * 2) as PlaybackSpeed));
  const reset = () => { setFrameIdx(0); setPlaying(false); };

  // ── Mini chart data (rolling window of nearest 50 frames) ──
  const chartData = useMemo(() => {
    if (!replay) return [];
    const start = Math.max(0, frameIdx - 25);
    const end = Math.min(totalFrames, frameIdx + 25);
    return replay.frames.slice(start, end).map((f, i) => ({
      idx: start + i,
      health: f.health_score,
      risk: +(f.crushing_risk * 100).toFixed(1),
      piglets: f.piglet_count,
    }));
  }, [replay, frameIdx, totalFrames]);

  const progressPct = totalFrames > 1 ? (frameIdx / (totalFrames - 1)) * 100 : 0;

  // ── Posture color ──
  const postureColor = (posture: string | null) => {
    if (!posture) return 'text-gray-400';
    if (posture.includes('sleep') || posture.includes('lact')) return 'text-blue-500';
    if (posture.includes('feed')) return 'text-green-500';
    if (posture.includes('stand') || posture.includes('sit')) return 'text-amber-500';
    return 'text-gray-500';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
            <Eye className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Playback & Storage Hub</h1>
              <button 
                onClick={() => setShowInfo(true)} 
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                title="Page Information"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 dark:text-slate-400">Play telemetry simulations or manage raw MP4 video storage</p>
          </div>
        </div>

        {/* Global pen selection shared by both tabs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-gray-500 dark:text-slate-400">Pen:</label>
            <input
              type="number"
              min={1}
              value={penId}
              onChange={e => setPenId(Number(e.target.value))}
              title="Pen ID"
              className="w-16 text-sm bg-white dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-slate-300"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-6 border-b border-gray-200 dark:border-slate-800">
        <button
          className={`pb-2 text-sm font-medium transition-all ${activeTab === 'simulation' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-b-2 border-transparent'}`}
          onClick={() => setActiveTab('simulation')}
        >
          <div className="flex items-center gap-2"><Activity className="w-4 h-4"/> Telemetry Simulation</div>
        </button>
        <button
          className={`pb-2 text-sm font-medium transition-all ${activeTab === 'recordings' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-b-2 border-transparent'}`}
          onClick={() => setActiveTab('recordings')}
        >
          <div className="flex items-center gap-2"><Video className="w-4 h-4"/> Video Recordings</div>
        </button>
      </div>

      {/* activeTab: recordings */}
      {activeTab === 'recordings' && (
        <RecordingsTab penId={penId} />
      )}

      {/* activeTab: simulation */}
      {activeTab === 'simulation' && (
      <div className="space-y-6">
        <div className="flex justify-between">
          <div></div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-sm text-gray-500 dark:text-slate-400">Hours:</label>
              <select
                value={hours}
                onChange={e => setHours(Number(e.target.value))}
                title="Replay hours"
                className="text-sm bg-white dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-gray-700 dark:text-slate-300"
              >
                {[6, 12, 24, 48, 72, 168].map(h => (
                  <option key={h} value={h}>{h}h</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchReplay}
              disabled={fetching}
              className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition disabled:opacity-50"
            >
              {fetching ? 'Loading…' : 'Load Simulation'}
            </button>
          </div>
        </div>

      {/* Error / empty */}
      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm">
          {loadError}
        </div>
      )}

      {!fetching && replay && totalFrames === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500">
          <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No behavior data recorded for Pen {penId} in the last {hours}h</p>
        </div>
      )}

      {replay && totalFrames > 0 && (
        <>
          {/* ── Transport Controls bar ── */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4 flex flex-col gap-3">
            {/* Progress scrubber */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-slate-400 min-w-[70px]">
                {currentFrame?.timestamp
                  ? new Date(currentFrame.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '--:--:--'}
              </span>
              <input
                type="range"
                min={0}
                max={totalFrames - 1}
                value={frameIdx}
                onChange={e => setFrameIdx(Number(e.target.value))}
                title="Scrub timeline"
                className="flex-1 h-2 rounded-full appearance-none bg-gray-200 dark:bg-slate-700 cursor-pointer accent-indigo-500"
              />
              <span className="text-xs text-gray-500 dark:text-slate-400 min-w-[80px] text-right">
                Frame {frameIdx + 1}/{totalFrames}
              </span>
            </div>

            {/* Progress bar visual */}
            <progress
              value={progressPct}
              max={100}
              className="w-full h-1 rounded-full overflow-hidden bg-gray-200 dark:bg-slate-700"
            />

            {/* Buttons row */}
            <div className="flex items-center justify-center gap-2">
              <button onClick={reset} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition" title="Reset">
                <RotateCcw className="w-4 h-4 text-gray-600 dark:text-slate-400" />
              </button>
              <button onClick={stepBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition" title="Step back">
                <SkipBack className="w-4 h-4 text-gray-600 dark:text-slate-400" />
              </button>
              <button
                onClick={togglePlay}
                className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow transition"
                title={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={stepForward} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition" title="Step forward">
                <SkipForward className="w-4 h-4 text-gray-600 dark:text-slate-400" />
              </button>
              <button
                onClick={cycleSpeed}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition flex items-center gap-1"
                title="Playback speed"
              >
                <FastForward className="w-3.5 h-3.5" /> {speed}×
              </button>
            </div>
          </div>

          {/* ── Current frame metrics ── */}
          {currentFrame && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Posture */}
              <MetricCard
                icon={<Activity className="w-4 h-4" />}
                label="Posture"
                value={currentFrame.sow_posture ?? '-'}
                valueClass={`capitalize ${postureColor(currentFrame.sow_posture)}`}
                subtitle={`${((currentFrame.posture_confidence ?? 0) * 100).toFixed(0)}% conf`}
              />
              {/* Piglets */}
              <MetricCard
                icon={<Baby className="w-4 h-4 text-green-500" />}
                label="Piglets"
                value={String(currentFrame.piglet_count)}
                valueClass="text-green-600 dark:text-green-400"
                subtitle={`${currentFrame.sow_count} sow(s)`}
              />
              {/* Crushing Risk */}
              <MetricCard
                icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
                label="Crush Risk"
                value={`${(currentFrame.crushing_risk * 100).toFixed(0)}%`}
                valueClass={currentFrame.crushing_risk >= 0.65 ? 'text-red-600 dark:text-red-400' : currentFrame.crushing_risk >= 0.4 ? 'text-amber-500' : 'text-green-600 dark:text-green-400'}
              />
              {/* Health */}
              <MetricCard
                icon={<Heart className="w-4 h-4 text-pink-500" />}
                label="Health"
                value={currentFrame.health_score.toFixed(0)}
                valueClass={currentFrame.health_score >= 70 ? 'text-green-600 dark:text-green-400' : currentFrame.health_score >= 50 ? 'text-amber-500' : 'text-red-600 dark:text-red-400'}
                subtitle="/100"
              />
              {/* Nursing */}
              <MetricCard
                icon={<Heart className="w-4 h-4 text-purple-500" />}
                label="Nursing"
                value={currentFrame.is_nursing ? 'Yes' : 'No'}
                valueClass={currentFrame.is_nursing ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}
              />
              {/* Movement */}
              <MetricCard
                icon={<Activity className="w-4 h-4 text-amber-500" />}
                label="Movement"
                value={currentFrame.movement_level ?? '-'}
                valueClass="capitalize text-gray-700 dark:text-slate-300"
                subtitle={currentFrame.activity_level ?? ''}
              />
            </div>
          )}

          {/* ── Rolling chart ── */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Health &amp; Risk (rolling ±25 frames)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <ReferenceLine x={frameIdx} stroke="#6366f1" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="health" name="Health" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="risk" name="Risk %" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="piglets" name="Piglets" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      </div>
      )}

      {/* ── Info Modal ── */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                <Info className="w-5 h-5" />
                <h2>{t('replayModalTitle')}</h2>
              </div>
              <button 
                onClick={() => setShowInfo(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed space-y-3">
                <p dangerouslySetInnerHTML={{ __html: t('replayModalIntro') }} />
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                  <strong className="text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5 mb-1" dangerouslySetInnerHTML={{ __html: t('replayModalArchitectureTitle') }} />
                  <span dangerouslySetInnerHTML={{ __html: t('replayModalArchitectureDesc') }} />
                </div>
              </div>
              
              {/* Animation Container */}
              <div className="relative flex flex-row items-center justify-between my-6 py-10 px-2 sm:px-6 bg-indigo-600 rounded-2xl overflow-hidden shadow-inner min-h-[200px] w-full">
                
                <style>{`
                  @keyframes flowRight {
                    0% { transform: translateX(-10px); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateX(20px); opacity: 0; }
                  }
                  .animate-flow-right { animation: flowRight 1.5s linear infinite; }
                  .delay-75 { animation-delay: 0.75s; }
                `}</style>

                {/* Background stars/dots */}
                <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 bg-white/70 rounded-full animate-pulse" />
                <div className="absolute top-3/4 right-1/4 w-2 h-2 bg-white/50 rounded-full animate-[pulse_3s_ease-in-out_infinite]" />
                <div className="absolute top-1/3 right-[15%] w-1 h-1 bg-white/80 rounded-full animate-[pulse_2s_ease-in-out_infinite]" />
                <div className="absolute bottom-[15%] left-[20%] w-1.5 h-1.5 bg-white/60 rounded-full animate-[pulse_4s_ease-in-out_infinite]" />
                
                {/* Left: Edge Storage */}
                <div className="relative z-10 flex flex-col items-center flex-shrink-0 group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#2d3748] rounded-xl flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.5)] border-[3px] border-[#1a202c] relative z-10">
                     <Database className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400 group-hover:text-indigo-300 transition-colors animate-pulse" strokeWidth={1.5} />
                     <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_15px_rgba(99,102,241,0.2)] pointer-events-none"></div>
                  </div>
                  <span className="absolute -bottom-8 text-[10px] sm:text-xs font-bold text-white/95 uppercase tracking-wide whitespace-nowrap">Local Drive</span>
                </div>

                {/* Flow: Data fetch */}
                <div className="relative flex-1 flex items-center justify-center px-1 sm:px-3 mx-1">
                  <div className="absolute w-full border-t-2 border-dashed border-white/30" />
                  <div className="relative w-full flex justify-center gap-0 sm:gap-2 overflow-hidden py-4">
                    <ChevronRight className="w-5 h-5 text-indigo-300 animate-flow-right drop-shadow-md" strokeWidth={3} />
                    <ChevronRight className="w-5 h-5 text-indigo-300 animate-flow-right delay-75 drop-shadow-md hidden sm:block" strokeWidth={3} />
                  </div>
                </div>

                {/* Right: Dashboard / Display */}
                <div className="relative z-10 flex flex-col items-center flex-shrink-0">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-xl flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.4)] border-2 border-gray-100 relative z-10">
                    <MonitorPlay className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-600" strokeWidth={1.5} />
                  </div>
                  <span className="absolute -bottom-8 text-[10px] sm:text-xs font-bold text-white/95 uppercase tracking-wide">Replay Dashboard</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('replayModalGuideTitle')}</h3>
                <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600 dark:text-slate-300 ml-1">
                  <li dangerouslySetInnerHTML={{ __html: t('replayModalStep1') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('replayModalStep2') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('replayModalStep3') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('replayModalStep4') }} />
                  <li dangerouslySetInnerHTML={{ __html: t('replayModalStep5') }} />
                </ol>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-100 dark:border-slate-700/50 flex justify-end">
              <button 
                onClick={() => setShowInfo(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('replayModalCloseButton') || "Got it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Metric Card sub-component ──
function MetricCard({ icon, label, value, valueClass = '', subtitle }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
      </div>
      <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-400 dark:text-slate-500">{subtitle}</div>}
    </div>
  );
}
