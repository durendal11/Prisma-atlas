import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Compass,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  badge?: string;
  actionHint?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
  onEnter?: () => void;
}

interface SystemTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps: TourStep[];
  onComplete?: () => void;
  tourKey?: string;
}

export const SystemTour: React.FC<SystemTourProps> = ({
  isOpen,
  onClose,
  steps,
  onComplete,
  tourKey = 'prisma_atlas_system_tour',
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverPlacement, setPopoverPlacement] = useState<'top' | 'bottom'>('bottom');
  const popoverRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // Pure measurement function — returns viewport bounding rect
  const measureTarget = useCallback((targetId: string) => {
    const el = document.getElementById(targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect(rect);
        return rect;
      }
    }
    setTargetRect(null);
    return null;
  }, []);

  // Handle step change, onEnter, and initial smooth scroll with RAF tracking
  useEffect(() => {
    if (!isOpen || steps.length === 0) return;
    const step = steps[currentStep];
    if (!step) return;

    if (step.onEnter) {
      step.onEnter();
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    let attempts = 0;
    const maxAttempts = 35; // 35 * 40ms = 1400ms to allow tab/view transitions
    let hasScrolled = false;
    let resizeObserver: ResizeObserver | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const findAndTrack = () => {
      const el = document.getElementById(step.targetId);
      if (el) {
        const freshRect = el.getBoundingClientRect();
        if (freshRect.width > 0 && freshRect.height > 0) {
          setTargetRect(freshRect);

          if (!hasScrolled) {
            hasScrolled = true;
            const isOutOfView =
              freshRect.top < 100 || freshRect.bottom > window.innerHeight - 100;

            if (isOutOfView) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
          }

          // Continuously track element position during smooth scroll
          const startTime = performance.now();
          const trackScroll = () => {
            const r = measureTarget(step.targetId);
            if (r && performance.now() - startTime < 1000) {
              rafRef.current = requestAnimationFrame(trackScroll);
            }
          };
          rafRef.current = requestAnimationFrame(trackScroll);

          // Observe changes to element size
          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
              measureTarget(step.targetId);
            });
            resizeObserver.observe(el);
          }
        } else if (attempts < maxAttempts) {
          attempts++;
          settleTimer = setTimeout(findAndTrack, 40);
        } else {
          setTargetRect(null);
        }
      } else if (attempts < maxAttempts) {
        attempts++;
        settleTimer = setTimeout(findAndTrack, 40);
      } else {
        setTargetRect(null);
      }
    };

    settleTimer = setTimeout(findAndTrack, 50);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isOpen, currentStep, steps, measureTarget]);

  // Window resize & scroll listeners — immediately re-measures target
  useEffect(() => {
    if (!isOpen || steps.length === 0) return;
    const step = steps[currentStep];
    if (!step) return;

    const handleUpdate = () => {
      measureTarget(step.targetId);
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('scroll', handleUpdate, { passive: true, capture: true });

    const mutationObserver = new MutationObserver(() => {
      measureTarget(step.targetId);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
      mutationObserver.disconnect();
    };
  }, [isOpen, currentStep, steps, measureTarget]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, steps.length]);

  if (!isOpen || steps.length === 0 || typeof document === 'undefined') return null;

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    try {
      localStorage.setItem(`${tourKey}_skipped`, 'true');
    } catch {}
    onClose();
  };

  const handleComplete = () => {
    try {
      localStorage.setItem(`${tourKey}_completed`, 'true');
    } catch {}
    if (onComplete) onComplete();
    onClose();
  };

  // Pixel-perfect spotlight bounding box coordinates
  const pad = 6;
  const spotlightX = targetRect ? Math.max(0, Math.round(targetRect.left - pad)) : 0;
  const spotlightY = targetRect ? Math.max(0, Math.round(targetRect.top - pad)) : 0;
  const spotlightW = targetRect ? Math.round(targetRect.width + pad * 2) : 0;
  const spotlightH = targetRect ? Math.round(targetRect.height + pad * 2) : 0;

  // Compute popover position relative to target element
  const getPopoverStyle = (): React.CSSProperties => {
    const popoverWidth = Math.min(380, window.innerWidth - 32);
    const measuredHeight = popoverRef.current?.offsetHeight || 260;
    const margin = 16;
    const spacing = 16;

    if (!targetRect) {
      // Center fallback
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        position: 'fixed',
        width: `${popoverWidth}px`,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 9999,
      };
    }

    // Horizontal centering relative to target element
    const targetCenterX = targetRect.left + (targetRect.width / 2);
    let left = Math.round(targetCenterX - (popoverWidth / 2));
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverWidth - margin));

    let top = 0;
    const requested = step.placement || 'auto';

    const spaceBelow = window.innerHeight - (spotlightY + spotlightH);
    const spaceAbove = spotlightY;

    if (requested === 'top') {
      const idealTop = spotlightY - measuredHeight - spacing;
      if (idealTop >= margin) {
        top = idealTop;
        if (popoverPlacement !== 'top') setPopoverPlacement('top');
      } else {
        top = spotlightY + spotlightH + spacing;
        if (popoverPlacement !== 'bottom') setPopoverPlacement('bottom');
      }
    } else if (requested === 'bottom') {
      const idealBottom = spotlightY + spotlightH + spacing;
      if (idealBottom + measuredHeight <= window.innerHeight - margin) {
        top = idealBottom;
        if (popoverPlacement !== 'bottom') setPopoverPlacement('bottom');
      } else {
        top = Math.max(margin, spotlightY - measuredHeight - spacing);
        if (popoverPlacement !== 'top') setPopoverPlacement('top');
      }
    } else {
      // 'auto' placement: pick side with most space
      if (spaceBelow >= measuredHeight + spacing + margin || spaceBelow >= spaceAbove) {
        top = spotlightY + spotlightH + spacing;
        if (popoverPlacement !== 'bottom') setPopoverPlacement('bottom');
      } else {
        top = Math.max(margin, spotlightY - measuredHeight - spacing);
        if (popoverPlacement !== 'top') setPopoverPlacement('top');
      }
    }

    // Clamp inside viewport
    top = Math.max(margin, Math.min(top, window.innerHeight - measuredHeight - margin));

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
      maxWidth: 'calc(100vw - 32px)',
      position: 'fixed',
      zIndex: 9999,
    };
  };

  // Calculate arrow/nub offset
  const getArrowOffset = () => {
    if (!targetRect) return '50%';
    const popoverWidth = Math.min(380, window.innerWidth - 32);
    const targetCenterX = targetRect.left + (targetRect.width / 2);
    const popoverLeft = Math.max(16, Math.min(Math.round(targetCenterX - (popoverWidth / 2)), window.innerWidth - popoverWidth - 16));
    const offsetInPopover = targetCenterX - popoverLeft;
    return `${Math.max(24, Math.min(offsetInPopover, popoverWidth - 24))}px`;
  };

  const tourPortalContent = (
    <div className="fixed inset-0 z-[9990] pointer-events-auto overflow-hidden animate-fade-in">
      {/* SVG Mask Backdrop for Spotlight cutout - updates instantly with scroll */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ width: '100vw', height: '100vh', zIndex: 9990 }}
      >
        <defs>
          <mask id="tour-mask">
            {/* White area fills screen (visible dark backdrop) */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black cutout makes target area transparent */}
            {targetRect && (
              <rect
                x={spotlightX}
                y={spotlightY}
                width={spotlightW}
                height={spotlightH}
                rx="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Semi-transparent dark overlay with mask */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.78)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Target Spotlight Highlight Ring - perfectly matches cutout without offset */}
      {targetRect && (
        <div
          className="fixed pointer-events-none rounded-2xl border-2 border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.5)] ring-4 ring-indigo-500/20"
          style={{
            top: `${spotlightY}px`,
            left: `${spotlightX}px`,
            width: `${spotlightW}px`,
            height: `${spotlightH}px`,
            zIndex: 9995,
          }}
        >
          <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md animate-ping" />
          <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md">
            {currentStep + 1}
          </div>
        </div>
      )}

      {/* Floating Tour Popover Card */}
      <div
        ref={popoverRef}
        style={getPopoverStyle()}
        className="bg-slate-900/95 dark:bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl backdrop-blur-xl p-5 text-white z-[9999] animate-in fade-in zoom-in-95 duration-200 relative"
      >
        {/* Directional arrow nub pointing at target element */}
        {targetRect && (
          <div
            className={clsx(
              'absolute w-3 h-3 bg-slate-900 border-indigo-500/50 rotate-45 pointer-events-none transition-all duration-200',
              popoverPlacement === 'bottom'
                ? '-top-1.5 border-t border-l'
                : '-bottom-1.5 border-b border-r'
            )}
            style={{ left: getArrowOffset() }}
          />
        )}

        {/* Header: badge, step counter, close button */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Compass className="h-3 w-3" />
              {step.badge || 'System Tour'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {currentStep + 1} of {steps.length}
            </span>
          </div>
          <button
            onClick={handleSkip}
            title="Skip Tour"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <h4 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <span>{step.title}</span>
        </h4>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          {step.description}
        </p>

        {/* Action Hint */}
        {step.actionHint && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-indigo-950/60 border border-indigo-800/50 text-[11px] text-indigo-200">
            <strong>Hint:</strong> {step.actionHint}
          </div>
        )}

        {/* Action Button */}
        {step.actionButton && (
          <div className="mb-4">
            <button
              onClick={() => {
                step.actionButton?.onClick();
                setTimeout(() => measureTarget(step.targetId), 200);
              }}
              className="relative w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all hover:scale-[1.01] active:scale-[0.98] border border-indigo-400/40"
            >
              {/* Blinking catchy beacon indicator */}
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-90 duration-700" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              </span>
              <span>{step.actionButton.label}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Progress Dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {steps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              className={clsx(
                'h-1.5 rounded-full transition-all duration-300',
                idx === currentStep
                  ? 'w-6 bg-indigo-400'
                  : idx < currentStep
                  ? 'w-2 bg-indigo-600'
                  : 'w-2 bg-slate-700'
              )}
              title={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Footer controls: Back, Next, Finish */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={handleSkip}
            className="text-xs text-slate-400 hover:text-slate-200 font-medium transition-colors px-2 py-1"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className={clsx(
                'relative flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white shadow-md transition-all',
                isLast
                  ? 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                  : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
              )}
            >
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90 duration-1000" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              {isLast ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Finish Tour
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(tourPortalContent, document.body);
};
