import Swal, { SweetAlertIcon } from 'sweetalert2';

// Browser Push Notifications
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

export const showPushNotification = (title: string, options?: NotificationOptions) => {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, options);
      }
    });
  }
};

// Toast Notification
export const showToast = (title: string, icon: SweetAlertIcon = 'info') => {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });

  return Toast.fire({
    icon,
    title
  });
};

// Lightweight helpers to keep SweetAlert usage consistent across pages.
export const confirmAction = async (options: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: SweetAlertIcon;
}) => {
  const result = await Swal.fire({
    title: options.title,
    text: options.text,
    icon: options.icon || 'question',
    showCancelButton: true,
    confirmButtonText: options.confirmText || 'Yes',
    cancelButtonText: options.cancelText || 'Cancel',
    confirmButtonColor: '#4f46e5',
    cancelButtonColor: '#94a3b8',
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
};

export const showError = (title: string, text?: string) =>
  Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonColor: '#ef4444',
  });

export const showSuccess = (title: string, text?: string) =>
  Swal.fire({
    icon: 'success',
    title,
    text,
    timer: 1800,
    showConfirmButton: false,
  });

export const showInfo = (title: string, text?: string) =>
  Swal.fire({
    icon: 'info',
    title,
    text,
    confirmButtonColor: '#0ea5e9',
  });

// Fetch task-related LLM recommendations and trigger push notification
export const checkAndNotifyLLMTasks = async (apiInstance: any) => {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    // First fetch some task context
    const tasksRes = await apiInstance.get('/api/tasks');
    const tasks = tasksRes.data;

    // Filter pending/unfinished tasks
    const unfinished = tasks.filter((t: any) => t.status === 'pending');
    if (unfinished.length === 0) return; // No need to disturb if all clear

    // Send context to the LLM advisor push API
    const llmRes = await apiInstance.post('/api/advisory/task-push-notification', {
      tasks: unfinished.slice(0, 10).map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        pen_id: t.pen_id,
        priority: t.priority
      }))
    });

    const { title, body } = llmRes.data;

    if (title && body) {
      showPushNotification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'task-reminder'
      });
    }
  } catch (error) {
    console.error('Failed to trigger LLM task push notification:', error);
  }
};
