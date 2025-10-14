import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Task } from '../types';
import TaskModal from '../components/modals/TaskModal';
import { createNotification } from '../lib/notifications';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate } from '../lib/formatting';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTabs } from '../contexts/TabContext';
import Pagination from '../components/ui/Pagination';
import ConfirmModal from '../components/modals/ConfirmModal';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
const ITEMS_PER_PAGE = 20;

const TasksPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { addToast } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const canManageTasks = profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  useEffect(() => {
    setCurrentPage(0);
  }, [showCompleted]);

  const fetchTasks = useCallback(async () => {
    if (!user || !profile?.org_id) return;
    setLoading(true);
    
    let query = supabase
      .from('tasks')
      .select('*, customers(id, name), profiles(full_name)', { count: 'exact' });

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (!showCompleted) {
      query = query.eq('is_complete', false);
    }
    
    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    query = query
      .order(sortConfig.key, { 
        ascending: sortConfig.direction === 'asc',
        nullsFirst: false 
      })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching tasks:', error.message);
        addToast({ type: 'error', title: 'Error fetching tasks:', body: error.message });
    } else {
        setTasks(data as any || []);
        setTotalItems(count || 0);
    }
    
    setLoading(false);
  }, [user, profile, showCompleted, sortConfig, currentPage, addToast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, refreshKey]);

  useEffect(() => {
    const state = location.state as { openModalForId?: string } | null;
    if (state?.openModalForId && tasks.length > 0 && !isModalOpen) {
        const taskToOpen = tasks.find(t => t.id === state.openModalForId);
        if (taskToOpen) {
            setSelectedTask(taskToOpen);
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true, state: null });
        }
    }
  }, [location.state, tasks, isModalOpen, navigate, location.pathname]);
  
  const handleSort = (key: string) => {
    setCurrentPage(0);
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (task: Task | null = null) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    if (!user || !profile?.org_id) return;
    const dataToUpsert = { ...taskData, user_id: taskData.user_id || user.id, org_id: taskData.org_id || profile.org_id };
    
    const { data: savedTask, error } = await supabase.from('tasks').upsert(dataToUpsert).select().single();

    if (error) {
        alert('Error saving task: ' + error.message);
    } else { 
        if (savedTask && savedTask.user_id && savedTask.user_id !== user.id) {
            await createNotification({
                user_id: savedTask.user_id,
                org_id: profile.org_id,
                title: 'newTaskAssigned',
                body: JSON.stringify({
                  key: 'taskWasAssignedToYouBy',
                  params: {
                    taskTitle: savedTask.title,
                    userName: profile.full_name,
                  }
                }),
                type: 'new_task',
                related_entity_path: '/tasks',
                related_entity_id: savedTask.id,
            });
        }
        fetchTasks(); 
        handleCloseModal(); 
    }
  };
  
  const handleCopyTask = async (taskId: string) => {
    try {
        setLoading(true);
        const { data: original, error: fetchError } = await supabase.from('tasks').select('*').eq('id', taskId).single();
        if (fetchError || !original) throw new Error(fetchError?.message || 'Task not found.');

        const { id, created_at, is_complete, ...rest } = original;
        
        const newTaskData = {
            ...rest,
            title: `(Copy) ${original.title}`.trim(),
            is_complete: false
        };
        
        const { data: newTask, error: insertError } = await supabase.from('tasks').insert(newTaskData).select().single();
        if (insertError) throw insertError;
        
        addToast({ title: 'Success', body: 'Task copied. Opening new draft...', type: 'success' });
        if (newTask) {
            handleOpenModal(newTask);
        }

    } catch (error: any) {
        addToast({ title: 'Error', body: `Failed to copy task: ${error.message}`, type: 'error' });
    } finally {
        setLoading(false);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    const originalTasks = tasks;
    setTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === task.id ? { ...t, is_complete: !t.is_complete } : t
      )
    );
  
    const { error } = await supabase.from('tasks').update({ is_complete: !task.is_complete }).eq('id', task.id);
    if (error) {
      alert('Error updating task: ' + error.message);
      setTasks(originalTasks);
    } else {
      if (!showCompleted && !task.is_complete) {
        setTimeout(() => {
          setTotalItems(prev => prev - 1);
          setTasks(prev => prev.filter(t => t.id !== task.id));
        }, 300);
      }
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;

    const { error } = await supabase.from('tasks').delete().eq('id', taskToDelete.id);
    if (error) {
        addToast({ title: 'Error', body: `Failed to delete task: ${error.message}`, type: 'error' });
    } else {
        addToast({ title: 'Success', body: 'Task deleted.', type: 'success' });
        fetchTasks();
    }
    setTaskToDelete(null);
  };

  const SortableHeader: React.FC<{ sortKey: string; label: string; }> = ({ sortKey, label }) => (
    <th 
        className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        onClick={() => handleSort(sortKey)}
    >
        <div className="flex items-center">
            <span>{label}</span>
            {sortConfig.key === sortKey && (
                sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />
            )}
        </div>
    </th>
  );

  const MobileTaskCard: React.FC<{ task: any }> = ({ task }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-start space-x-4">
        <input 
            type="checkbox" 
            checked={task.is_complete}
            onChange={() => handleToggleComplete(task)}
            className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer mt-1"
        />
        <div className="flex-grow">
            <p className={`font-medium ${task.is_complete ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>{task.title}</p>
            <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
                <span className="font-mono">ID: {task.id.split('-')[0]}</span>
                {task.customers?.name && <span>For: {task.customers && task.customer_id ? (<button onClick={(e) => { e.stopPropagation(); openTab({ path: `/customers/${task.customer_id}`, label: task.customers.name }); }} className="text-left hover:underline text-primary-600">{task.customers.name}</button>) : 'internal task'}</span>}
                {task.profiles?.full_name && <span>Assigned to: {task.profiles.full_name}</span>}
                {task.start_time && <span>Start: {formatEuropeanDate(task.start_time)}</span>}
                {task.end_time && <span>End: {formatEuropeanDate(task.end_time)}</span>}
                <span>Created: {formatEuropeanDate(task.created_at)}</span>
            </div>
        </div>
        {canManageTasks && (
          <div className="flex flex-col items-center space-y-2">
              <button onClick={() => handleOpenModal(task)} className="text-gray-400 hover:text-primary-600" title={t('edit')}><PencilIcon className="w-5 h-5"/></button>
              <button onClick={() => handleCopyTask(task.id)} title={t('copyTask')}><DocumentDuplicateIcon className="w-5 h-5 text-gray-400 hover:text-primary-600"/></button>
              <button onClick={() => setTaskToDelete(task)} className="text-gray-400 hover:text-red-600" title={t('delete')}><TrashIcon className="w-5 h-5"/></button>
          </div>
        )}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('tasks')}</h1>
          {canManageTasks && (
            <button onClick={() => handleOpenModal()} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('addTask')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={showCompleted} onChange={() => setShowCompleted(!showCompleted)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span>Show completed tasks</span>
            </label>
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">Loading...</div> : (
          isFieldServiceEmployee ? (
              <div className="space-y-4">
                 {(showCompleted ? tasks : tasks.filter(t => !t.is_complete)).length > 0 ? (showCompleted ? tasks : tasks.filter(t => !t.is_complete)).map(task => (
                    <MobileTaskCard key={task.id} task={task} />
                  )) : <p className="p-6 text-center text-gray-500">{t('noTasksFound')}</p>}
                   <Pagination
                      currentPage={currentPage}
                      totalItems={totalItems}
                      itemsPerPage={ITEMS_PER_PAGE}
                      onPageChange={setCurrentPage}
                    />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr>
                                <th className="px-6 py-3 w-12 border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"></th>
                                <SortableHeader sortKey="title" label={t('title')} />
                                <SortableHeader sortKey="customers.name" label={t('customer')} />
                                <SortableHeader sortKey="profiles.full_name" label={t('assignTo')} />
                                <SortableHeader sortKey="start_time" label={t('startTime')} />
                                <SortableHeader sortKey="end_time" label={t('endTime')} />
                                <SortableHeader sortKey="created_at" label={t('createdAt')} />
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800">
                            {tasks.length > 0 ? tasks.map(task => (
                                <tr key={task.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 ${task.is_complete ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}>
                                    <td className="px-6 py-3">
                                        <input type="checkbox" checked={task.is_complete} onChange={() => handleToggleComplete(task)} className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"/>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                                        <span className={task.is_complete ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}>{(task as any).title}</span>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm">
                                        {(task as any).customers ? (
                                            <button onClick={() => openTab({ path: `/customers/${(task as any).customer_id}`, label: (task as any).customers.name })} className="text-primary-600 hover:underline">{(task as any).customers.name}</button>
                                        ) : (
                                            <span className="text-gray-500 dark:text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{(task as any).profiles?.full_name || 'N/A'}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.start_time ? formatEuropeanDate(task.start_time) : '-'}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.end_time ? formatEuropeanDate(task.end_time) : '-'}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(task.created_at)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button onClick={() => handleOpenModal(task)} className="text-primary-600 hover:text-primary-800" title={t('edit')}><PencilIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleCopyTask(task.id)} title={t('copyTask')}><DocumentDuplicateIcon className="w-5 h-5 text-gray-500 hover:text-primary-600"/></button>
                                        <button onClick={() => setTaskToDelete(task)} className="text-red-600 hover:text-red-800" title={t('delete')}><TrashIcon className="w-5 h-5"/></button>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={8} className="p-4 text-center text-gray-500">{t('noTasksFound')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                 <Pagination
                    currentPage={currentPage}
                    totalItems={totalItems}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
            </div>
            )
        )}
      </div>
      {isModalOpen && <TaskModal task={selectedTask} onClose={handleCloseModal} onSave={handleSaveTask} />}
      <ConfirmModal
        isOpen={!!taskToDelete}
        onClose={() => setTaskToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Task"
        message={`Are you sure you want to delete the task "${taskToDelete?.title}"?`}
        confirmText="Delete"
      />
    </>
  );
};

export default TasksPage;