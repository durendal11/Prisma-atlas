import Swal, { SweetAlertIcon } from 'sweetalert2';

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
