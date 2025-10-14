import React, { useState } from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import { useTabs } from '../../contexts/TabContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { BellAlertIcon, BriefcaseIcon, CalendarDaysIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { Notification, NotificationType } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { translateNotification } from '../../lib/formatting';

interface NotificationPanelProps {
  onClose: () => void;
}

const formatDistanceToNow = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
};

const NOTIFICATION_ICONS: Record<NotificationType, React.ElementType> = {
    new_task: ClipboardDocumentListIcon,
    new_visit: BriefcaseIcon,
    new_appointment: CalendarDaysIcon,
    generic: BellAlertIcon
};

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAllNotifications } = useNotifications();
  const { openTab } = useTabs();
  const { t } = useLanguage();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.related_entity_path) {
      const tabOptions: { path: string; label: string; state?: any } = { 
        path: notification.related_entity_path, 
        label: notification.title 
      };
      
      if ((notification.type === 'new_task' || notification.type === 'new_appointment') && notification.related_entity_id) {
        tabOptions.state = { openModalForId: notification.related_entity_id };
      }

      openTab(tabOptions);
    }
    onClose();
  };

  const handleClearAll = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmClear = async () => {
    await clearAllNotifications();
    setIsConfirmOpen(false);
  };


  return (
    <>
      <div className="absolute right-0 w-80 mt-2 py-2 bg-white rounded-md shadow-xl z-20 dark:bg-slate-800 border dark:border-slate-700">
        <div className="flex justify-between items-center px-4 py-2 border-b dark:border-slate-700">
          <h3 className="font-bold text-gray-800 dark:text-white">{t('notifications')}</h3>
          <div className="flex items-center space-x-3">
              {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-sm text-primary-600 hover:underline">
                  {t('markAllAsRead')}
              </button>
              )}
               {notifications.length > 0 && (
              <button onClick={handleClearAll} className="text-sm text-red-500 hover:underline">
                  {t('clearAll')}
              </button>
              )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length > 0 ? (
            notifications.map(notification => {
              const Icon = NOTIFICATION_ICONS[notification.type] || BellAlertIcon;
              const { title, body } = translateNotification(notification, t);
              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex items-start px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 ${!notification.is_read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <div className={`w-2 h-2 rounded-full mt-2.5 mr-3 ${!notification.is_read ? 'bg-primary-500' : 'bg-transparent'}`}></div>
                  <div className="flex-shrink-0 pt-1">
                      <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400"/>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200">{title}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{body}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDistanceToNow(notification.created_at)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">{t('noNotifications')}</p>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmClear}
        title={t('clearAll')}
        message={t('confirmClearAllNotifications')}
        confirmText={t('clearAll')}
      />
    </>
  );
};

export default NotificationPanel;