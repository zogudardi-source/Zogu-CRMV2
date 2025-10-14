import React, { useState, useEffect, useCallback, useMemo, DragEvent } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { useModal } from '../contexts/ModalContext';
import { Profile, Visit, Task, Appointment, VisitStatus, AppointmentStatus, Customer } from '../types';
import { format, addDays, startOfWeek as dateFnsStartOfWeek } from 'date-fns';
import { formatEuropeanTime } from '../lib/formatting';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  BriefcaseIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import CreateItemModal from '../components/modals/CreateItemModal';
import TaskModal from '../components/modals/TaskModal';
import { createNotification } from '../lib/notifications';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useNotifications } from '../contexts/NotificationContext';
import AppointmentModal from '../components/modals/AppointmentModal';

// Combined type for all schedulable activities
type Activity = (Visit | Task | Appointment) & { activity_type: 'visit' | 'task' | 'appointment' };

const DispatcherPage: React.FC = () => {
    // Hooks
    const { profile, user } = useAuth();
    const { t } = useLanguage();
    const { refreshKey } = useRefresh();
    const { openTab } = useTabs();
    const { openAppointmentModal, openTaskModal } = useModal();
    const { addToast } = useNotifications();

    // State
    const [employees, setEmployees] = useState<Profile[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<'week' | 'day'>('week');
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(['all']);
    
    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createModalDefaultDate, setCreateModalDefaultDate] = useState<Date | null>(null);
    const [createModalDefaultAssignee, setCreateModalDefaultAssignee] = useState<string | null>(null);
    
    // Task Edit Modal State
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    // Appointment Edit Modal State
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);

    // Confirmation Modal for Copy
    const [apptToCopy, setApptToCopy] = useState<Appointment | null>(null);


    const startOfWeek = (date: Date) => dateFnsStartOfWeek(date, { weekStartsOn: 1 }); // Monday start

    const visibleDateRange = useMemo(() => {
        let start = new Date(currentDate);
        let end = new Date(currentDate);
        if (view === 'week') {
            start = startOfWeek(currentDate);
            end = addDays(start, 6);
        }
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }, [currentDate, view]);

    const fetchData = useCallback(async () => {
        if (!profile?.org_id) return;
        setLoading(true);

        // Fetch employees
        const { data: employeesData } = await supabase.from('profiles').select('*').eq('org_id', profile.org_id).in('role', ['admin', 'key_user', 'field_service_employee']).order('full_name');
        setEmployees(employeesData || []);
        if (selectedEmployeeIds.length === 0 && employeesData && employeesData.length > 0) {
            setSelectedEmployeeIds(['all']);
        }

        const { data: customersData } = await supabase.from('customers').select('*').eq('org_id', profile.org_id);
        setCustomers(customersData || []);
        
        const { start, end } = visibleDateRange;
        
        // Fetch activities
        const [
            { data: visitsData },
            { data: tasksData },
            { data: appointmentsData }
        ] = await Promise.all([
            supabase.from('visits').select('*, customers(name)').eq('org_id', profile.org_id).gte('start_time', start.toISOString()).lte('start_time', end.toISOString()),
            supabase.from('tasks').select('*, customers(name)').eq('org_id', profile.org_id).gte('start_time', start.toISOString()).lte('start_time', end.toISOString()),
            supabase.from('appointments').select('*, customers(name)').eq('org_id', profile.org_id).lte('start_time', end.toISOString()).gte('end_time', start.toISOString()),
        ]);

        const combined: Activity[] = [
            ...(visitsData || []).map(v => ({ ...v, activity_type: 'visit' as const })),
            ...(tasksData || []).map(t => ({ ...t, activity_type: 'task' as const })),
            ...(appointmentsData || []).map(a => ({ ...a, activity_type: 'appointment' as const })),
        ];

        setActivities(combined);
        setLoading(false);
    }, [profile?.org_id, visibleDateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData, refreshKey]);

    // Component for a single activity card
    const ActivityCard: React.FC<{ activity: Activity, onDragStart: (e: DragEvent<HTMLDivElement>, activityId: string, type: 'visit' | 'task' | 'appointment') => void }> = ({ activity, onDragStart }) => {
    
      const handleClick = () => {
        if (activity.activity_type === 'visit') {
          openTab({ path: `/visits/edit/${activity.id}`, label: (activity as Visit).visit_number });
        } else if (activity.activity_type === 'task') {
          setSelectedTask(activity as Task);
          setIsTaskModalOpen(true);
        } else if (activity.activity_type === 'appointment') {
          setSelectedAppointment(activity as Appointment);
          setIsAppointmentModalOpen(true);
        }
      };
    
      const getStatusInfo = () => {
        if (activity.activity_type === 'visit') {
          const visit = activity as Visit;
          const colors: Record<VisitStatus, string> = { planned: 'bg-blue-200 text-blue-800', completed: 'bg-green-200 text-green-800', cancelled: 'bg-red-200 text-red-800' };
          return { status: visit.status, color: colors[visit.status] };
        }
        if (activity.activity_type === 'task') {
          const task = activity as Task;
          const status = task.is_complete ? 'completed' : 'pending';
          const color = task.is_complete ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800';
          return { status, color };
        }
        if (activity.activity_type === 'appointment') {
          const appt = activity as Appointment;
          const colors: Record<AppointmentStatus, string> = { draft: 'bg-yellow-200 text-yellow-800', open: 'bg-blue-200 text-blue-800', in_progress: 'bg-purple-200 text-purple-800', done: 'bg-green-200 text-green-800' };
          return { status: appt.status, color: colors[appt.status] };
        }
        return { status: '', color: 'bg-gray-200 text-gray-800' };
      };
    
      const { status, color } = getStatusInfo();
    
      const Icons = {
        visit: BriefcaseIcon,
        task: ClipboardDocumentListIcon,
        appointment: CalendarDaysIcon
      };
      const Icon = Icons[activity.activity_type];
      
      const title = activity.activity_type === 'task' ? (activity as Task).title : activity.activity_type === 'visit' ? (activity as Visit).purpose || (activity as Visit).category : (activity as Appointment).title;
    
      return (
        <div
          draggable
          onDragStart={(e) => onDragStart(e, String(activity.id), activity.activity_type)}
          onClick={handleClick}
          className="p-2 bg-white dark:bg-gray-800 border-l-4 border-primary-500 rounded-md shadow-sm cursor-grab hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start">
            <p className="font-semibold text-sm truncate pr-2 flex items-center gap-x-2">
                <Icon className="w-4 h-4 text-gray-500 shrink-0"/>
                {title}
            </p>
            <span className={`px-2 py-0.5 text-[10px] rounded-full ${color} capitalize`}>{status}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{formatEuropeanTime(activity.start_time)}{activity.end_time && ` - ${formatEuropeanTime(activity.end_time)}`}</p>
          <p className="text-xs text-gray-500">{(activity as any).customers?.name || 'Internal'}</p>
        </div>
      );
    };

    const handleDragStart = (e: DragEvent<HTMLDivElement>, activityId: string, type: 'visit' | 'task' | 'appointment') => {
        e.dataTransfer.setData('activityId', activityId);
        e.dataTransfer.setData('activityType', type);
    };

    const handleDrop = async (e: DragEvent<HTMLDivElement>, newAssigneeId: string | null, newDate: Date) => {
        e.preventDefault();
        const activityId = e.dataTransfer.getData('activityId');
        const activityType = e.dataTransfer.getData('activityType') as 'visit' | 'task' | 'appointment';
        if (!activityId) return;

        const tableMap = { visit: 'visits', task: 'tasks', appointment: 'appointments' };
        const tableName = tableMap[activityType];
        
        let assignmentField = 'user_id';
        if (activityType === 'visit') assignmentField = 'assigned_employee_id';
        
        const updateData: { [key: string]: any } = { [assignmentField]: newAssigneeId };

        const originalActivity = activities.find(a => a.id.toString() === activityId && a.activity_type === activityType);
        if (originalActivity) {
            const originalDate = new Date(originalActivity.start_time as string);
            const duration = (originalActivity.end_time ? new Date(originalActivity.end_time).getTime() : originalDate.getTime()) - originalDate.getTime();
            
            const updatedStartTime = new Date(newDate);
            updatedStartTime.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());

            const updatedEndTime = new Date(updatedStartTime.getTime() + duration);

            updateData['start_time'] = updatedStartTime.toISOString();
            updateData['end_time'] = updatedEndTime.toISOString();
        }

        const { error } = await supabase.from(tableName).update(updateData).eq('id', activityId);

        if (error) {
            addToast({ type: 'error', title: 'Error', body: `Error updating ${activityType}: ` + error.message });
        } else {
            addToast({ type: 'success', title: 'Success', body: `Activity reassigned.` });
            fetchData(); // Refresh data
        }
    };

    const handleEmployeeFilterChange = (employeeId: string) => {
        setSelectedEmployeeIds(prev => {
            if (employeeId === 'all') return ['all'];
            const newSet = new Set(prev.filter(id => id !== 'all'));
            if (newSet.has(employeeId)) {
                newSet.delete(employeeId);
            } else {
                newSet.add(employeeId);
            }
            const newArray = Array.from(newSet);
            return newArray.length === 0 ? ['all'] : newArray;
        });
    };

    const handleCreateItem = (type: 'visit' | 'task' | 'appointment') => {
        setIsCreateModalOpen(false);
        const state = { defaultDate: createModalDefaultDate?.toISOString(), defaultAssigneeId: createModalDefaultAssignee };
        if (type === 'visit') {
            openTab({ path: '/visits/new', label: t('newVisit'), state });
        } else if (type === 'task') {
            openTaskModal(createModalDefaultDate || undefined);
        } else if (type === 'appointment') {
            openAppointmentModal(createModalDefaultDate || undefined);
        }
    };
    
    // Task Modal Handlers
    const handleCloseTaskModal = () => {
        setIsTaskModalOpen(false);
        setSelectedTask(null);
    };
    
    const handleSaveTask = async (taskData: Partial<Task>) => {
        if (!user || !profile?.org_id) return;
        const dataToUpsert = { ...taskData, user_id: taskData.user_id || user.id, org_id: taskData.org_id || profile.org_id };
        
        const { data: savedTask, error } = await supabase.from('tasks').upsert(dataToUpsert).select().single();
    
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Error saving task: ' + error.message });
        } else { 
            if (savedTask && savedTask.user_id && savedTask.user_id !== user.id) {
                const isUpdate = !!taskData.id;
                const titleKey = isUpdate ? 'taskUpdated' : 'newTaskAssigned';
                const bodyKey = isUpdate ? 'taskWasUpdatedBy' : 'taskWasAssignedToYouBy';

                await createNotification({
                    user_id: savedTask.user_id,
                    org_id: profile.org_id,
                    title: titleKey,
                    body: JSON.stringify({
                        key: bodyKey,
                        params: {
                            taskTitle: savedTask.title,
                            userName: profile.full_name
                        }
                    }),
                    type: 'new_task',
                    related_entity_path: '/tasks',
                    related_entity_id: savedTask.id,
                });
            }
            fetchData(); 
            handleCloseTaskModal(); 
        }
    };

    const handleCloseAppointmentModal = () => {
        setIsAppointmentModalOpen(false);
        setSelectedAppointment(null);
    };

    const handleSaveAppointment = async (appointmentData: Partial<Appointment>) => {
        if (!user || !profile?.org_id) {
            addToast({ type: 'error', title: 'Error', body: "Cannot save: Missing user or organization context." });
            return;
        }
        try {
            const { error } = await supabase.from('appointments').upsert(appointmentData).select().single();
            if (error) throw error;
            fetchData();
            handleCloseAppointmentModal();
            addToast({ type: 'success', title: 'Success', body: 'Appointment updated.' });
        } catch (error: any) {
            addToast({ type: 'error', title: 'Error', body: 'Error saving appointment: ' + error.message });
        }
    };

    const handleRequestDelete = (appointmentId: number) => {
        const apptToDelete = activities.find(a => a.id === appointmentId && a.activity_type === 'appointment') as Appointment | undefined;
        if (apptToDelete) {
            setAppointmentToDelete(apptToDelete);
            handleCloseAppointmentModal();
        }
    };

    const handleConfirmDelete = async () => {
        if (!appointmentToDelete) return;
        const { error } = await supabase.from('appointments').delete().eq('id', appointmentToDelete.id);
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Error deleting appointment: ' + error.message });
        } else {
            addToast({ type: 'success', title: 'Success', body: 'Appointment deleted.' });
            fetchData();
        }
        setAppointmentToDelete(null);
    };

    const handleCopyAppointment = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const appt = activities.find(a => a.id === id && a.activity_type === 'appointment') as Appointment | undefined;
        if (appt) {
            setApptToCopy(appt);
        }
    };
    
    const handleConfirmCopy = async () => {
        if (!apptToCopy || !profile?.org_id) return;

        const newAppointment: Partial<Appointment> = {
            user_id: user?.id,
            org_id: apptToCopy.org_id,
            customer_id: apptToCopy.customer_id,
            title: `COPY OF ${apptToCopy.title}`,
            start_time: apptToCopy.start_time,
            end_time: apptToCopy.end_time,
            notes: apptToCopy.notes,
            status: 'draft',
        };
    
        const { error } = await supabase.from('appointments').insert(newAppointment);
    
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Error duplicating appointment: ' + error.message });
        } else {
            addToast({ type: 'success', title: 'Success', body: 'Appointment duplicated.' });
            fetchData();
        }
        setApptToCopy(null);
    };

    const visibleEmployees = useMemo(() => {
        if (selectedEmployeeIds.includes('all')) return employees;
        return employees.filter(e => selectedEmployeeIds.includes(e.id));
    }, [employees, selectedEmployeeIds]);

    const weekDays = useMemo(() => {
        const days = [];
        let day = startOfWeek(currentDate);
        for (let i = 0; i < 7; i++) {
            days.push(new Date(day));
            day = addDays(day, 1);
        }
        return days;
    }, [currentDate]);

    const isToday = (d: Date) => new Date().toDateString() === d.toDateString();
    
    const daysToRender = view === 'week' ? weekDays : [currentDate];

    // Main render
    return (
        <div className="h-full flex flex-col">
            {isCreateModalOpen && <CreateItemModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSelect={handleCreateItem} t={t} />}
            {isTaskModalOpen && <TaskModal task={selectedTask} onClose={handleCloseTaskModal} onSave={handleSaveTask} />}
            {isAppointmentModalOpen && (
                <AppointmentModal 
                    appointment={selectedAppointment}
                    customers={customers}
                    onClose={handleCloseAppointmentModal}
                    onSave={handleSaveAppointment}
                    onDelete={handleRequestDelete}
                />
            )}
            <ConfirmModal 
                isOpen={!!apptToCopy || !!appointmentToDelete}
                onClose={() => { setApptToCopy(null); setAppointmentToDelete(null); }}
                onConfirm={apptToCopy ? handleConfirmCopy : handleConfirmDelete}
                title={apptToCopy ? "Duplicate Appointment" : "Delete Appointment"}
                message={
                    apptToCopy 
                    ? `Are you sure you want to duplicate "${apptToCopy?.title}"?`
                    : `Are you sure you want to delete the appointment "${appointmentToDelete?.title}"?`
                }
                confirmText={apptToCopy ? "Duplicate" : "Delete"}
            />


            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 gap-4">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('dispatcher')}</h1>
                <div className="flex items-center gap-x-4">
                    <div className="flex items-center space-x-1">
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium border rounded-md dark:border-gray-600">{t('today')}</button>
                        <button onClick={() => setCurrentDate(d => addDays(d, view === 'week' ? -7 : -1))} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5"/></button>
                        <button onClick={() => setCurrentDate(d => addDays(d, view === 'week' ? 7 : 1))} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5"/></button>
                    </div>
                    <span className="font-semibold">{format(currentDate, 'MMMM yyyy')}</span>
                    <div className="flex items-center space-x-1 bg-gray-200 dark:bg-slate-700 rounded-lg p-1">
                        <button onClick={() => setView('day')} className={`px-3 py-1 text-sm font-medium rounded-md ${view === 'day' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('day')}</button>
                        <button onClick={() => setView('week')} className={`px-3 py-1 text-sm font-medium rounded-md ${view === 'week' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('week')}</button>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
                {/* Schedule Grid */}
                <div className="flex-1 overflow-x-auto">
                    <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${daysToRender.length}, minmax(150px, 1fr))` }}>
                        {daysToRender.map(day => (
                            <div key={day.toISOString()} className="flex flex-col border-r dark:border-gray-700">
                                <div className={`text-center py-2 border-b dark:border-gray-700 ${isToday(day) ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                                    <p className="text-xs">{format(day, 'eee')}</p>
                                    <p className={`font-bold text-lg ${isToday(day) ? 'text-primary-600' : ''}`}>{format(day, 'd')}</p>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {visibleEmployees.map(emp => {
                                        const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
                                        const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);

                                        const allDayAbsence = activities.find(a => {
                                            const isForEmp = a.activity_type === 'appointment' && (a as Appointment).user_id === emp.id;
                                            if (!isForEmp) return false;
                                            const isAbsence = (a as Appointment).is_all_day && (a as Appointment).type === 'absence';
                                            if (!isAbsence) return false;
                                            const apptStart = new Date(a.start_time);
                                            const apptEnd = new Date(a.end_time);
                                            return apptStart <= dayEnd && apptEnd >= dayStart;
                                        }) as Appointment | undefined;

                                        const activitiesForCell = activities.filter(a => {
                                            if (a.id === allDayAbsence?.id && a.activity_type === 'appointment') return false;
                                            const matchesEmp = a.activity_type === 'visit' ? (a as Visit).assigned_employee_id === emp.id : (a as Task | Appointment).user_id === emp.id;
                                            if (!matchesEmp) return false;
                                            const activityDate = new Date(a.start_time as string);
                                            return activityDate.toDateString() === day.toDateString();
                                        }).sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime());

                                        return (
                                            <div key={emp.id} onDragOver={e => !allDayAbsence && e.preventDefault()} onDrop={e => !allDayAbsence && handleDrop(e, emp.id, day)} className="p-2 border-b dark:border-gray-700 min-h-[100px] relative">
                                                <h4 className="text-sm font-semibold mb-2">{emp.full_name || emp.email}</h4>
                                                {allDayAbsence ? (
                                                    <div 
                                                        onClick={() => {
                                                            setSelectedAppointment(allDayAbsence);
                                                            setIsAppointmentModalOpen(true);
                                                        }}
                                                        className="absolute inset-0 bg-gray-200 dark:bg-gray-700/50 flex items-center justify-center p-2 z-10 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                                                        style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(0,0,0,0.05), rgba(0,0,0,0.05) 10px, transparent 10px, transparent 20px)'}}
                                                    >
                                                        <p className="font-semibold text-gray-500 dark:text-gray-400 text-center">{allDayAbsence.title}</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="space-y-2">
                                                            {activitiesForCell.map(act => <ActivityCard key={`${act.activity_type}-${act.id}`} activity={act} onDragStart={handleDragStart} />)}
                                                        </div>
                                                        <button onClick={() => { setIsCreateModalOpen(true); setCreateModalDefaultDate(day); setCreateModalDefaultAssignee(emp.id); }} className="w-full text-center text-xs text-gray-400 hover:text-primary-600 p-1 rounded-md border border-dashed hover:border-primary-600 mt-2">
                                                            +
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* Employee Filter Footer */}
            <div className="shrink-0 p-2 border-t dark:border-gray-700 flex items-center gap-x-2 overflow-x-auto">
                <span className="font-semibold text-sm pr-2">{t('filterByEmployee')}:</span>
                <button onClick={() => handleEmployeeFilterChange('all')} className={`px-3 py-1 text-xs rounded-full ${selectedEmployeeIds.includes('all') ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{t('allEmployees')}</button>
                {employees.map(emp => (
                    <button key={emp.id} onClick={() => handleEmployeeFilterChange(emp.id)} className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${selectedEmployeeIds.includes(emp.id) ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{emp.full_name || emp.email}</button>
                ))}
            </div>
        </div>
    );
};

export default DispatcherPage;