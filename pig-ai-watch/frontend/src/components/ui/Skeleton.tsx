import React, { useEffect, useState } from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  // We use standard animate-pulse combined with a subtle inner glow
  return (
    <div
      style={style}
      className={`animate-pulse bg-gray-200/80 dark:bg-slate-700/60 rounded-md ring-1 ring-black/5 dark:ring-white/5 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div className="space-y-3 w-1/2">
          <Skeleton className="h-8 w-2/3 md:w-1/3" />
          <Skeleton className="h-4 w-1/2 md:w-1/4" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
           <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
           <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// Custom hook to show skeleton for a minimum duration to avoid flickering
export function useLoading(initialState = true, minDuration = 600) {
  const [isLoading, setIsLoading] = useState(true);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(!initialState);

  useEffect(() => {
    if (!initialState) {
      setDataLoaded(true);
    }
  }, [initialState]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, minDuration);
    
    return () => clearTimeout(timer);
  }, [minDuration]);

  useEffect(() => {
    if (minTimeElapsed && dataLoaded) {
      setIsLoading(false);
    }
  }, [minTimeElapsed, dataLoaded]);

  const finishLoading = () => {
    setDataLoaded(true);
  };

  return { isLoading, finishLoading, setIsLoading: setDataLoaded };
}