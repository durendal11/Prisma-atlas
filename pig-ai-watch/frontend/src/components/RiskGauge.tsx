import { useEffect, useState } from 'react';
import clsx from 'clsx';

interface RiskGaugeProps {
  value: number; // 0 to 1
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function RiskGauge({ value, size = 'md', showLabel = true }: RiskGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedValue(value);
    }, 100);
    return () => clearTimeout(timer);
  }, [value]);

  const percentage = Math.round(animatedValue * 100);
  
  const getColor = () => {
    if (animatedValue < 0.3) return 'text-green-500 dark:text-green-400';
    if (animatedValue < 0.6) return 'text-yellow-500 dark:text-yellow-400';
    if (animatedValue < 0.8) return 'text-orange-500 dark:text-orange-400';
    return 'text-red-500 dark:text-red-400';
  };

  const getBgColor = () => {
    if (animatedValue < 0.3) return 'bg-green-500 dark:bg-green-400';
    if (animatedValue < 0.6) return 'bg-yellow-500 dark:bg-yellow-400';
    if (animatedValue < 0.8) return 'bg-orange-500 dark:bg-orange-400';
    return 'bg-red-500 dark:bg-red-400';
  };

  const getGlowColor = () => {
    if (animatedValue < 0.3) return 'drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]';
    if (animatedValue < 0.6) return 'drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]';
    if (animatedValue < 0.8) return 'drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]';
    return 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]';
  };

  const getLabel = () => {
    if (animatedValue < 0.3) return 'Low';
    if (animatedValue < 0.6) return 'Medium';
    if (animatedValue < 0.8) return 'High';
    return 'Critical';
  };

  const sizes = {
    sm: { container: 'w-16 h-16', text: 'text-xs', label: 'text-[10px]' },
    md: { container: 'w-24 h-24', text: 'text-lg', label: 'text-xs' },
    lg: { container: 'w-32 h-32', text: 'text-2xl', label: 'text-sm' },
  };

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (animatedValue * circumference);

  return (
    <div className="flex flex-col items-center group">
      <div className={clsx('relative transition-transform duration-300 group-hover:scale-105', sizes[size].container)}>
        <svg className={clsx('w-full h-full transform -rotate-90 transition-all duration-300', getGlowColor())} viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-200 dark:text-slate-700"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={clsx(getColor(), 'transition-all duration-700 ease-out')}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={clsx('font-bold transition-all duration-300', getColor(), sizes[size].text)}>
            {percentage}%
          </span>
        </div>
      </div>
      {showLabel && (
        <div className="mt-2 flex flex-col items-center">
          <span className={clsx('font-semibold', getColor(), sizes[size].label)}>
            {getLabel()} Risk
          </span>
          <div className="mt-1.5 flex gap-1.5">
            {[0.25, 0.5, 0.75, 1].map((threshold, i) => (
              <div
                key={i}
                className={clsx(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  animatedValue >= threshold 
                    ? clsx(getBgColor(), 'scale-100 shadow-sm') 
                    : 'bg-gray-200 dark:bg-slate-700 scale-90'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
