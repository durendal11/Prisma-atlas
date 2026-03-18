import { format } from 'date-fns';
import { 
  Eye, 
  Activity, 
  Utensils, 
  Heart,
  Settings,
  FileText
} from 'lucide-react';
import type { Event } from '@/types';
import clsx from 'clsx';

interface EventListItemProps {
  event: Event;
}

const typeIcons: Record<string, React.ElementType> = {
  detection: Eye,
  posture_change: Activity,
  farrowing: Heart,
  feeding: Utensils,
  health_check: Heart,
  system: Settings,
  manual_entry: FileText,
};

const categoryColors: Record<string, string> = {
  ai_detection: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
  manual_entry: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  automated: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  system: 'bg-gray-100 dark:bg-slate-700/50 text-gray-700 dark:text-slate-400',
};

export default function EventListItem({ event }: EventListItemProps) {
  const Icon = typeIcons[event.type] || FileText;

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-slate-700/30 rounded-lg transition-all duration-200 group">
      <div className="p-2 bg-gray-100 dark:bg-slate-700/50 rounded-lg group-hover:scale-110 transition-transform duration-200">
        <Icon className="h-4 w-4 text-gray-600 dark:text-slate-400" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
            {event.type.replace('_', ' ')}
          </span>
          {event.category && (
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full font-medium capitalize transition-transform duration-200 hover:scale-105',
              categoryColors[event.category] || 'bg-gray-100 dark:bg-slate-700/50 text-gray-700 dark:text-slate-400'
            )}>
              {event.category.replace('_', ' ')}
            </span>
          )}
        </div>
        
        {event.description && (
          <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400 line-clamp-2">
            {event.description}
          </p>
        )}
        
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500">
          <span>{format(new Date(event.created_at), 'MMM d, HH:mm:ss')}</span>
          {event.pen_id && <span>Pen {event.pen_id}</span>}
          {event.sow_id && <span>Sow #{event.sow_id}</span>}
        </div>
      </div>
    </div>
  );
}
