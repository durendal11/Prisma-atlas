import { useEffect, useMemo, useState } from 'react';
import { Shield, Info } from 'lucide-react';
import { computeAgeAdjustedCrushingRisk } from '@/utils/farrowingMetrics';
import type { ProximityAlert } from '@/utils/onnxDetector';
import clsx from 'clsx';

interface CrushingRiskGaugeProps {
  rawRisk: number;
  daysSinceFarrowing?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showMessage?: boolean;
  proximityAlerts?: ProximityAlert[];
  totalPiglets?: number;
}

const TICK_LABELS = ['Low', 'Moderate', 'Elevated', 'High'];

export default function CrushingRiskGauge({
  rawRisk,
  daysSinceFarrowing = null,
  size = 'md',
  showMessage = true,
  proximityAlerts,
  totalPiglets,
}: CrushingRiskGaugeProps) {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  const result = computeAgeAdjustedCrushingRisk({
    rawRisk,
    daysSinceFarrowing,
  });

  const percentage = Math.round(result.adjustedRisk * 100);

  // Per-piglet risk categorization
  const pigletRiskInfo = useMemo(() => {
    const total = totalPiglets ?? 0;
    if (total === 0) return null;
    const onTopCount = proximityAlerts?.filter(a => a.isOnTop).length ?? 0;
    const criticalCount = proximityAlerts?.filter(a => !a.isOnTop && a.riskContribution >= 0.3).length ?? 0;
    const warningCount = proximityAlerts?.filter(a => !a.isOnTop && a.riskContribution > 0 && a.riskContribution < 0.3).length ?? 0;
    const safeCount = Math.max(0, total - criticalCount - warningCount - onTopCount);
    return { onTopCount, criticalCount, warningCount, safeCount, total };
  }, [proximityAlerts, totalPiglets]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(percentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  const sizes = {
    sm: { barH: 'h-2', text: 'text-xs', title: 'text-[10px]', msg: 'text-[10px]', pad: 'p-3', gap: 'gap-2' },
    md: { barH: 'h-3', text: 'text-sm', title: 'text-xs', msg: 'text-xs', pad: 'p-4', gap: 'gap-3' },
    lg: { barH: 'h-4', text: 'text-base', title: 'text-xs', msg: 'text-sm', pad: 'p-5', gap: 'gap-3' },
  };

  const s = sizes[size];

  // Bar fill color based on level (solid, not gradient — simpler and calmer)
  const fillColor = {
    low: 'bg-teal-400 dark:bg-teal-500',
    moderate: 'bg-sky-400 dark:bg-sky-500',
    elevated: 'bg-amber-400 dark:bg-amber-500',
    high: 'bg-orange-400 dark:bg-orange-500',
  }[result.level];

  // Level badge styling
  const badgeStyle = {
    low: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    moderate: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    elevated: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  }[result.level];

  // Phase badge styling (always subtle)
  const phaseBadge = {
    newborn: 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400',
    'mid-lactation': 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    'late-lactation': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    unknown: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
  }[result.phase];

  return (
    <div className={clsx('flex flex-col', s.gap)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={clsx('h-4 w-4', result.color)} />
          <span className={clsx('font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider', s.title)}>
            Crushing Risk
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('font-bold', result.color, s.text)}>
            {percentage}%
          </span>
          <span className={clsx('px-2 py-0.5 rounded-full font-medium capitalize', s.title, badgeStyle)}>
            {result.level}
          </span>
        </div>
      </div>

      {/* Horizontal bar */}
      <div className="relative">
        {/* Background track */}
        <div className={clsx('w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden', s.barH)}>
          {/* Filled portion */}
          <div
            className={clsx('rounded-full transition-all duration-700 ease-out', s.barH, fillColor)}
            style={{ width: `${animatedWidth}%` }}
          />
        </div>

        {/* Tick marks */}
        {size !== 'sm' && (
          <div className="flex justify-between mt-1.5 px-0.5">
            {TICK_LABELS.map((label, i) => (
              <span
                key={label}
                className="text-[9px] text-gray-400 dark:text-slate-500"
                style={{ position: 'relative', left: i === 0 ? 0 : undefined, textAlign: i === TICK_LABELS.length - 1 ? 'right' : 'left' }}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Per-piglet risk count */}
      {pigletRiskInfo && (
        <div className="flex items-center gap-2.5 flex-wrap">
          {pigletRiskInfo.criticalCount > 0 && (
            <span className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
              s.title,
              'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              {pigletRiskInfo.criticalCount} high risk
            </span>
          )}
          {pigletRiskInfo.warningCount > 0 && (
            <span className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
              s.title,
              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {pigletRiskInfo.warningCount} nearby
            </span>
          )}
          {pigletRiskInfo.onTopCount > 0 && (
            <span className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
              s.title,
              'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              {pigletRiskInfo.onTopCount} on top
            </span>
          )}
          {pigletRiskInfo.safeCount > 0 && (
            <span className={clsx(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium',
              s.title,
              'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              {pigletRiskInfo.safeCount} safe
            </span>
          )}
        </div>
      )}

      {/* Phase badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full font-medium', s.title, phaseBadge)}>
          {result.phaseLabel}
        </span>
        {result.phase === 'newborn' && (
          <span className={clsx('text-rose-500 dark:text-rose-400 font-medium', s.title)}>
            Heightened monitoring
          </span>
        )}
        {result.phase === 'late-lactation' && (
          <span className={clsx('text-emerald-500 dark:text-emerald-400 font-medium', s.title)}>
            Reduced concern
          </span>
        )}
      </div>

      {/* Contextual message */}
      {showMessage && (
        <div className={clsx('flex gap-2 rounded-xl border px-3 py-2.5', result.bgColor,
          result.level === 'high' ? 'border-orange-200 dark:border-orange-800/30' :
          result.level === 'elevated' ? 'border-amber-200 dark:border-amber-800/30' :
          result.level === 'moderate' ? 'border-sky-200 dark:border-sky-800/30' :
          'border-teal-200 dark:border-teal-800/30'
        )}>
          <Info className={clsx('h-4 w-4 flex-shrink-0 mt-0.5', result.color)} />
          <p className={clsx('leading-relaxed text-gray-600 dark:text-slate-300', s.msg)}>
            {result.message}
          </p>
        </div>
      )}
    </div>
  );
}
