import { format } from 'date-fns';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import type { Alert } from '@/types';
import clsx from 'clsx';

interface AlertCardProps {
  alert: Alert;
  onClick?: () => void;
  onResolve?: () => void;
  onMarkRead?: () => void;
}

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200/50 dark:from-red-900/30 dark:to-red-800/20 dark:border-red-700/50',
    iconBg: 'bg-red-100 dark:bg-red-800/50',
    iconColor: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 text-red-700 dark:bg-red-800/50 dark:text-red-300',
    glow: 'dark:shadow-[0_0_20px_rgba(239,68,68,0.2)]',
  },
  high: {
    icon: AlertCircle,
    bg: 'bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200/50 dark:from-orange-900/30 dark:to-orange-800/20 dark:border-orange-700/50',
    iconBg: 'bg-orange-100 dark:bg-orange-800/50',
    iconColor: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-800/50 dark:text-orange-300',
    glow: 'dark:shadow-[0_0_20px_rgba(251,146,60,0.2)]',
  },
  medium: {
    icon: AlertCircle,
    bg: 'bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-200/50 dark:from-yellow-900/30 dark:to-yellow-800/20 dark:border-yellow-700/50',
    iconBg: 'bg-yellow-100 dark:bg-yellow-800/50',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800/50 dark:text-yellow-300',
    glow: 'dark:shadow-[0_0_20px_rgba(234,179,8,0.2)]',
  },
  low: {
    icon: Info,
    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50 dark:from-blue-900/30 dark:to-blue-800/20 dark:border-blue-700/50',
    iconBg: 'bg-blue-100 dark:bg-blue-800/50',
    iconColor: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-800/50 dark:text-blue-300',
    glow: 'dark:shadow-[0_0_20px_rgba(59,130,246,0.2)]',
  },
  info: {
    icon: Info,
    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50 dark:from-blue-900/30 dark:to-blue-800/20 dark:border-blue-700/50',
    iconBg: 'bg-blue-100 dark:bg-blue-800/50',
    iconColor: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-800/50 dark:text-blue-300',
    glow: 'dark:shadow-[0_0_20px_rgba(59,130,246,0.2)]',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-200/50 dark:from-yellow-900/30 dark:to-yellow-800/20 dark:border-yellow-700/50',
    iconBg: 'bg-yellow-100 dark:bg-yellow-800/50',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800/50 dark:text-yellow-300',
    glow: 'dark:shadow-[0_0_20px_rgba(234,179,8,0.2)]',
  }
};

export default function AlertCard({ alert, onClick, onResolve }: AlertCardProps) {
  const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = config.icon;

  return (
    <div
      className={clsx(
        'rounded-xl border p-4 cursor-pointer backdrop-blur-sm',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-dark-lg',
        'active:scale-[0.98]',
        config.bg,
        config.glow,
        !alert.is_read && 'ring-2 ring-offset-2 ring-primary-300 dark:ring-primary-500/50 dark:ring-offset-slate-900'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={clsx(
          'p-2.5 rounded-xl transition-transform duration-300 group-hover:scale-110',
          config.iconBg
        )}>
          <Icon className={clsx('h-5 w-5', config.iconColor)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white">{alert.title}</h3>
            <span className={clsx(
              'text-xs px-2.5 py-1 rounded-full font-medium capitalize transition-transform duration-200 hover:scale-105',
              config.badge
            )}>
              {alert.severity}
            </span>
            {!alert.is_read && (
              <span className="h-2.5 w-2.5 bg-primary-500 rounded-full animate-pulse shadow-lg shadow-primary-500/50" />
            )}
          </div>
          
          {alert.message && (
            <p className="mt-1.5 text-sm text-gray-600 dark:text-slate-300 line-clamp-2">{alert.message}</p>
          )}
          
          <div className="mt-2.5 flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-gray-400 dark:bg-slate-500"></span>
              {format(new Date(alert.created_at), 'MMM d, HH:mm')}
            </span>
            <span className="capitalize">{alert.type.replace('_', ' ')}</span>
            {alert.pen_id && <span className="font-medium">Pen {alert.pen_id}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {!alert.is_resolved && onResolve && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResolve();
              }}
              className="p-2 hover:bg-green-100 dark:hover:bg-green-800/30 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
              title="Mark as resolved"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </button>
          )}
          {alert.is_resolved && (
            <span className="text-xs text-green-600 dark:text-green-400 font-semibold px-2 py-1 bg-green-100 dark:bg-green-800/30 rounded-lg">
              Resolved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
