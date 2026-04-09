import { useState, useEffect } from 'react';
import { 
  Save, 
  CalendarDays,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { recordingApi, pensApi } from '@/api';
import { PageInfoButton } from '@/components/ui/PageInfoModal';
import { useTranslation } from '@/hooks/useTranslation';

// mode mappings
type RecMode = 'off' | 'detection';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function RecordingSchedulePage() {
  const { t } = useTranslation();
  const [pens, setPens] = useState<any[]>([]);
  const [selectedPen, setSelectedPen] = useState<number | null>(null);
  
  // 168 cells: index = day * 24 + hour
  const [schedule, setSchedule] = useState<RecMode[]>(Array(168).fill('off'));
  
  const [activeMode, setActiveMode] = useState<RecMode>('detection');
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    pensApi.getAll().then(data => {
      setPens(data || []);
      if (data && data.length > 0) {
        setSelectedPen(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedPen) {
      recordingApi.getSchedule(selectedPen).then(data => {
        if (data && data.schedule && data.schedule.length === 168) {
          setSchedule(data.schedule);
        } else {
          setSchedule(Array(168).fill('off'));
        }
      }).catch(() => {
        setSchedule(Array(168).fill('off'));
      });
    }
  }, [selectedPen]);

  const handleSave = async () => {
    if (!selectedPen) return;
    try {
      await recordingApi.saveSchedule(selectedPen, schedule);
      toast.success('Schedule saved successfully!');
    } catch (err) {
      toast.error('Failed to save schedule');
    }
  };

  const getCellIndex = (dayIdx: number, hour: number) => dayIdx * 24 + hour;

  const updateCell = (idx: number) => {
    setSchedule(prev => {
      const next = [...prev];
      next[idx] = activeMode;
      return next;
    });
  };

  const handlePointerDown = (idx: number) => {
    setIsDragging(true);
    updateCell(idx);
  };

  const handlePointerEnter = (idx: number) => {
    if (isDragging) updateCell(idx);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const fillAll = () => setSchedule(Array(168).fill(activeMode));
  const clearAll = () => setSchedule(Array(168).fill('off'));

  return (
    <div className="p-6 max-w-7xl mx-auto touch-none animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary-500" />
            Recording Schedule
          </h1>
          <PageInfoButton onClick={() => setShowInfo(true)} />
        </div>
        
        <div className="flex gap-4 items-center">
          <select
            value={selectedPen || ''}
            onChange={(e) => setSelectedPen(Number(e.target.value))}
            aria-label="Select pen"
            title="Select pen"
            className="rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-4 py-2"
          >
            {pens.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg shadow"
          >
            <Save className="h-4 w-4" />
            Save Schedule
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveMode('detection')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                activeMode === 'detection' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300'
              }`}
            >
              Farrowing / Crushing Detection
            </button>
            <button
              onClick={() => setActiveMode('off')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                activeMode === 'off' ? 'border-gray-500 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200' : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300'
              }`}
            >
              Off
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={fillAll} className="text-sm font-medium text-primary-600 hover:underline">Select All</button>
            <span className="text-gray-300">|</span>
            <button onClick={clearAll} className="text-sm font-medium text-gray-500 hover:underline">Clear All</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Desktop Layout (Horizontal Hours, Vertical Days) */}
          <div className="hidden md:block min-w-fit pb-2">
            <div className="flex mb-2">
              <div className="w-16"></div>
              {HOURS.map(h => (
                <div key={h} className="w-10 text-xs text-center text-gray-500 dark:text-slate-400 font-medium">
                  {h.toString().padStart(2, '0')}
                </div>
              ))}
            </div>

            {DAYS.map((day, dIdx) => (
              <div key={day} className="flex mb-1 items-center">
                <div className="w-16 text-sm font-medium text-gray-700 dark:text-slate-300">{day}</div>
                {HOURS.map(h => {
                  const idx = getCellIndex(dIdx, h);
                  const mode = schedule[idx];
                  let bgColor = 'bg-gray-100 dark:bg-slate-700';
                  if (mode === 'detection') bgColor = 'bg-amber-500';

                  return (
                    <div
                      key={h}
                      onPointerDown={() => handlePointerDown(idx)}
                      onPointerEnter={() => handlePointerEnter(idx)}
                      className={`w-9 h-8 mx-0.5 rounded cursor-pointer transition-colors duration-75 ${bgColor} border border-gray-200 dark:border-slate-600/50`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Mobile Layout (Vertical Hours, Horizontal Days) */}
          <div className="md:hidden min-w-fit flex pb-2">
            <div>
              <div className="flex sticky top-0 bg-white dark:bg-slate-800 z-10 pt-2 pb-1 border-b border-gray-100 dark:border-slate-700 mb-4">
                <div className="w-16"></div>
                {DAYS.map(day => (
                  <div key={day} className="w-12 text-sm text-center text-gray-700 dark:text-slate-300 font-medium">
                    {day}
                  </div>
                ))}
              </div>

              {HOURS.map(h => (
                <div key={h} className="flex mb-1 items-center">
                  <div className="w-16 text-xs text-right pr-4 text-gray-500 dark:text-slate-400 font-medium">
                    {h.toString().padStart(2, '0')}:00
                  </div>
                  {DAYS.map((day, dIdx) => {
                    const idx = getCellIndex(dIdx, h);
                    const mode = schedule[idx];
                    let bgColor = 'bg-gray-100 dark:bg-slate-700'; // off
                    if (mode === 'detection') bgColor = 'bg-amber-500';

                    return (
                      <div
                        key={day}
                        onPointerDown={() => handlePointerDown(idx)}
                        onPointerEnter={() => handlePointerEnter(idx)}
                        className={`w-11 h-10 mx-0.5 rounded cursor-pointer transition-colors duration-75 ${bgColor} border border-gray-200 dark:border-slate-600/50`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-6 md:mt-4">
          Click and drag to apply the selected recording mode to the schedule grid. Time is based on the local edge device clock.
        </p>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 w-full max-w-4xl overflow-hidden animate-scale-in my-8 relative">
            <div className="sticky top-0 z-20 flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700/50 bg-white/95 dark:bg-slate-800/95 backdrop-blur">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 font-bold text-lg">
                <CalendarDays className="w-6 h-6" />
                <h2>{t('scheduleModalTitle')}</h2>
              </div>
              <button 
                onClick={() => setShowInfo(false)}
                aria-label="Close recording schedule info"
                title="Close recording schedule info"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {/* Animation Container */}
              <div className="relative flex flex-col items-center mb-10 py-12 px-6 sm:px-10 bg-slate-50 dark:bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-700 w-full min-h-[260px] justify-center">
                
                <style>{`
                  @keyframes handSwipe {
                    0% { transform: translate(0px, 0px); }
                    30% { transform: translate(120px, 0px); }
                    50% { transform: translate(120px, 25px); }
                    80% { transform: translate(0px, 25px); }
                    100% { transform: translate(0px, 0px); }
                  }
                  @keyframes fillRow1 {
                    0%, 5% { background-color: rgb(243 244 246); border-color: rgb(229 231 235); }
                    15%, 100% { background-color: rgb(245 158 11); border-color: rgb(217 119 6); }
                  }
                  .animate-hand-swipe { animation: handSwipe 4s ease-in-out infinite; }
                  
                  /* Dark mode specific fills */
                  @media (prefers-color-scheme: dark) {
                    @keyframes fillRow1Dark {
                      0%, 5% { background-color: rgb(51 65 85); border-color: rgb(71 85 105); }
                      15%, 100% { background-color: rgb(245 158 11); border-color: rgb(217 119 6); }
                    }
                    .box-fill-1 { animation: fillRow1Dark 4s ease-in-out infinite; }
                    .box-fill-2 { animation: fillRow1Dark 4s ease-in-out infinite 0.2s; }
                    .box-fill-3 { animation: fillRow1Dark 4s ease-in-out infinite 0.4s; }
                    .box-fill-4 { animation: fillRow1Dark 4s ease-in-out infinite 0.6s; }
                  }
                  @media (prefers-color-scheme: light) {
                    .box-fill-1 { animation: fillRow1 4s ease-in-out infinite; }
                    .box-fill-2 { animation: fillRow1 4s ease-in-out infinite 0.2s; }
                    .box-fill-3 { animation: fillRow1 4s ease-in-out infinite 0.4s; }
                    .box-fill-4 { animation: fillRow1 4s ease-in-out infinite 0.6s; }
                  }
                `}</style>
                
                {/* Header Labels (24-Hour Time) */}
                <div className="flex w-full max-w-[300px] mb-2 pl-12 justify-between text-xs font-bold text-slate-400">
                  <span>00:00 (Midnight)</span>
                  <span>03:00 (3 AM)</span>
                </div>

                <div className="relative w-full max-w-[300px] flex flex-col gap-2">
                  {/* Row 1 - Monday */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-sm font-bold text-slate-500">Mon</span>
                    <div className="flex gap-1 relative z-0">
                      <div className="w-10 h-8 rounded shrink-0 box-fill-1 bg-gray-100 border border-gray-200 dark:bg-slate-700 dark:border-slate-600"></div>
                      <div className="w-10 h-8 rounded shrink-0 box-fill-2 bg-gray-100 border border-gray-200 dark:bg-slate-700 dark:border-slate-600"></div>
                      <div className="w-10 h-8 rounded shrink-0 box-fill-3 bg-gray-100 border border-gray-200 dark:bg-slate-700 dark:border-slate-600"></div>
                      <div className="w-10 h-8 rounded shrink-0 box-fill-4 bg-gray-100 border border-gray-200 dark:bg-slate-700 dark:border-slate-600"></div>
                    </div>
                  </div>
                  {/* Row 2 - Tuesday */}
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-sm font-bold text-slate-500">Tue</span>
                    <div className="flex gap-1">
                      <div className="w-10 h-8 rounded shrink-0 bg-gray-100 border border-gray-200 dark:bg-slate-700 dark:border-slate-600"></div>
                      <div className="w-10 h-8 rounded shrink-0 bg-gray-100 border border-gray-200 dark:bg-slate-700 dark:border-slate-600"></div>
                      <div className="w-10 h-8 rounded shrink-0 bg-amber-500 border border-amber-600"></div>
                      <div className="w-10 h-8 rounded shrink-0 bg-amber-500 border border-amber-600"></div>
                    </div>
                  </div>

                  {/* Dragging Hand Icon Cursor */}
                  <div className="absolute top-4 left-10 text-slate-800 dark:text-white drop-shadow-lg z-20 pointer-events-none animate-hand-swipe select-none">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="white" strokeWidth="1.5">
                      <path d="M12 2C11.5 2 11 2.5 11 3V11H9.9C8.3 11 7 12.3 7 13.9C7 14.4 7.2 14.8 7.5 15.2L12.5 21.6C12.8 21.9 13.2 22 13.6 22H18C19.1 22 20 21.1 20 20V14.1C20 13.4 19.6 12.8 19 12.5V5C19 4.5 18.5 4 18 4H17V3C17 2.5 16.5 2 16 2H12Z"/>
                    </svg>
                  </div>
                </div>

              </div>

              {/* Explanations */}
              <div className="space-y-6">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl p-4">
                  <h4 className="font-bold text-amber-800 dark:text-amber-300 mb-2">
                    {t('scheduleModalImportantTitle')}
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900/90 dark:text-amber-200/90">
                    <li>{t('scheduleModalImportantLine1')}</li>
                    <li>{t('scheduleModalImportantLine2')}</li>
                  </ul>
                </div>
                
                {/* Visual Instructions */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                  
                  <div className="p-4 flex gap-4 items-start">
                    <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">1</div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('scheduleModalStep1Title')}</h4>
                      <p className="text-slate-600 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: t('scheduleModalStep1Desc') }}></p>
                    </div>
                  </div>

                  <div className="p-4 flex gap-4 items-start">
                    <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">2</div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('scheduleModalStep2Title')}</h4>
                      <p className="text-slate-600 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: t('scheduleModalStep2Desc') }}></p>
                    </div>
                  </div>

                  <div className="p-4 flex gap-4 items-start">
                    <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">3</div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white mb-1">{t('scheduleModalStep3Title')}</h4>
                      <p className="text-slate-600 dark:text-slate-400" dangerouslySetInnerHTML={{ __html: t('scheduleModalStep3Desc') }}></p>
                    </div>
                  </div>

                </div>

              </div>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-100 dark:border-slate-700/50 flex justify-end shrink-0">
              <button 
                onClick={() => setShowInfo(false)}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shadow-md shadow-amber-500/20"
              >
                {t('modalBtnGotIt')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
