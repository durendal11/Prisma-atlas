import { useState } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { Archive, RotateCcw, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import type { Alert } from '@/types';
import clsx from 'clsx';

interface SwipeableAlertCardProps {
  alert: Alert;
  mode?: 'active' | 'archived';
  onClick?: () => void;
  onResolve?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
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

export default function SwipeableAlertCard({
  alert,
  mode = 'active',
  onClick,
  onResolve,
  onArchive,
  onRestore,
  onDelete,
}: SwipeableAlertCardProps) {
  const [isRemoved, setIsRemoved] = useState(false);
  const x = useMotionValue(0);

  // Background action opacities based on swipe distance
  // Active mode: Left swipe (-X) triggers Archive
  const archiveOpacity = useTransform(x, [-120, -30], [1, 0]);
  const archiveScale = useTransform(x, [-120, -30], [1, 0.7]);

  // Archived mode: Right swipe (+X) triggers Restore
  const restoreOpacity = useTransform(x, [30, 120], [0, 1]);
  const restoreScale = useTransform(x, [30, 120], [0.7, 1]);

  const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info;
  const Icon = config.icon;

  const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipeThreshold = 80;
    const velocityThreshold = 300;

    if (mode === 'active') {
      // Swiping left (drag < 0) archives active alert
      if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
        if (onArchive) {
          setIsRemoved(true);
          setTimeout(() => onArchive(), 200);
        }
      }
    } else if (mode === 'archived') {
      // Swiping right (drag > 0) restores archived alert
      if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
        if (onRestore) {
          setIsRemoved(true);
          setTimeout(() => onRestore(), 200);
        }
      }
    }
  };

  return (
    <AnimatePresence>
      {!isRemoved && (
        <motion.div
          layout
          initial={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.25 } }}
          className="relative rounded-xl overflow-hidden select-none touch-pan-y"
        >
          {/* Background Action Layers */}
          {mode === 'active' && onArchive && (
            <div className="absolute inset-0 bg-gradient-to-l from-indigo-600 via-indigo-700 to-indigo-900 text-white flex items-center justify-end px-6 rounded-xl">
              <motion.div
                style={{ opacity: archiveOpacity, scale: archiveScale }}
                className="flex items-center gap-2 text-xs sm:text-sm font-bold tracking-wide"
              >
                <Archive className="h-5 w-5 animate-pulse text-indigo-200" />
                <span>Swipe to Archive</span>
              </motion.div>
            </div>
          )}

          {mode === 'archived' && onRestore && (
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 text-white flex items-center justify-start px-6 rounded-xl">
              <motion.div
                style={{ opacity: restoreOpacity, scale: restoreScale }}
                className="flex items-center gap-2 text-xs sm:text-sm font-bold tracking-wide"
              >
                <RotateCcw className="h-5 w-5 animate-pulse text-emerald-200" />
                <span>Swipe to Restore</span>
              </motion.div>
            </div>
          )}

          {/* Foreground Swiping Content Card */}
          <motion.div
            drag="x"
            dragConstraints={
              mode === 'active'
                ? { left: -140, right: 0 }
                : { left: 0, right: 140 }
            }
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x }}
            whileTap={{ cursor: 'grabbing' }}
            onClick={onClick}
            className={clsx(
              'relative z-10 rounded-xl border p-4 cursor-pointer backdrop-blur-sm',
              'transition-shadow duration-200',
              'hover:shadow-lg dark:hover:shadow-dark-lg',
              config.bg,
              config.glow,
              !alert.is_read && 'ring-2 ring-offset-2 ring-primary-300 dark:ring-primary-500/50 dark:ring-offset-slate-900'
            )}
          >
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div
                className={clsx(
                  'p-2 sm:p-2.5 rounded-xl transition-transform duration-300 shrink-0 mt-0.5',
                  config.iconBg
                )}
              >
                <Icon className={clsx('h-4 w-4 sm:h-5 sm:w-5', config.iconColor)} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h3 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white leading-tight">
                    {alert.title}
                  </h3>
                  <span
                    className={clsx(
                      'text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0',
                      config.badge
                    )}
                  >
                    {alert.severity}
                  </span>
                  {!alert.is_read && (
                    <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 bg-primary-500 rounded-full animate-pulse shadow-lg shadow-primary-500/50 shrink-0" />
                  )}
                </div>

                {alert.message && (
                  <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-slate-300 line-clamp-2">
                    {alert.message}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-gray-400 dark:bg-slate-500"></span>
                    {format(new Date(alert.created_at), 'MMM d, HH:mm')}
                  </span>
                  <span className="capitalize">{alert.type.replace('_', ' ')}</span>
                  {alert.pen_id && <span className="font-medium">Pen {alert.pen_id}</span>}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {mode === 'active' && !alert.is_resolved && onResolve && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolve();
                    }}
                    className="p-1.5 hover:bg-green-100 dark:hover:bg-green-800/30 rounded-lg transition-all text-green-600 dark:text-green-400"
                    title="Mark as resolved"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}

                {mode === 'active' && onArchive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRemoved(true);
                      setTimeout(() => onArchive(), 200);
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                    title="Archive notification (or swipe left)"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                )}

                {mode === 'archived' && onRestore && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRemoved(true);
                      setTimeout(() => onRestore(), 200);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 rounded-lg transition-colors flex items-center gap-1"
                    title="Restore notification back to active list"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restore</span>
                  </button>
                )}

                {mode === 'archived' && onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
