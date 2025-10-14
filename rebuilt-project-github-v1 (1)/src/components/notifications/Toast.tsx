import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, InformationCircleIcon, ExclamationTriangleIcon, XMarkIcon, BellAlertIcon, BriefcaseIcon, CalendarDaysIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { Toast as ToastObject, useNotifications, ToastType } from '../../contexts/NotificationContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface ToastProps {
  toast: ToastObject;
  onRemove: (id: number) => void;
}

const TOAST_ICONS: Record<string, React.ElementType> = {
    new_task: ClipboardDocumentListIcon,
    new_visit: BriefcaseIcon,
    new_appointment: CalendarDaysIcon,
    generic: BellAlertIcon,
    success: CheckCircleIcon,
    error: ExclamationTriangleIcon,
    info: InformationCircleIcon
};

const ICON_COLORS: Record<string, string> = {
    success: 'text-green-500',
    error: 'text-red-500',
    info: 'text-blue-500',
    default: 'text-primary-500'
};


const Toast: React.FC<ToastProps> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 300); // Wait for animation
    }, 5000); // 5 seconds

    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);
  
  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const Icon = TOAST_ICONS[toast.type] || BellAlertIcon;
  const colorClass = ICON_COLORS[toast.type as keyof typeof ICON_COLORS] || ICON_COLORS.default;

  return (
    <div
      className={`max-w-sm w-full bg-white dark:bg-slate-800 shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden transition-all duration-300 ease-in-out ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon className={`h-6 w-6 ${colorClass}`} aria-hidden="true" />
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{toast.title}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{toast.body}</p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={handleClose}
              className="bg-white dark:bg-slate-800 rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <span className="sr-only">{t('close')}</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;