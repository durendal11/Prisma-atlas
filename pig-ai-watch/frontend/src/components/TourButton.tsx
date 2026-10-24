import React from 'react';
import { Compass } from 'lucide-react';
import clsx from 'clsx';

export interface TourButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  variant?: 'primary' | 'subtle' | 'compact';
  badgeText?: string;
  showBeacon?: boolean;
}

export const TourButton: React.FC<TourButtonProps> = ({
  onClick,
  id,
  className,
  label = 'System Tour',
  title = 'Start Interactive System Tour',
  variant = 'primary',
  badgeText,
  showBeacon = true,
  ...rest
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      id={id}
      title={title}
      className={clsx(
        'relative group inline-flex items-center gap-2 font-semibold transition-all duration-200 select-none active:scale-95',
        variant === 'primary' && [
          'px-3.5 py-1.5 text-xs rounded-xl text-white',
          'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500',
          'shadow-[0_0_16px_rgba(99,102,241,0.5)] hover:shadow-[0_0_24px_rgba(129,140,248,0.75)]',
          'border border-indigo-400/50 hover:border-indigo-300 hover:scale-105',
          'ring-2 ring-indigo-500/20 hover:ring-indigo-400/40',
        ],
        variant === 'subtle' && [
          'px-2.5 py-1 text-xs rounded-lg font-medium',
          'text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100',
          'bg-indigo-50/90 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60',
          'border border-indigo-200/80 dark:border-indigo-800/80 hover:border-indigo-400',
          'shadow-sm hover:shadow-[0_0_14px_rgba(99,102,241,0.35)] hover:scale-105',
        ],
        variant === 'compact' && [
          'px-2 py-1 text-[11px] rounded-lg text-white font-medium',
          'bg-indigo-600 hover:bg-indigo-500 shadow-sm hover:shadow-md hover:scale-105',
        ],
        className
      )}
      {...rest}
    >
      {/* Blinking corner radar ping beacon */}
      {showBeacon && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-90 duration-1000" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
        </span>
      )}

      {/* Catchy blinking pulse light inside button */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-90 duration-700" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
      </span>

      <Compass className="h-3.5 w-3.5 flex-shrink-0 text-white dark:text-indigo-200 group-hover:rotate-45 transition-transform duration-300" />
      
      <span>{label}</span>

      {badgeText && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/30 animate-pulse">
          {badgeText}
        </span>
      )}
    </button>
  );
};
