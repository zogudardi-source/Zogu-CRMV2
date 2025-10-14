// Fix: Created missing AppointmentsPage.tsx component to manage appointments.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Appointment, Customer, AppointmentStatus } from '../types';
import AppointmentModal from '../components/modals/AppointmentModal';
import { createNotification } from '../lib/notifications';
import { generateNextNumber } from '../lib/numberGenerator';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { formatEuropeanTime } from '../lib/formatting';
import { useLocation, useNavigate } from 'react-router-dom';
import ConfirmModal from '../components/modals/ConfirmModal';

type CalendarView = 'month' | 'week' | 'day';

const AppointmentsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const location = useLocation();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<Date | null>(null);
  const [modalDefaultCustomerId, setModalDefaultCustomerId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
  };
  const addDays = (date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const visibleDateRange = useMemo(() => {
    let start = new Date(currentDate);
    let end = new Date(currentDate);

    if (view === 'month') {
        const monthStart = startOfMonth(currentDate);
        start = startOfWeek(monthStart);
        end = addDays(start, 41); // 6 weeks view
    } else if (view === 'week') {
        start = startOfWeek(currentDate);
        end = addDays(start, 6);
    }
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }, [currentDate, view]);

  const fetchAppointments = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase
      .from('appointments')
      .select('*, customers(name), organizations(name)')
      .lte('start_time', visibleDateRange.end.toISOString()) // Starts before or during the range
      .gte('end_time', visibleDateRange.start.toISOString()); // Ends after or during the range

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching appointments:', error.message);
    } else {
      setAppointments(data as any || []);
    }
    setLoading(false);
  }, [user, profile, visibleDateRange, statusFilter]);

  const fetchCustomers = useCallback(async () => {
      if (!user || !profile) return;
      let query = supabase.from('customers').select('*');
      if (profile.role !== 'super_admin') {
          query = query.eq('org_id', profile.org_id);
      }
      const { data, error } = await query;
      if (error) console.error("Error fetching customers", error.message);
      else setCustomers(data || []);
  }, [user, profile]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments, refreshKey]);
  
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers, refreshKey]);

  useEffect(() => {
    const state = location.state as { openModalForId?: string; openModalWithCustomerId?: number; } | null;
    if (state?.openModalForId && !isModalOpen) {
        const findAndOpenAppointment = async (id: string) => {
            const numericId = parseInt(id, 10);
            if (isNaN(numericId)) {
                // This ID is not a number, so it cannot be an appointment ID.
                // This is an unexpected situation, possibly from a misconfigured notification.
                console.error("Attempted to open an appointment with a non-numeric ID:", id);
                // Silently clear the state to prevent re-triggering this error.
                navigate(location.pathname, { replace: true, state: null });
                return;
            }

            const existingAppt = appointments.find(a => a.id === numericId);
            if (existingAppt) {
                setSelectedAppointment(existingAppt);
                setIsModalOpen(true);
                navigate(location.pathname, { replace: true, state: null });
            } else {
                // If not found in local state, fetch from DB. This can happen if the
                // user clicks a notification for an appointment outside the current view range.
                setLoading(true);
                const { data, error } = await supabase
                    .from('appointments')
                    .select('*, customers(name), organizations(name)')
                    .eq('id', numericId)
                    .single();
                setLoading(false);
                
                if (data) {
                    setSelectedAppointment(data as any);
                    setIsModalOpen(true);
                    navigate(location.pathname, { replace: true, state: null });
                } else {
                    console.error("Could not find appointment with ID to open from notification:", numericId, error?.message || error);
                    // Also clear state here to prevent retries.
                    navigate(location.pathname, { replace: true, state: null });
                }
            }
        };
        findAndOpenAppointment(state.openModalForId);
    } else if (state?.openModalWithCustomerId && !isModalOpen) {
        setModalDefaultCustomerId(state.openModalWithCustomerId);
        handleOpenModal(null, new Date());
        navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, appointments, isModalOpen, navigate, location.pathname]);

  const handleOpenModal = (appointment: Appointment | null = null, defaultDate: Date | null = null) => {
    setSelectedAppointment(appointment);
    setModalDefaultDate(defaultDate);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAppointment(null);
    setModalDefaultDate(null);
    setModalDefaultCustomerId(null);
  };

  const handleSaveAppointment = async (appointmentData: Partial<Appointment>) => {
    if (!user || !profile?.org_id) {
        alert("Cannot save: Missing user or organization context.");
        return;
    }
    try {
        let dataToUpsert = { ...appointmentData };
        if (!dataToUpsert.id) { // New appointment
            const newNumber = await generateNextNumber(profile.org_id, 'appointment');
            dataToUpsert.appointment_number = newNumber;
        }

        const { data: savedAppt, error } = await supabase
            .from('appointments')
            .upsert(dataToUpsert)
            .select()
            .single();

        if (error) throw error;

        // Notification logic
        if (savedAppt && savedAppt.user_id && savedAppt.user_id !== user.id) {
            await createNotification({
                user_id: savedAppt.user_id,
                org_id: profile.org_id,
                title: 'newAppointmentAssigned',
                body: JSON.stringify({
                  key: 'appointmentWasAssignedToYouBy',
                  params: {
                    appointmentTitle: savedAppt.title,
                    userName: profile.full_name,
                  },
                }),
                type: 'new_appointment',
                related_entity_path: '/appointments',
                related_entity_id: savedAppt.id.toString(),
            });
        }
        
        await fetchAppointments();
        handleCloseModal();

    } catch (error: any) {
        alert('Error saving appointment: ' + error.message);
    }
  };

  const handleRequestDelete = (appointmentId: number) => {
    const apptToDelete = appointments.find(a => a.id === appointmentId);
    if (apptToDelete) {
        setAppointmentToDelete(apptToDelete);
        handleCloseModal();
    }
  };

  const handleConfirmDelete = async () => {
    if (!appointmentToDelete) return;
    const { error } = await supabase.from('appointments').delete().eq('id', appointmentToDelete.id);
    if (error) {
        alert('Error deleting appointment: ' + error.message);
    } else {
        fetchAppointments();
    }
    setAppointmentToDelete(null);
  };

  const handlePrev = () => {
    if (view === 'month') setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    else if (view === 'week') setCurrentDate(prev => addDays(prev, -7));
    else setCurrentDate(prev => addDays(prev, -1));
  };
  
  const handleNext = () => {
    if (view === 'month') setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    else if (view === 'week') setCurrentDate(prev => addDays(prev, 7));
    else setCurrentDate(prev => addDays(prev, 1));
  };
  
  const handleToday = () => setCurrentDate(new Date());

  const handleCopyAppointment = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profile?.role === 'super_admin' || !profile?.org_id) return;
    const apptToCopy = appointments.find(a => a.id === id);
    if (!apptToCopy) return;
  
    if (window.confirm(`Are you sure you want to duplicate "${apptToCopy.title}"?`)) {
      // Manually construct the new object to ensure only valid fields are inserted.
      const newAppointment: Partial<Appointment> = {
        user_id: user?.id,
        org_id: apptToCopy.org_id,
        customer_id: apptToCopy.customer_id,
        title: `COPY OF ${apptToCopy.title}`,
        start_time: apptToCopy.start_time,
        end_time: apptToCopy.end_time,
        notes: apptToCopy.notes,
        status: 'draft', // Duplicates start as draft
      };
  
      const { error } = await supabase.from('appointments').insert(newAppointment);
  
      if (error) {
        alert('Error duplicating appointment: ' + error.message);
      } else {
        fetchAppointments();
      }
    }
  };

  const statusColors: { [key in AppointmentStatus]: string } = {
    draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-300/50',
    open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300 border border-purple-300/50',
    done: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
  };

  const appointmentStatuses: AppointmentStatus[] = ['draft', 'open', 'in_progress', 'done'];


  const renderHeader = () => (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-t-lg shadow">
      <div className="flex items-center space-x-4">
        <button onClick={handleToday} className="px-4 py-2 text-sm font-medium border rounded-md dark:border-gray-600">{t('today')}</button>
        <div className="flex items-center space-x-1">
          <button onClick={handlePrev} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5"/></button>
          <button onClick={handleNext} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5"/></button>
        </div>
        <h2 className="text-xl font-bold">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
      </div>
      <div className="flex items-center space-x-2">
        {(['day', 'week', 'month'] as CalendarView[]).map(v => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize ${view === v ? 'bg-primary-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{t(v as any)}</button>
        ))}
      </div>
    </div>
  );

  const renderMonthView = () => {
      const days = [];
      let day = startOfWeek(startOfMonth(currentDate));
      for (let i = 0; i < 42; i++) {
        days.push(new Date(day));
        day = addDays(day, 1);
      }
      
      const isToday = (d: Date) => new Date().toDateString() === d.toDateString();
      const dayHeaders = t('dashboard') === 'Dashboard' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

      return (
        <div className="grid grid-cols-7">
            {dayHeaders.map(day => (
                <div key={day} className="text-center font-semibold text-xs py-2 border-b dark:border-gray-700">{day}</div>
            ))}
            {days.map((d, i) => {
                const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
                const dayEnd = new Date(d); dayEnd.setHours(23,59,59,999);
                const appointmentsForDay = appointments.filter(a => {
                    const apptStart = new Date(a.start_time);
                    const apptEnd = new Date(a.end_time);
                    return apptStart <= dayEnd && apptEnd >= dayStart;
                });
                const allDayAppointments = appointmentsForDay.filter(a => a.is_all_day);
                const timedAppointments = appointmentsForDay.filter(a => !a.is_all_day && new Date(a.start_time).toDateString() === d.toDateString());
                const isCurrentMonth = d.getMonth() === currentDate.getMonth();

                return (
                    <div 
                        key={i} 
                        className={`border-t border-l dark:border-gray-700 p-2 ${isCurrentMonth ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} relative min-h-[120px] flex flex-col cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700`}
                        onClick={() => { setView('day'); setCurrentDate(d); }}
                    >
                        <span className={`absolute top-2 right-2 text-xs w-6 h-6 flex items-center justify-center rounded-full ${isToday(d) ? 'bg-primary-600 text-white' : ''} ${!isCurrentMonth ? 'text-gray-400' : ''}`}>{d.getDate()}</span>
                        <div className="mt-6 space-y-1 overflow-hidden">
                           {allDayAppointments.map(appt => (
                                <div key={appt.id} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs p-1 rounded-md truncate">
                                    {appt.title}
                                </div>
                            ))}
                            {timedAppointments.map(appt => (
                                <div key={appt.id} className="bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200 text-xs p-1 rounded-md truncate">
                                    <span className="font-mono text-xs">{formatEuropeanTime(appt.start_time)}</span> {appt.title}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    );
  };
  
  const renderWeekView = () => {
    const weekDays = [];
    let day = startOfWeek(currentDate);
    for (let i = 0; i < 7; i++) {
        weekDays.push(new Date(day));
        day = addDays(day, 1);
    }

    const isToday = (d: Date) => new Date().toDateString() === d.toDateString();

    return (
        <div className="grid grid-cols-7 flex-1 border-t dark:border-gray-700">
            {weekDays.map((d, i) => {
                const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
                const dayEnd = new Date(d); dayEnd.setHours(23,59,59,999);
                const appointmentsForDay = appointments.filter(a => {
                    const apptStart = new Date(a.start_time);
                    const apptEnd = new Date(a.end_time);
                    return apptStart <= dayEnd && apptEnd >= dayStart;
                });
                const allDayAppointments = appointmentsForDay.filter(a => a.is_all_day);
                const timedAppointments = appointmentsForDay.filter(a => !a.is_all_day && new Date(a.start_time).toDateString() === d.toDateString());
                return (
                    <div key={i} className="border-l dark:border-gray-700 flex flex-col">
                        <div className="text-center mb-2 p-2 border-b dark:border-gray-700">
                            <p className="text-xs">{format(d, 'eee')}</p>
                            <span className={`text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto ${isToday(d) ? 'bg-primary-600 text-white' : ''}`}>{d.getDate()}</span>
                        </div>
                        <div className="flex-1 flex flex-col p-2 space-y-2">
                            <div className="space-y-1 border-b dark:border-gray-700 pb-2">
                                {allDayAppointments.map(appt => (
                                    <div key={appt.id} onClick={() => handleOpenModal(appt)} className="cursor-pointer bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs p-2 rounded-md truncate">
                                        {appt.title}
                                    </div>
                                ))}
                            </div>
                           {timedAppointments.length > 0 ? timedAppointments.map(appt => (
                                <div key={appt.id} className="bg-primary-100 dark:bg-primary-900/50 p-2 rounded-lg group relative">
                                    <div onClick={() => handleOpenModal(appt)} className="cursor-pointer">
                                        <div className="flex justify-between items-start">
                                            <p className="font-semibold text-sm text-primary-800 dark:text-primary-200 truncate pr-1">{appt.title}</p>
                                            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${statusColors[appt.status]} capitalize`}>{t(appt.status as any)}</span>
                                        </div>
                                        <p className="text-xs font-mono text-gray-500">{appt.appointment_number}</p>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">{formatEuropeanTime(appt.start_time)}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-300 truncate">{appt.customers?.name || (appt.type === 'absence' ? '' : t('internalAppointment'))}</p>
                                        {profile?.role === 'super_admin' && <p className="text-xs text-yellow-600 dark:text-yellow-400 truncate">{(appt as any).organizations?.name}</p>}
                                    </div>
                                    {profile?.role !== 'super_admin' && (
                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => handleCopyAppointment(appt.id, e)} className="p-1 rounded-full bg-white/50 hover:bg-white/80 dark:bg-gray-800/50 dark:hover:bg-gray-800/80" title="Duplicate Appointment">
                                                <DocumentDuplicateIcon className="w-4 h-4 text-gray-600 dark:text-gray-300"/>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="text-center text-xs text-gray-400 mt-4 flex-1">No timed events</div>
                            )}
                             <div className="pt-2">
                                <button onClick={() => handleOpenModal(null, d)} className="w-full text-center text-xs text-gray-400 hover:text-primary-600 p-1 rounded-md border border-dashed hover:border-primary-600 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:border-gray-400">
                                    + Add
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    );
  };
  
  const renderDayView = () => {
      const dayStart = new Date(currentDate); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(currentDate); dayEnd.setHours(23,59,59,999);
      const appointmentsForDay = appointments.filter(a => {
          const apptStart = new Date(a.start_time);
          const apptEnd = new Date(a.end_time);
          return apptStart <= dayEnd && apptEnd >= dayStart;
      });
      const allDayAppointments = appointmentsForDay.filter(a => a.is_all_day);
      const timedAppointments = appointmentsForDay.filter(a => !a.is_all_day && new Date(a.start_time).toDateString() === currentDate.toDateString());
      return (
        <div className="p-4 flex-1 bg-white dark:bg-gray-800">
            {allDayAppointments.length > 0 && (
                <div className="mb-4 border-b pb-4">
                    <h3 className="font-semibold text-sm mb-2">All-day</h3>
                    <div className="space-y-2">
                    {allDayAppointments.map(appt => (
                         <div key={appt.id} onClick={() => handleOpenModal(appt)} className="cursor-pointer bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-2 rounded-md truncate">
                            {appt.title}
                        </div>
                    ))}
                    </div>
                </div>
            )}
            {timedAppointments.length > 0 ? (
                <ul className="space-y-4">
                    {timedAppointments.map(appt => (
                        <li key={appt.id} className="p-4 rounded-lg shadow flex items-center justify-between hover:shadow-lg bg-gray-50 dark:bg-gray-700/50">
                            <div onClick={() => handleOpenModal(appt)} className="flex-1 cursor-pointer flex items-start space-x-4">
                                <div className="text-center font-semibold text-primary-600 dark:text-primary-400">
                                    <p>{formatEuropeanTime(appt.start_time)}</p>
                                    <p className="text-xs text-gray-400">to</p>
                                    <p>{formatEuropeanTime(appt.end_time)}</p>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-lg">{appt.title}</h3>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[appt.status]} capitalize`}>{t(appt.status as any)}</span>
                                    </div>
                                    <p className="font-mono text-xs text-gray-500">{appt.appointment_number}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">{appt.customers?.name || (appt.type === 'absence' ? '' : t('internalAppointment'))}</p>
                                    {profile?.role === 'super_admin' && <p className="text-sm text-yellow-600 dark:text-yellow-400">{(appt as any).organizations?.name}</p>}
                                    {appt.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">"{appt.notes}"</p>}
                                </div>
                            </div>
                            {profile?.role !== 'super_admin' && (
                                <div className="pl-4 flex-shrink-0">
                                    <button onClick={(e) => handleCopyAppointment(appt.id, e)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600" title="Duplicate Appointment">
                                        <DocumentDuplicateIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                allDayAppointments.length === 0 && <div className="text-center py-16 text-gray-500">{t('noAppointmentsFound')} for this day.</div>
            )}
        </div>
      );
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('appointments')}</h1>
          <div className="flex items-center gap-4">
             <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
                className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="all">All Statuses</option>
                {appointmentStatuses.map(status => (
                  <option key={status} value={status} className="capitalize">{t(status as any)}</option>
                ))}
              </select>
            <button
              onClick={() => handleOpenModal(null, currentDate)}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              {t('addAppointment')}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col">
          {renderHeader()}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">Loading...</div>
          ) : (
            <>
              {view === 'month' && renderMonthView()}
              {view === 'week' && renderWeekView()}
              {view === 'day' && renderDayView()}
            </>
          )}
        </div>
      </div>
      {isModalOpen && (
        <AppointmentModal 
            appointment={selectedAppointment} 
            customers={customers}
            onClose={handleCloseModal} 
            onSave={handleSaveAppointment}
            onDelete={handleRequestDelete}
            defaultDate={modalDefaultDate}
            defaultCustomerId={modalDefaultCustomerId}
        />
      )}
      <ConfirmModal
        isOpen={!!appointmentToDelete}
        onClose={() => setAppointmentToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Appointment"
        message={`Are you sure you want to delete the appointment "${appointmentToDelete?.title}"?`}
        confirmText="Delete"
      />
    </>
  );
};

export default AppointmentsPage;