import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { advisoryApi } from '../api';

type BriefingMode = 'morning' | 'night';

const getBriefingMode = (date: Date): BriefingMode => {
  const hour = date.getHours();
  return hour >= 18 || hour < 5 ? 'night' : 'morning';
};

const getBriefingTitle = (mode: BriefingMode): string => {
  return mode === 'night' ? 'Night Briefing' : 'Morning Briefing';
};

const GeneratingAnimation = () => (
  <div className="flex flex-col space-y-4 py-2">
    {/* Looping highlighted text generating animation */}
    <div className="flex items-center gap-2 mb-2">
      <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-400 to-indigo-500 bg-[length:200%_auto] animate-[shimmer_2s_linear_infinite] font-semibold text-lg">
        System is generating your insights...
      </span>
    </div>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-4 bg-indigo-100 dark:bg-indigo-900/40 rounded w-3/4 animate-[pulse_1.5s_ease-in-out_infinite]"></div>
        <div className="h-4 bg-indigo-100 dark:bg-indigo-900/40 rounded w-full animate-[pulse_1.5s_ease-in-out_infinite_0.2s]"></div>
        <div className="h-4 bg-indigo-100 dark:bg-indigo-900/40 rounded w-5/6 animate-[pulse_1.5s_ease-in-out_infinite_0.4s]"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-indigo-100 dark:bg-indigo-900/40 rounded w-full animate-[pulse_1.5s_ease-in-out_infinite_0.1s]"></div>
        <div className="h-4 bg-indigo-100 dark:bg-indigo-900/40 rounded w-4/6 animate-[pulse_1.5s_ease-in-out_infinite_0.3s]"></div>
      </div>
    </div>
  </div>
);

export const AIBriefingCard: React.FC<{ penData?: any }> = ({ penData }) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodHours, setPeriodHours] = useState(24);
  const [now, setNow] = useState(() => new Date());

  const briefingMode = getBriefingMode(now);
  const briefingTitle = getBriefingTitle(briefingMode);

  const PERIOD_OPTIONS = [
    { label: 'Last 24 Hours', value: 24 },
    { label: 'Last 7 Days', value: 168 },
    { label: 'Last 30 Days', value: 720 },
  ] as const;

  useEffect(() => {
    // Inject the keyframes for shimmer into the document
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shimmer {
        from { background-position: 200% center; }
        to { background-position: -200% center; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  const generateBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = {
        pen_count: penData?.length || 0,
        per_pen_summaries: JSON.stringify(penData || []),
        period_hours: periodHours,
        briefing_mode: briefingMode,
        briefing_title: briefingTitle,
        local_hour: now.getHours(),
      };
      const response = await advisoryApi.getDailyDigest(data);
      // Ensure we extract the markdown string from the response object
      setBriefing(typeof response === 'string' ? response : (response as any).markdown || (response as any).digest || JSON.stringify(response));
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to generate briefing. Ensure GEMINI_API_KEY is configured in backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-white to-indigo-50/30 dark:from-slate-800/80 dark:to-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm p-6 relative overflow-hidden">
      {/* Decorative background blur */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-indigo-100 dark:border-indigo-800/50">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
          <Sparkles className="w-6 h-6" />
          <h2 className="text-xl font-bold tracking-tight">{briefingTitle}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-indigo-50/80 dark:bg-indigo-900/30 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriodHours(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  periodHours === opt.value
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!loading && (
            <button
              onClick={generateBriefing}
              className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-semibold shadow-sm hover:shadow active:scale-95"
            >
              {briefing ? 'Regenerate' : 'Generate Now'}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 min-h-[120px]">
        {loading ? (
          <GeneratingAnimation />
        ) : error ? (
          <div className="text-red-500 text-sm py-4 bg-red-50 dark:bg-red-900/20 px-4 rounded-xl border border-red-100 dark:border-red-900/50">{error}</div>
        ) : briefing ? (
          <div className="prose prose-sm dark:prose-invert prose-indigo max-w-none text-slate-700 dark:text-slate-300">
            {/* The markdown will render beautifully here */}
            <ReactMarkdown>{briefing}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
            <Sparkles className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-base text-center">Click "Generate Now" to analyze the {PERIOD_OPTIONS.find(o => o.value === periodHours)?.label.toLowerCase() || 'last 24 hours'} of farm activity.</p>
            <p className="text-xs text-center mt-1 opacity-70"></p>
          </div>
        )}
      </div>
    </div>
  );
};
