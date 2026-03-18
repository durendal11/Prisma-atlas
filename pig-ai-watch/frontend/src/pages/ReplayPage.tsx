import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { getReplayData, ReplayData, ReplayFrame } from '@/services/behaviorLogger';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

type PlaybackSpeed = 1 | 2 | 4 | 8;

export default function ReplayPage() {
  const [showInfo, setShowInfo] = useState(false);

  // ── Data state ──
  const [penId, setPenId] = useState(1);
  const [hours, setHours] = useState(24);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
            <Eye className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Replay / Simulation Mode</h1>
              <button 
                onClick={() => setShowInfo(true)} 
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                title="Page Information"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 dark:text-slate-400">Play back recorded behavior data through the analytics pipeline</p>
          </div>
        </div>

        {/* Pen & hours selectors */}
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
            {fetching ? 'Loading…' : 'Load'}
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
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1">
              <div className="h-1 rounded-full bg-indigo-500 transition-all duration-100" style={{ width: `${progressPct}%` }} />
            </div>

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

      {/* ── Info Modal ── */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                <Info className="w-5 h-5" />
                <h2>About Replay Mode</h2>
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
                <p>
                  The <strong className="text-gray-900 dark:text-white">Replay Mode</strong> allows you to review historical behavior, metrics, and risk factors for a specific pen over a past timeframe. It simulates real-time data playback to help you retrospectively analyze events.
                </p>
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                  <strong className="text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
                    Storage Architecture
                  </strong>
                  Video recordings and telemetry logs are securely fetched from <strong className="text-gray-900 dark:text-white">local drive storage</strong>. By not relying on cloud or temporary session storage, Replay Mode ensures fast, offline playback while keeping your farm's data completely private.
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Step-by-step Guide</h3>
                <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600 dark:text-slate-300 ml-1">
                  <li>
                    <strong className="text-gray-800 dark:text-slate-200">Load Data:</strong> Select the Pen ID and amount of past hours you want to analyze, then click "Load".
                  </li>
                  <li>
                    <strong className="text-gray-800 dark:text-slate-200">Timeline Scrubbing:</strong> Use the range slider below the timeline to jump directly to any specific timestamp within your loaded data.
                  </li>
                  <li>
                    <strong className="text-gray-800 dark:text-slate-200">Playback Controls:</strong> Play, pause, or step frame-by-frame forward or backward using the buttons. You can also adjust the playback speed (1x up to 8x).
                  </li>
                  <li>
                    <strong className="text-gray-800 dark:text-slate-200">Monitor Metrics:</strong> The metric cards (Posture, Piglets, Crush Risk, Health, etc.) update live during playback to reflect the system's analysis at that exact moment in time.
                  </li>
                  <li>
                    <strong className="text-gray-800 dark:text-slate-200">Analyze Trends:</strong> The rolling chart at the bottom visualizes Health and Risk data surrounding the current frame (±25 frames), allowing you to spot anomalies leading up to an event.
                  </li>
                </ol>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-100 dark:border-slate-700/50 flex justify-end">
              <button 
                onClick={() => setShowInfo(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Got it
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
