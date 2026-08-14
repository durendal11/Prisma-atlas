import React, { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface ExportPdfButtonProps {
  onExport: () => Promise<void> | void;
  label?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'compact';
  disabled?: boolean;
}

export const ExportPdfButton: React.FC<ExportPdfButtonProps> = ({
  onExport,
  label = 'Export PDF Report',
  className = '',
  variant = 'primary',
  disabled = false,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleClick = async () => {
    if (isExporting || disabled) return;
    try {
      setIsExporting(true);
      await onExport();
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const variantStyles = {
    primary:
      'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium shadow-sm hover:shadow transition-all',
    secondary:
      'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-medium shadow-sm transition-all',
    outline:
      'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium transition-all',
    compact:
      'p-2 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all',
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isExporting || disabled}
        title={label}
        className={clsx(
          'inline-flex items-center justify-center rounded-lg disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles.compact,
          className
        )}
      >
        {isExporting ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isExporting || disabled}
      className={clsx(
        'inline-flex items-center gap-2 px-3.5 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        variantStyles[variant],
        className
      )}
    >
      {isExporting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileText className="w-4 h-4 text-blue-400 dark:text-blue-300" />
      )}
      <span>{isExporting ? 'Generating PDF...' : label}</span>
    </button>
  );
};
