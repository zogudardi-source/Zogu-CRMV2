import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { Notification } from '../types';
import { useLanguage } from './LanguageContext';
import { translateNotification } from '../lib/formatting';

export type ToastStatus = 'success' | 'error' | 'info';
export type ToastType = Notification['type'] | ToastStatus;

export interface Toast {
  id: number;
  title: string;
  body: string;
  type: ToastType;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  toasts: Toast[];
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  removeToast: (toastId: number) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('Error fetching notifications:', error.message);
    } else {
      setNotifications(data || []);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    } else {
      setNotifications([]); // Clear notifications on sign out
    }
  }, [user, fetchNotifications]);

  const showToast = useCallback((notification: Notification) => {
    const { title, body } = translateNotification(notification, t);
    const newToast: Toast = {
      id: Date.now(),
      title: title,
      body: body,
      type: notification.type,
    };
    setToasts(prevToasts => [newToast, ...prevToasts]);
  }, [t]);
  
  const removeToast = useCallback((toastId: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== toastId));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const newToast = { ...toast, id: Date.now() };
    setToasts(prevToasts => [newToast, ...prevToasts]);
  }, []);


  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications_user_${user.id}`)
      .on<Notification>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new;
          setNotifications(prev => [newNotification, ...prev]);
          showToast(newNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showToast]);

  const markAsRead = async (notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user!.id).eq('is_read', false);
  };

  const clearAllNotifications = async () => {
    if (!user) return;
    const originalNotifications = [...notifications];
    setNotifications([]); // Optimistic update
    
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);
      
    if (error) {
      console.error('Error clearing notifications:', error.message);
      setNotifications(originalNotifications); // Revert on error
      alert('Could not clear notifications. Please try again.');
    }
  };


  const unreadCount = notifications.filter(n => !n.is_read).length;

  const value = {
    notifications,
    unreadCount,
    toasts,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    removeToast,
    addToast,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};