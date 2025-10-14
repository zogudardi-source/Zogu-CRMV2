import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Appointment, Customer, Profile, AppointmentStatus } from '../../types';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../ui/DatePicker';
import { parseAsLocalDate } from '../../lib/formatting';

interface AppointmentModalProps {
  appointment: Appointment | null;
  customers: Customer[];
  onClose: () => void;
  onSave: (appointment: Partial<Appointment>) => void;
  onDelete?: (appointmentId: number) => void;
  defaultDate?: Date | null;
  defaultAssigneeId?: string | null;
  defaultCustomerId?: number | null;
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({ appointment, customers, onClose, onSave, onDelete, defaultDate, defaultAssigneeId, defaultCustomerId }) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  
  const [formData, setFormData] = useState({
    title: '',
    customer_id: '',
    notes: '',
    status: 'open' as AppointmentStatus,
    type: 'standard' as 'standard' | 'absence',
  });
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [isAllDay, setIsAllDay] = useState(false);

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [assignedUserId, setAssignedUserId] = useState(defaultAssigneeId || user?.id || '');

  const canManageAssignee = profile?.role === 'admin' || profile?.role === 'key_user';

  useEffect(() => {
    if (canManageAssignee && profile?.org_id) {
        const fetchEmployees = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('org_id', profile.org_id);
            setEmployees(data || []);
        };
        fetchEmployees();
    }
  }, [canManageAssignee, profile?.org_id]);

  useEffect(() => {
    if (appointment) {
      setFormData({
        title: appointment.title,
        customer_id: appointment.customer_id?.toString() || '',
        notes: appointment.notes || '',
        status: appointment.status,
        type: appointment.type || 'standard',
      });
      setIsAllDay(appointment.is_all_day || false);
      setStartTime(parseAsLocalDate(appointment.start_time));
      setEndTime(parseAsLocalDate(appointment.end_time));
      setAssignedUserId(appointment.user_id);
    } else {
      const startDate = defaultDate ? parseAsLocalDate(defaultDate) : new Date();
      if (!defaultDate && startDate) {
        startDate.setHours(startDate.getHours() + 1, 0, 0, 0);
      }
      const endDate = startDate ? new Date(startDate.getTime() + 60 * 60 * 1000) : null; // 1 hour later

      setFormData({ title: '', customer_id: defaultCustomerId?.toString() || '', notes: '', status: 'open', type: 'standard' });
      setIsAllDay(false);
      setStartTime(startDate);
      setEndTime(endDate);
      setAssignedUserId(defaultAssigneeId || user?.id || '');
    }
  }, [appointment, defaultDate, defaultAssigneeId, user, defaultCustomerId]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'standard' | 'absence';
    setFormData(prev => ({ ...prev, type: newType, customer_id: newType === 'absence' ? '' : prev.customer_id }));
    if (newType === 'absence') {
        setIsAllDay(true);
    }
  };

  const handleStartTimeChange = (date: Date | null) => {
    setStartTime(date);
    if (date) {
      if (!isAllDay) {
        const newEndTime = new Date(date.getTime() + 60 * 60 * 1000); // Keep 1 hour duration
        setEndTime(newEndTime);
      } else {
        // For multi-day absences, if end date is before new start date, adjust it.
        // Otherwise, leave it, allowing for a range to be created.
        if (endTime && endTime < date) {
          setEndTime(date);
        }
      }
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title.trim()) {
        alert('Title is required.');
        return;
    }
    
    if (!profile?.org_id && !appointment?.id) {
        alert("Cannot create appointment: Your profile is not associated with an organization.");
        return;
    }

    let finalStartTime = startTime;
    let finalEndTime = endTime;

    if (isAllDay) {
        if (finalStartTime) {
            finalStartTime = new Date(finalStartTime);
            finalStartTime.setHours(0, 0, 0, 0);
        }
        if (finalEndTime) {
            finalEndTime = new Date(finalEndTime);
            finalEndTime.setHours(23, 59, 59, 999);
        }
    }
    
    if (!finalStartTime || !finalEndTime) {
        alert('Please enter valid start and end times.');
        return;
    }
    
    let appointmentData: Partial<Appointment> = {
      id: appointment?.id,
      appointment_number: appointment?.appointment_number,
      user_id: assignedUserId,
      org_id: appointment?.org_id || profile?.org_id,
      title: formData.title,
      customer_id: formData.type === 'standard' && formData.customer_id ? parseInt(formData.customer_id) : null,
      start_time: finalStartTime.toISOString(),
      end_time: finalEndTime.toISOString(),
      notes: formData.notes,
      status: formData.status,
      type: formData.type,
      is_all_day: isAllDay,
    };
    
    onSave(appointmentData);
  };

  const handleDelete = () => {
    if (appointment?.id && onDelete) {
        onDelete(appointment.id);
    }
  };

  const modalTitle = appointment ? `${t('editAppointment')} (${appointment.appointment_number})` : t('addAppointment');
  
  return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6">
            <h2 id="appointment-modal-title" className="text-xl font-bold mb-4">{modalTitle}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                    <div className="flex items-center gap-x-4">
                        <label className="flex items-center"><input type="radio" name="type" value="standard" checked={formData.type === 'standard'} onChange={handleTypeChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500" /> <span className="ml-2">{t('standard')}</span></label>
                        <label className="flex items-center"><input type="radio" name="type" value="absence" checked={formData.type === 'absence'} onChange={handleTypeChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500" /> <span className="ml-2">{t('absence')}</span></label>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('title')}</label>
                    <input name="title" value={formData.title} onChange={handleChange} placeholder={formData.type === 'absence' ? 'e.g., Vacation' : 'e.g., Project meeting'} required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {formData.type === 'standard' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('customers')}</label>
                            <select name="customer_id" value={formData.customer_id} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                <option value="">{t('noCustomer')}</option>
                                {customers.map(c => ( <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option> ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('status')}</label>
                        <select name="status" value={formData.status} onChange={handleChange} required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 capitalize">
                            {(['draft', 'open', 'in_progress', 'done'] as AppointmentStatus[]).map(s => <option key={s} value={s}>{t(s as any)}</option>)}
                        </select>
                    </div>
                </div>
                {formData.type === 'absence' && (
                    <div className="flex items-center">
                        <input id="is_all_day" name="is_all_day" type="checkbox" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"/>
                        <label htmlFor="is_all_day" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">{t('allDay')}</label>
                    </div>
                )}
                {canManageAssignee && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('assignTo')}</label>
                        <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                           {employees.map(e => ( <option key={e.id} value={e.id}>{e.full_name || e.email} {e.id === user?.id && '(Me)'}</option> ))}
                        </select>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="mt-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('startTime')}</label>
                        <DatePicker selected={startTime} onChange={handleStartTimeChange} showTimeSelect={!isAllDay} />
                    </div>
                    <div className="mt-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('endTime')}</label>
                        <DatePicker selected={endTime} onChange={setEndTime} showTimeSelect={!isAllDay} />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('notes')}</label>
                    <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                <div className="flex justify-between items-center pt-2">
                    <div>
                        {appointment && appointment.status === 'draft' && onDelete && (
                            <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700">
                                {t('delete')}
                            </button>
                        )}
                    </div>
                    <div className="flex space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-medium dark:bg-gray-600">{t('cancel')}</button>
                        <button type="submit" className="px-4 py-2 text-white bg-primary-600 rounded text-sm font-medium hover:bg-primary-700">{t('save')}</button>
                    </div>
                </div>
            </form>
        </div>
    </div>
  );
};

export default AppointmentModal;