import { supabase } from '../services/supabase';
import { Notification } from '../types';

type NotificationPayload = Omit<Notification, 'id' | 'created_at' | 'is_read'>;

/**
 * Creates a new notification in the database for a specific user.
 * @param payload The data for the notification.
 */
export const createNotification = async (payload: NotificationPayload): Promise<void> => {
  const { error } = await supabase.from('notifications').insert(payload);
  if (error) {
    // We log the error but don't throw, to avoid breaking the user's primary action (e.g., saving a task)
    // if the notification fails to send.
    console.error('Error creating notification:', error.message);
  }
};