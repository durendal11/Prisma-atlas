import { Info, X, CheckCircle2 } from 'lucide-react';
import React from 'react';

export function PageInfoButton({ onClick, className = '' }: { onClick: () => void, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors ${className}`}
      title="Page Information"
    >
      <Info className="w-5 h-5" />
    </button>
  );
}

export function PageInfoModal({ 
  isOpen, 
  onClose, 
  title, 
  children,
  steps,
  section: _section // unused internally, mapped for analytics generically
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  title: string, 
  children?: React.ReactNode,
  steps?: string[],
  section?: string
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 w-full max-w-lg overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold">
            <Info className="w-5 h-5" />
            <h2>About {title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto space-y-4">
          {children}
          {steps && (
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-gray-50 dark:bg-slate-700/30 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50">
                  <CheckCircle2 className="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-100 dark:border-slate-700/50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}