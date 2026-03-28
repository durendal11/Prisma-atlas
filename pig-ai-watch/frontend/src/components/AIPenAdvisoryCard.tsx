import React, { useState, useEffect } from 'react';
import { Sparkles, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { advisoryApi } from '../api';

const PenGeneratingAnimation = () => (
  <div className="flex flex-col space-y-4 py-3">
    <div className="flex items-center gap-2 mb-2">
      <Activity className="w-5 h-5 text-teal-500 animate-[spin_3s_linear_infinite]" />
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-500 bg-[length:200%_auto] animate-[shimmer_2s_linear_infinite] font-semibold text-base">
        Veterinary Engine is diagnosing this pen...
      </span>
    </div>
    
    <div className="space-y-3">
      <div className="h-4 bg-teal-100 dark:bg-teal-900/40 rounded w-full animate-[pulse_1.5s_ease-in-out_infinite]"></div>
      <div className="h-4 bg-teal-100 dark:bg-teal-900/40 rounded w-5/6 animate-[pulse_1.5s_ease-in-out_infinite_0.2s]"></div>
      <div className="h-4 bg-teal-100 dark:bg-teal-900/40 rounded w-4/6 animate-[pulse_1.5s_ease-in-out_infinite_0.4s]"></div>
    </div>
  </div>
);

export const AIPenAdvisoryCard: React.FC<{ penId?: string | number; penStatus?: any; recentEvents?: any[] }> = ({ penId, penStatus, recentEvents }) => {
  const [advisory, setAdvisory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(60);

  const PERIOD_OPTIONS = [
    { label: 'Last Hour', value: 60 },
    { label: 'Last 24h', value: 1440 },
    { label: 'Last 7 Days', value: 10080 },
    { label: 'Last 30 Days', value: 43200 },
  ] as const;

  useEffect(() => {
    // Inject the keyframes for shimmer
    const styleId = 'shimmer-keyframe';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes shimmer {
          from { background-position: 200% center; }
          to { background-position: -200% center; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const generateAdvisory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = {
        pen_id: penId || 'Unknown',
        pen_status: penStatus || {},
        recent_events: recentEvents || [],
        window_minutes: windowMinutes,
      };
      const response = await advisoryApi.getPenAdvisory(data);
      if (typeof response === 'string') {
        setAdvisory(response);
      } else if ((response as any).body && (response as any).headline) {
        // Format the JSON structured response into a nice markdown string
        const structured = response as any;
        const formatted = `### ${structured.headline}
**Urgency:** ${structured.urgency ? structured.urgency.toUpperCase() : 'N/A'}

${structured.body}

**Recommendation:**
${structured.recommended_action || 'Monitor closely.'}

*Basis:* ${structured.source_basis || 'Telemetry data'}
`;
        setAdvisory(formatted);
      } else {
        setAdvisory((response as any).advisory || JSON.stringify(response));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to generate advisory. Ensure GEMINI_API_KEY is configured in backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-white to-teal-50/40 dark:from-slate-800/80 dark:to-teal-900/10 rounded-2xl border border-teal-100/50 dark:border-teal-800/30 shadow-sm p-5 relative overflow-hidden mt-6">
      {/* Decorative background blur */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-teal-100/50 dark:border-teal-800/30 pb-3">
        <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
          <Sparkles className="w-5 h-5" />
          <h3 className="text-lg font-bold">Pen Expert</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-teal-50/80 dark:bg-teal-900/20 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWindowMinutes(opt.value)}
                className={`text-[11px] px-2 py-1 rounded-md font-medium transition-all ${
                  windowMinutes === opt.value
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!loading && (
            <button
              onClick={generateAdvisory}
              className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all font-semibold shadow-sm hover:shadow"
            >
              {advisory ? 'Regenerate' : 'Analyze Pen'}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10">
        {loading ? (
          <PenGeneratingAnimation />
        ) : error ? (
          <div className="text-red-500 text-sm py-3 px-3 bg-red-50 dark:bg-red-900/20 rounded-lg">{error}</div>
        ) : advisory ? (
           <div className="prose prose-sm dark:prose-invert prose-teal max-w-none text-slate-700 dark:text-slate-300">
             <ReactMarkdown>{advisory}</ReactMarkdown>
           </div>
        ) : (
          <div className="py-4 text-center text-slate-500 dark:text-slate-400">
            <p className="text-sm">Need a second opinion? Analyze the {PERIOD_OPTIONS.find(o => o.value === windowMinutes)?.label.toLowerCase() || 'last hour'} of data for Pen {penId || '1'}.</p>
          </div>
        )}
      </div>
    </div>
  );
};
