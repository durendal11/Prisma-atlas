import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { confirmAction, showError, checkAndNotifyLLMTasks } from '@/utils/alerts';
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  UserCircleIcon,
  CalendarDaysIcon,
  PlayIcon,
  SparklesIcon,
  BeakerIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';

interface ChecklistItem {
  step: string;
  required: boolean;
  completed: boolean;
}

interface Task {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to?: number;
  assigned_to_name?: string;
  due_date?: string;
  checklist_items?: ChecklistItem[];
  checklist_progress?: number; // percentage 0-100
  completion_notes?: string;
  sow_id?: number;
  pen_id?: number;
  created_at: string;
  completed_at?: string;
}

interface TaskSummary {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  due_today: number;
}

interface TaskTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  priority: string;
  estimated_duration_minutes: number;
  checklist_items: (ChecklistItem | string)[];
  trigger_type?: string;
}

interface CleaningScheduleItem {
  pen_id: number;
  pen_name: string;
  cleanliness_score: number;
  wetness_score: number;
  last_cleaned_at: string | null;
  next_cleaning_due: string | null;
  cleaning_interval_hours: number;
  status: 'overdue' | 'due_soon' | 'ok';
  is_overdue: boolean;
}

const priorityColors = {
  low: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
};

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
};

const categoryIcons: Record<string, string> = {
  farrowing: '🐷',
  health: '💊',
  feeding: '🌾',
  cleaning: '🧹',
  maintenance: '🔧',
  breeding: '💕',
  weighing: '⚖️',
  processing: '✂️',
};

export default function TasksPage() {
  // const { t } = useTranslation();
  const api = useApi();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [checklistUpdates, setChecklistUpdates] = useState<Record<number, boolean[]>>({});
  const [cleaningSchedule, setCleaningSchedule] = useState<CleaningScheduleItem[]>([]);
  const [showCleaningSuggestions, setShowCleaningSuggestions] = useState(true);
  const [recentlyDeleted, setRecentlyDeleted] = useState<{ task: Task; timerId: number } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Task creation state
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    category: 'cleaning',
    priority: 'medium',
    pen_id: '',
    sow_id: '',
    due_date: '',
    checklist_items: [] as ChecklistItem[]
  });
  const [pens, setPens] = useState<{id: number, name: string}[]>([]);
  const [sows, setSows] = useState<{id: number, name: string, tag_id: string}[]>([]);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    loadTasks();
    loadSummary();
    loadCleaningSchedule();
    loadTemplates();
    loadPens();
    loadSows();

    // Trigger LLM to generate an intelligent push notification regarding tasks
    checkAndNotifyLLMTasks(api);
  }, [filter]);

  const loadTasks = async () => {
    try {
      let url = '/api/tasks/';
      if (filter === 'my') {
        url = '/api/tasks/my-tasks';
      } else if (filter !== 'all') {
        url = `/api/tasks/?status=${filter}`;
      }
      
      const response = await api.get(url);
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await api.get('/api/tasks/dashboard-summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  const loadCleaningSchedule = async () => {
    try {
      const response = await api.get('/api/tasks/cleaning-schedule');
      setCleaningSchedule(response.data.schedule || []);
    } catch (error) {
      console.error('Failed to load cleaning schedule:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/api/tasks/templates/');
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadPens = async () => {
    try {
      const response = await api.get('/api/pens');
      setPens(response.data.map((pen: any) => ({ id: pen.id, name: pen.name })));
    } catch (error) {
      console.error('Failed to load pens:', error);
    }
  };

  const loadSows = async () => {
    try {
      const response = await api.get('/api/sows');
      setSows(response.data.map((sow: any) => ({ id: sow.id, name: sow.name, tag_id: sow.tag_id })));
    } catch (error) {
      console.error('Failed to load sows:', error);
    }
  };

  const selectTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    // Convert string checklist items to ChecklistItem objects if needed
    const checklistItems = (template.checklist_items || []).map((item: any) => {
      if (typeof item === 'string') {
        return { step: item, required: true, completed: false };
      }
      return { step: item.step || '', required: item.required ?? true, completed: false };
    });
    
    setNewTask({
      title: template.name,
      description: template.description,
      category: template.category,
      priority: template.priority,
      pen_id: '',
      sow_id: '',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      checklist_items: checklistItems
    });
  };

  const resetTaskForm = () => {
    setSelectedTemplate(null);
    setNewTask({
      title: '',
      description: '',
      category: 'cleaning',
      priority: 'medium',
      pen_id: '',
      sow_id: '',
      due_date: '',
      checklist_items: []
    });
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      showError('Missing title', 'Please enter a task title before creating the task.');
      return;
    }

    setCreatingTask(true);
    try {
      const taskData: any = {
        title: newTask.title,
        description: newTask.description,
        category: newTask.category,
        priority: newTask.priority,
        checklist_items: newTask.checklist_items.map(item => ({
          ...item,
          completed: false
        }))
      };

      if (newTask.pen_id) taskData.pen_id = parseInt(newTask.pen_id);
      if (newTask.sow_id) taskData.sow_id = parseInt(newTask.sow_id);
      if (newTask.due_date) taskData.due_date = new Date(newTask.due_date).toISOString();
      if (selectedTemplate && selectedTemplate.id > 0) taskData.template_id = selectedTemplate.id;

      await api.post('/api/tasks/', taskData);
      
      setShowNewTaskModal(false);
      resetTaskForm();
      loadTasks();
      loadSummary();
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('Failed to create task. Please try again.');
    } finally {
      setCreatingTask(false);
    }
  };

  const addChecklistItem = () => {
    setNewTask(prev => ({
      ...prev,
      checklist_items: [...prev.checklist_items, { step: '', required: false, completed: false }]
    }));
  };

  const updateChecklistItem = (index: number, field: string, value: any) => {
    setNewTask(prev => ({
      ...prev,
      checklist_items: prev.checklist_items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const removeChecklistItem = (index: number) => {
    setNewTask(prev => ({
      ...prev,
      checklist_items: prev.checklist_items.filter((_, i) => i !== index)
    }));
  };

  const createCleaningTask = async (penId: number) => {
    try {
      await api.post(`/api/tasks/cleaning-schedule/${penId}/create-task`);
      loadTasks();
      loadSummary();
      loadCleaningSchedule();
    } catch (error) {
      console.error('Failed to create cleaning task:', error);
    }
  };

  const markPenCleaned = async (penId: number) => {
    try {
      await api.post(`/api/tasks/cleaning-schedule/${penId}/mark-cleaned`);
      loadCleaningSchedule();
    } catch (error) {
      console.error('Failed to mark pen as cleaned:', error);
    }
  };

  const startTask = async (taskId: number) => {
    try {
      await api.post(`/api/tasks/${taskId}/start`);
      loadTasks();
      loadSummary();
    } catch (error) {
      console.error('Failed to start task:', error);
    }
  };

  const deleteTask = async (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const confirmed = await confirmAction({
      title: 'Delete this task?',
      text: 'You can undo for a short time after deleting.',
      confirmText: 'Delete',
      cancelText: 'Keep task',
      icon: 'warning',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/api/tasks/${taskId}`);
      const timerId = window.setTimeout(() => setRecentlyDeleted(null), 8000);
      setRecentlyDeleted({ task, timerId });
      setTasks(prev => prev.filter(t => t.id !== taskId));
      loadSummary();
      setDeleteError(null);

      try {
        await api.post('/api/events', {
          type: 'system',
          category: 'manual_entry',
          description: `Task deleted: ${task.title}`,
          sow_id: task.sow_id,
          pen_id: task.pen_id,
        });
      } catch (eventError) {
        console.warn('Task deleted but event log failed:', eventError);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      setDeleteError('Failed to delete task. Please try again.');
    }
  };

  const undoDelete = async () => {
    if (!recentlyDeleted) return;
    const { task, timerId } = recentlyDeleted;
    window.clearTimeout(timerId);

    try {
      await api.post('/api/tasks/', {
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        assigned_to: task.assigned_to,
        sow_id: task.sow_id,
        pen_id: task.pen_id,
        due_date: task.due_date,
        checklist_items: task.checklist_items,
        completion_notes: task.completion_notes,
      });
      setRecentlyDeleted(null);
      setDeleteError(null);
      loadTasks();
      loadSummary();

      try {
        await api.post('/api/events', {
          type: 'system',
          category: 'manual_entry',
          description: `Task restored: ${task.title}`,
          sow_id: task.sow_id,
          pen_id: task.pen_id,
        });
      } catch (eventError) {
        console.warn('Task restored but event log failed:', eventError);
      }
    } catch (error) {
      console.error('Failed to undo delete:', error);
      setDeleteError('Failed to undo delete. Please try again.');
    }
  };

  const completeTask = async (taskId: number) => {
    try {
      await api.post(`/api/tasks/${taskId}/complete`);
      loadTasks();
      loadSummary();
    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  const toggleChecklistItem = async (taskId: number, index: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Build progress array from checklist_items if not already tracked
    const currentProgress = checklistUpdates[taskId] || 
      task.checklist_items?.map((item: ChecklistItem) => item.completed) || [];
    const newProgress = [...currentProgress];
    newProgress[index] = !newProgress[index];
    
    setChecklistUpdates(prev => ({ ...prev, [taskId]: newProgress }));

    try {
      // Update checklist_items with completed status
      const updatedItems = task.checklist_items?.map((item: ChecklistItem, i: number) => ({
        ...item,
        completed: newProgress[i] || false
      }));
      
      await api.put(`/api/tasks/${taskId}`, {
        checklist_items: updatedItems
      });
      loadTasks();
    } catch (error) {
      console.error('Failed to update checklist:', error);
    }
  };

  const toggleExpanded = (taskId: number) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(task => 
        (task.title || '').toLowerCase().includes(query) ||
        (task.description || '').toLowerCase().includes(query) ||
        (task.category || '').toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const isOverdue = (task: Task) => {
    if (!task.due_date || task.status === 'completed') return false;
    return new Date(task.due_date) < new Date();
  };

  const isDueToday = (task: Task) => {
    if (!task.due_date || task.status === 'completed') return false;
    const today = new Date().toDateString();
    return new Date(task.due_date).toDateString() === today;
  };

  const formatDueDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due in ${diffDays} days`;
  };

  const filteredTasks = getFilteredTasks();

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Hero Header */}
      <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-400 dark:from-indigo-800 dark:via-indigo-700 dark:to-purple-600">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 800 160" preserveAspectRatio="none">
            <circle cx="700" cy="20" r="110" fill="white" />
            <circle cx="80" cy="140" r="50" fill="white" />
          </svg>
        </div>
        <div className="relative px-5 sm:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Task Management</h1>
              <p className="text-white/70 text-sm">Manage farm tasks and farrowing care</p>
            </div>
            <button
              onClick={() => setShowNewTaskModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
            >
              <PlusIcon className="w-5 h-5" />
              New Task
            </button>
          </div>
        </div>
      </div>

      {deleteError && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 shadow-sm dark:border-red-800/50 dark:bg-red-900/20">
          <ExclamationTriangleIcon className="h-5 w-5" />
          <span className="flex-1 text-sm font-medium">{deleteError}</span>
          <button onClick={() => setDeleteError(null)} aria-label="Dismiss delete error" className="text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-200">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {recentlyDeleted && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-100">
          <span className="flex-1 text-sm">
            Task "{recentlyDeleted.task.title}" deleted.
          </span>
          <button
            onClick={undoDelete}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            Undo
          </button>
          <button
            onClick={() => {
              window.clearTimeout(recentlyDeleted.timerId);
              setRecentlyDeleted(null);
            }}
            aria-label="Dismiss undo"
            className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl shadow-sm border border-gray-200/60 dark:border-slate-700/50 hover:shadow-md transition-all duration-200 group">
            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-xs mb-1">
              <ClockIcon className="w-4 h-4 group-hover:animate-pulse" />
              Pending
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.pending}</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl shadow-sm border border-gray-200/60 dark:border-slate-700/50 hover:shadow-md transition-all duration-200 group">
            <div className="flex items-center gap-2 text-blue-500 dark:text-blue-400 text-xs mb-1">
              <PlayIcon className="w-4 h-4 group-hover:animate-pulse" />
              In Progress
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.in_progress}</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl shadow-sm border border-gray-200/60 dark:border-slate-700/50 hover:shadow-md transition-all duration-200 group">
            <div className="flex items-center gap-2 text-green-500 dark:text-green-400 text-xs mb-1">
              <CheckCircleIcon className="w-4 h-4 group-hover:animate-pulse" />
              Completed
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.completed}</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl shadow-sm border border-gray-200/60 dark:border-slate-700/50 hover:shadow-md transition-all duration-200 group">
            <div className="flex items-center gap-2 text-orange-500 dark:text-orange-400 text-xs mb-1">
              <CalendarDaysIcon className="w-4 h-4 group-hover:animate-pulse" />
              Due Today
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.due_today}</div>
          </div>
          
          <div className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl shadow-sm border border-gray-200/60 dark:border-slate-700/50 hover:shadow-md transition-all duration-200 group">
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-xs mb-1">
              <ExclamationTriangleIcon className="w-4 h-4 group-hover:animate-pulse" />
              Overdue
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.overdue}</div>
          </div>
        </div>
      )}

      {/* Cleaning Suggestions Section */}
      {cleaningSchedule.filter(item => item.status !== 'ok').length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl border border-amber-200/60 dark:border-amber-700/50 overflow-hidden shadow-sm">
          <button
            onClick={() => setShowCleaningSuggestions(!showCleaningSuggestions)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-800/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-800/50 rounded-xl">
                <SparklesIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">Cleaning Suggestions</h3>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {cleaningSchedule.filter(item => item.is_overdue).length} overdue · {cleaningSchedule.filter(item => item.status === 'due_soon').length} due soon
                </p>
              </div>
            </div>
            <ChevronDownIcon className={`w-5 h-5 text-amber-600 dark:text-amber-400 transition-transform duration-300 ${showCleaningSuggestions ? 'rotate-180' : ''}`} />
          </button>
          
          {showCleaningSuggestions && (
            <div className="px-5 pb-4 space-y-3 max-h-[26rem] overflow-y-auto">
              {cleaningSchedule
                .filter(item => item.status !== 'ok')
                .sort((a, b) => (a.is_overdue === b.is_overdue ? 0 : a.is_overdue ? -1 : 1))
                .map((item) => (
                  <div
                    key={item.pen_id}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
                      item.is_overdue
                        ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50'
                        : 'bg-amber-100 dark:bg-amber-800/30 border border-amber-200 dark:border-amber-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${item.is_overdue ? 'bg-red-200 dark:bg-red-800/50' : 'bg-amber-200 dark:bg-amber-700/50'}`}>
                        <BeakerIcon className={`w-5 h-5 ${item.is_overdue ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{item.pen_name}</h4>
                        <div className="flex items-center gap-3 text-sm mt-1">
                          <span className={`${item.cleanliness_score < 0.5 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-slate-400'}`}>
                            Cleanliness: {Math.round(item.cleanliness_score * 100)}%
                          </span>
                          <span className="text-gray-400 dark:text-slate-600">|</span>
                          <span className={`${item.wetness_score > 0.5 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-slate-400'}`}>
                            Wetness: {Math.round(item.wetness_score * 100)}%
                          </span>
                        </div>
                        {item.next_cleaning_due && (
                          <p className={`text-xs mt-1 ${item.is_overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-amber-700 dark:text-amber-400'}`}>
                            {item.is_overdue ? 'Overdue since: ' : 'Due: '}
                            {new Date(item.next_cleaning_due).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markPenCleaned(item.pen_id)}
                        className="px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded-lg hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors"
                      >
                        Mark Clean
                      </button>
                      <button
                        onClick={() => createCleaningTask(item.pen_id)}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-sm hover:shadow transition-all"
                      >
                        Create Task
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200/60 dark:border-slate-700/50 p-1">
          {['all', 'my', 'pending', 'in_progress', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                filter === f
                  ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'my' ? 'My Tasks' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
        
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800/60 border border-gray-200/60 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400"></div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50">
            <ClipboardDocumentListIcon className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400">No tasks found</p>
          </div>
        ) : (
          filteredTasks.map((task, index) => {
            const isExpanded = expandedTasks.has(task.id);
            const overdue = isOverdue(task);
            const dueToday = isDueToday(task);
            const checklistItems = task.checklist_items || [];
            const completedCount = checklistUpdates[task.id] 
              ? checklistUpdates[task.id].filter(Boolean).length 
              : checklistItems.filter((item: ChecklistItem) => item.completed).length;
            const totalItems = checklistItems.length;
            
            return (
              <div
                key={task.id}
                style={{ animationDelay: `${index * 50}ms` }}
                className={`bg-white dark:bg-slate-800/60 rounded-2xl border animate-fade-in-up transition-all duration-200 hover:shadow-md ${
                  overdue ? 'border-red-200 dark:border-red-700/50 bg-red-50/50 dark:bg-red-900/20' : 
                  dueToday ? 'border-orange-200 dark:border-orange-700/50 bg-orange-50/50 dark:bg-orange-900/20' : 
                  'border-gray-200/60 dark:border-slate-700/50'
                } overflow-hidden shadow-sm`}
              >
                {/* Task Header */}
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-all duration-200"
                  onClick={() => toggleExpanded(task.id)}
                >
                  <div className="flex items-start gap-3">
                    <button className="mt-1 text-gray-400 dark:text-slate-500 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(0deg)' }}>
                      {isExpanded ? (
                        <ChevronDownIcon className="w-5 h-5 transition-transform duration-200" />
                      ) : (
                        <ChevronRightIcon className="w-5 h-5 transition-transform duration-200" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{categoryIcons[task.category] || '📋'}</span>
                        <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
                          {task.priority}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status as keyof typeof statusColors]}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      {task.description && (
                        <p className="text-gray-600 text-sm truncate">{task.description}</p>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {task.due_date && (
                          <span className={overdue ? 'text-red-600 font-medium' : dueToday ? 'text-orange-600 font-medium' : ''}>
                            {formatDueDate(task.due_date)}
                          </span>
                        )}
                        {task.assigned_to_name && (
                          <span className="flex items-center gap-1">
                            <UserCircleIcon className="w-4 h-4" />
                            {task.assigned_to_name}
                          </span>
                        )}
                        {totalItems > 0 && (
                          <span className="flex items-center gap-1">
                            <CheckCircleIcon className="w-4 h-4" />
                            {completedCount}/{totalItems} items
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {task.status === 'pending' && (
                        <button
                          onClick={() => startTask(task.id)}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                        >
                          Start
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <button
                          onClick={() => completeTask(task.id)}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                        >
                          Complete
                        </button>
                      )}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                      >
                        <TrashIcon className="mr-1 inline h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Expanded Checklist */}
                {isExpanded && task.checklist_items && task.checklist_items.length > 0 && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-800/30">
                    <div className="pt-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Checklist</h4>
                      <div className="space-y-2 max-h-[13rem] overflow-y-auto pr-1">
                        {task.checklist_items.map((item: ChecklistItem, index: number) => {
                          const progressArray = checklistUpdates[task.id] || 
                            (task.checklist_items || []).map((i: ChecklistItem) => i.completed);
                          const isChecked = progressArray[index] || false;
                          return (
                            <label
                              key={index}
                              className="flex items-center gap-3 cursor-pointer group"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => toggleChecklistItem(task.id, index)}
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  isChecked 
                                    ? 'bg-green-500 border-green-500' 
                                    : 'border-gray-300 dark:border-slate-600 group-hover:border-green-400'
                                }`}
                              >
                                {isChecked && (
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                              <span className={`text-sm ${isChecked ? 'text-gray-400 dark:text-slate-500 line-through' : 'text-gray-700 dark:text-slate-300'}`}>
                                {item.step}
                                {item.required && <span className="text-red-500 ml-1">*</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      
                      {/* Progress Bar */}
                      {totalItems > 0 && (
                        <div className="mt-3">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 transition-all duration-300"
                              style={{ width: `${(completedCount / totalItems) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {Math.round((completedCount / totalItems) * 100)}% complete
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-800/50 rounded-xl">
                  <PlusIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Task</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {selectedTemplate ? `Using template: ${selectedTemplate.name}` : 'Select a template or create custom'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowNewTaskModal(false); resetTaskForm(); }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Template Selection */}
              {!selectedTemplate && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Templates</h3>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {templates.length > 0 ? templates.slice(0, 8).map((template) => (
                      <button
                        key={template.id}
                        onClick={() => selectTemplate(template)}
                        className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">{categoryIcons[template.category] || '📋'}</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-300">{template.name}</h4>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shadow-sm ${priorityColors[template.priority as keyof typeof priorityColors]}`}>
                              {template.priority}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-slate-300 line-clamp-2">{template.description}</p>
                      </button>
                    )) : (
                      // Default built-in templates if none from API
                      <>
                        <button
                          onClick={() => selectTemplate({
                            id: 0, name: 'Clean Pen', description: 'Clean and sanitize a pen',
                            category: 'cleaning', priority: 'medium', estimated_duration_minutes: 45,
                            checklist_items: [
                              { step: 'Remove soiled bedding', required: true, completed: false },
                              { step: 'Clean floor and walls', required: true, completed: false },
                              { step: 'Disinfect surfaces', required: true, completed: false },
                              { step: 'Add fresh bedding', required: true, completed: false },
                              { step: 'Check water supply', required: true, completed: false }
                            ]
                          })}
                          className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🧹</span>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600">Clean Pen</h4>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">medium</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-300">Clean and sanitize a pen</p>
                        </button>

                        <button
                          onClick={() => selectTemplate({
                            id: 0, name: 'Assist Farrowing', description: 'Assist sow during farrowing',
                            category: 'farrowing', priority: 'critical', estimated_duration_minutes: 120,
                            checklist_items: [
                              { step: 'Monitor sow every 30 minutes', required: true, completed: false },
                              { step: 'Assist if piglet stuck', required: true, completed: false },
                              { step: 'Keep piglets warm under heat lamp', required: true, completed: false },
                              { step: 'Ensure piglets nursing', required: true, completed: false },
                              { step: 'Record birth time of each piglet', required: false, completed: false }
                            ]
                          })}
                          className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🐷</span>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600">Assist Farrowing</h4>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">critical</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-300">Assist sow during farrowing</p>
                        </button>

                        <button
                          onClick={() => selectTemplate({
                            id: 0, name: 'Piglet Care', description: 'Daily piglet health check and care',
                            category: 'farrowing', priority: 'high', estimated_duration_minutes: 60,
                            checklist_items: [
                              { step: 'Count and record piglet numbers', required: true, completed: false },
                              { step: 'Check all piglets are nursing', required: true, completed: false },
                              { step: 'Identify weak piglets', required: true, completed: false },
                              { step: 'Check sow milk production', required: true, completed: false },
                              { step: 'Cross-foster if needed', required: false, completed: false }
                            ]
                          })}
                          className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🐽</span>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600">Piglet Care</h4>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">high</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-300">Daily piglet health check and care</p>
                        </button>

                        <button
                          onClick={() => selectTemplate({
                            id: 0, name: 'Health Check', description: 'Perform health inspection on sow',
                            category: 'health', priority: 'high', estimated_duration_minutes: 30,
                            checklist_items: [
                              { step: 'Check body temperature', required: true, completed: false },
                              { step: 'Inspect udder for issues', required: true, completed: false },
                              { step: 'Check feed intake', required: true, completed: false },
                              { step: 'Record body condition score', required: true, completed: false },
                              { step: 'Administer medication if needed', required: false, completed: false }
                            ]
                          })}
                          className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🩺</span>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600">Health Check</h4>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">high</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-300">Perform health inspection on sow</p>
                        </button>

                        <button
                          onClick={() => selectTemplate({
                            id: 0, name: 'Feed & Water Check', description: 'Check and refill feed and water',
                            category: 'feeding', priority: 'medium', estimated_duration_minutes: 20,
                            checklist_items: [
                              { step: 'Check feed levels', required: true, completed: false },
                              { step: 'Refill feed if needed', required: true, completed: false },
                              { step: 'Check water nipples', required: true, completed: false },
                              { step: 'Clean feed troughs', required: false, completed: false }
                            ]
                          })}
                          className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🍽️</span>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600">Feed & Water</h4>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">medium</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-300">Check and refill feed and water</p>
                        </button>

                        <button
                          onClick={() => selectTemplate({
                            id: 0, name: 'Piglet Processing', description: 'Standard piglet processing procedures',
                            category: 'processing', priority: 'high', estimated_duration_minutes: 90,
                            checklist_items: [
                              { step: 'Clip needle teeth', required: true, completed: false },
                              { step: 'Dock tails', required: true, completed: false },
                              { step: 'Iron injection', required: true, completed: false },
                              { step: 'Ear notch or tag', required: true, completed: false },
                              { step: 'Record all processing', required: true, completed: false }
                            ]
                          })}
                          className="p-4 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 rounded-xl text-left transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(79,70,229,0.45)] hover:border-indigo-200 dark:hover:border-indigo-600/60"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">✂️</span>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600">Piglet Processing</h4>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">high</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-300">Standard piglet processing</p>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700"></div>
                    <span className="text-sm text-gray-500 dark:text-slate-400">or create custom task</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700"></div>
                  </div>

                  <button
                    onClick={() => setSelectedTemplate({ id: -1, name: 'Custom Task', description: '', category: 'other', priority: 'medium', estimated_duration_minutes: 30, checklist_items: [] })}
                    className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Create Custom Task
                  </button>
                </div>
              )}

              {/* Task Form */}
              {selectedTemplate && (
                <div className="p-6 space-y-4">
                  <button
                    onClick={resetTaskForm}
                    className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                    Back to templates
                  </button>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Task Title *</label>
                    <input
                      type="text"
                      value={newTask.title}
                      onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white"
                      placeholder="Enter task title"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Description</label>
                    <textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
                      placeholder="Enter task description"
                    />
                  </div>

                  {/* Category & Priority */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Category</label>
                      <select
                        value={newTask.category}
                        onChange={(e) => setNewTask(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white"
                      >
                        <option value="cleaning">🧹 Cleaning</option>
                        <option value="farrowing">🐷 Farrowing</option>
                        <option value="health">🩺 Health</option>
                        <option value="feeding">🍽️ Feeding</option>
                        <option value="processing">✂️ Processing</option>
                        <option value="weighing">⚖️ Weighing</option>
                        <option value="other">📋 Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Priority</label>
                      <select
                        value={newTask.priority}
                        onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  {/* Pen & Sow */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Pen (Optional)</label>
                      <select
                        value={newTask.pen_id}
                        onChange={(e) => setNewTask(prev => ({ ...prev, pen_id: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white"
                      >
                        <option value="">Select pen...</option>
                        {pens.map(pen => (
                          <option key={pen.id} value={pen.id}>{pen.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Sow (Optional)</label>
                      <select
                        value={newTask.sow_id}
                        onChange={(e) => setNewTask(prev => ({ ...prev, sow_id: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white"
                      >
                        <option value="">Select sow...</option>
                        {sows.map(sow => (
                          <option key={sow.id} value={sow.id}>{sow.name || sow.tag_id}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask(prev => ({ ...prev, due_date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 dark:text-white"
                    />
                  </div>

                  {/* Checklist */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Checklist Items</label>
                      <button
                        onClick={addChecklistItem}
                        className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Add Item
                      </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {newTask.checklist_items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(e) => updateChecklistItem(index, 'required', e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                            title="Required"
                          />
                          <input
                            type="text"
                            value={item.step}
                            onChange={(e) => updateChecklistItem(index, 'step', e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 rounded-lg text-sm text-gray-900 dark:text-white"
                            placeholder="Checklist item..."
                          />
                          <button
                            onClick={() => removeChecklistItem(index)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {newTask.checklist_items.length === 0 && (
                        <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-4">No checklist items. Click "Add Item" to add steps.</p>
                      )}
                    </div>
                    {newTask.checklist_items.length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">✓ = Required item</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {selectedTemplate && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-end gap-3">
                <button
                  onClick={() => { setShowNewTaskModal(false); resetTaskForm(); }}
                  className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={creatingTask || !newTask.title.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creatingTask ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-5 h-5" />
                      Create Task
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
