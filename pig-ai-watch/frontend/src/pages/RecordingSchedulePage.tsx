import { useState, useEffect } from 'react';
import { Save, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { recordingApi, pensApi } from '@/api';

// mode mappings
type RecMode = 'off' | 'detection';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function RecordingSchedulePage() {
  const [pens, setPens] = useState<any[]>([]);
  const [selectedPen, setSelectedPen] = useState<number | null>(null);
  
  // 168 cells: index = day * 24 + hour
  const [schedule, setSchedule] = useState<RecMode[]>(Array(168).fill('off'));
  
  const [activeMode, setActiveMode] = useState<RecMode>('detection');
  const [isDragging, setIsDragging] = useState(false);

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
    <div className="p-6 max-w-7xl mx-auto touch-none">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary-500" />
          Recording Schedule
        </h1>
        
        <div className="flex gap-4 items-center">
          <select
            value={selectedPen || ''}
            onChange={(e) => setSelectedPen(Number(e.target.value))}
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
          <div className="min-w-fit">
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
                  let bgColor = 'bg-gray-100 dark:bg-slate-700'; // off
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
        </div>
        
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-6 mt-4">
          Click and drag to apply the selected recording mode to the schedule grid. Time is based on the local edge device clock.
        </p>
      </div>
    </div>
  );
}
