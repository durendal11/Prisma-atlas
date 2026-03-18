import clsx from 'clsx';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'accent' | 'danger';
}

const variantStyles = {
  default: 'bg-white dark:bg-slate-800/50 border-gray-200 dark:border-slate-700/50',
  primary: 'bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-primary-900/40 dark:to-primary-800/20 border-primary-200/50 dark:border-primary-700/50',
  secondary: 'bg-gradient-to-br from-secondary-50 to-secondary-100/50 dark:from-secondary-900/40 dark:to-secondary-800/20 border-secondary-200/50 dark:border-secondary-700/50',
  accent: 'bg-gradient-to-br from-accent-50 to-accent-100/50 dark:from-accent-900/40 dark:to-accent-800/20 border-accent-200/50 dark:border-accent-700/50',
  danger: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/40 dark:to-red-800/20 border-red-200/50 dark:border-red-700/50',
};

const iconStyles = {
  default: 'bg-gray-100 dark:bg-slate-700/80 text-gray-600 dark:text-slate-300',
  primary: 'bg-primary-100 dark:bg-primary-800/50 text-primary-600 dark:text-primary-300 shadow-primary-500/20',
  secondary: 'bg-secondary-100 dark:bg-secondary-800/50 text-secondary-600 dark:text-secondary-300 shadow-secondary-500/20',
  accent: 'bg-accent-100 dark:bg-accent-800/50 text-accent-600 dark:text-accent-300 shadow-accent-500/20',
  danger: 'bg-red-100 dark:bg-red-800/50 text-red-600 dark:text-red-300 shadow-red-500/20',
};

const glowStyles = {
  default: '',
  primary: 'dark:shadow-[0_0_15px_rgba(76,175,80,0.15)]',
  secondary: 'dark:shadow-[0_0_15px_rgba(33,150,243,0.15)]',
  accent: 'dark:shadow-[0_0_15px_rgba(255,152,0,0.15)]',
  danger: 'dark:shadow-[0_0_15px_rgba(239,68,68,0.15)]',
};

export default function StatCard({ 
  title, 
  value, 
  icon, 
  trend,
  subtitle,
  variant = 'default' 
}: StatCardProps) {
  return (
    <div className={clsx(
      'rounded-2xl border p-5 shadow-sm backdrop-blur-sm',
      'transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg',
      'dark:hover:shadow-dark-lg group',
      variantStyles[variant],
      glowStyles[variant]
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white transition-all duration-300 group-hover:scale-105 origin-left">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-slate-500">{subtitle}</p>
          )}
          {trend && (
            <p className={clsx(
              'text-xs font-semibold flex items-center gap-1',
              trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              <span className={clsx(
                'inline-block transition-transform duration-200',
                trend.isPositive ? 'rotate-0' : 'rotate-180'
              )}>↑</span>
              {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={clsx(
          'p-3 rounded-xl shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3',
          iconStyles[variant]
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}
