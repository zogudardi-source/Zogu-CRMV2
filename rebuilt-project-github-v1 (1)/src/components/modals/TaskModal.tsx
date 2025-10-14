import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Task, Customer, Profile } from '../../types';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../ui/DatePicker';
import { format } from 'date-fns';
import { parseAsLocalDate } from '../../lib/formatting';

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  defaultAssigneeId?: string | null;
  defaultDate?: Date | null;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave, defaultAssigneeId, defaultDate }) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [assignedUserId, setAssignedUserId] = useState(defaultAssigneeId || user?.id || '');

  useEffect(() => {
    const fetchEmployees = async () => {
        if (!profile?.org_id) return;
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('org_id', profile.org_id)
            .in('role', ['admin', 'key_user', 'field_service_employee']);
        if (data) setEmployees(data);
    };
    fetchEmployees();
  }, [profile?.org_id]);


  useEffect(() => {
    const fetchCustomers = async () => {
      if (!user || !profile?.org_id) return;
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('name');
      if (data) setCustomers(data);
    };
    fetchCustomers();
  }, [user, profile]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setCustomerId(task.customer_id?.toString() || '');
      const taskStartTime = parseAsLocalDate(task.start_time);
      const taskEndTime = parseAsLocalDate(task.end_time);
      setStartTime(taskStartTime);
      setEndTime(taskEndTime);
      setAssignedUserId(task.user_id);
    } else {
      const defaultStartDate = defaultDate || new Date();
      const defaultEndDate = new Date(defaultStartDate.getTime() + 30 * 60 * 1000); // 30 mins later
      setTitle('');
      setCustomerId('');
      setStartTime(defaultStartDate);
      setEndTime(defaultEndDate);
      setAssignedUserId(defaultAssigneeId || user?.id || '');
    }
  }, [task, defaultDate, defaultAssigneeId, user]);
  
  const handleStartTimeChange = (date: Date | null) => {
    setStartTime(date);
    if (date) {
      const newEndTime = new Date(date.getTime() + 30 * 60 * 1000); // Keep 30 min duration
      setEndTime(newEndTime);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
        alert('Title cannot be empty.');
        return;
    }
    
    onSave({
      id: task?.id,
      title: title,
      start_time: startTime ? startTime.toISOString() : null,
      end_time: endTime ? endTime.toISOString() : null,
      is_complete: task?.is_complete || false,
      customer_id: customerId ? parseInt(customerId) : null,
      user_id: assignedUserId,
    });
  };

  const handleToggleComplete = () => {
    if (!task) return;
    onSave({
      // Pass all current form state in case the user made changes before clicking 'complete'
      id: task.id,
      title: title,
      start_time: startTime ? startTime.toISOString() : null,
      end_time: endTime ? endTime.toISOString() : null,
      customer_id: customerId ? parseInt(customerId) : null,
      user_id: assignedUserId,
      // Toggle the completion status
      is_complete: !task.is_complete,
    });
  };
  
  return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6">
            <h2 id="task-modal-title" className="text-xl font-bold mb-4">{task ? t('editTask') : t('addTask')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('title')}</label>
                    <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Follow up with customer" required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('assignTo')}</label>
                    <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                       {employees.map(e => ( <option key={e.id} value={e.id}>{e.full_name || e.email}</option>))}
                    </select>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('startTime')}</label>
                        <DatePicker selected={startTime} onChange={handleStartTimeChange} showTimeSelect />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('endTime')}</label>
                        <DatePicker selected={endTime} onChange={setEndTime} showTimeSelect />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Customer (Optional)</label>
                    <select name="customer_id" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">No Customer</option>
                        {customers.map(c => ( <option key={c.id} value={c.id}>{c.name}</option> ))}
                    </select>
                </div>
                <div className="flex justify-between items-center pt-2">
                    <div>
                        {task && (
                            <button
                                type="button"
                                onClick={handleToggleComplete}
                                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                                    task.is_complete
                                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:hover:bg-yellow-900'
                                        : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900'
                                }`}
                            >
                                {task.is_complete ? t('markAsIncomplete') : t('markAsComplete')}
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
  )
}

export default TaskModal;