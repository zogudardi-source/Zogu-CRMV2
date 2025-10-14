import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTabs } from '../../contexts/TabContext';
import { useModal } from '../../contexts/ModalContext';
import { Appointment, Task, Visit, VisitStatus, Quote, QuoteStatus, AppointmentStatus } from '../../types';
import { BriefcaseIcon, MapPinIcon, UserIcon, DocumentPlusIcon, CalendarIcon, ClipboardDocumentListIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { formatEuropeanTime, parseAsLocalDate } from '../../lib/formatting';
import { format, isValid, startOfMonth, endOfMonth, startOfWeek as dateFnsStartOfWeek, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { de, sq } from 'date-fns/locale';

type AgendaView = 'day' | 'week' | 'month';
type ActivityFilter = 'visits' | 'appointments' | 'tasks' | 'quotes';

interface FieldServiceDashboardProps {
    refreshKey: number;
}

const FieldServiceDashboard: React.FC<FieldServiceDashboardProps> = ({ refreshKey }) => {
    const { profile } = useAuth();
    const { t, language } = useLanguage();
    const { openTab } = useTabs();
    const { openEditTaskModal, openEditAppointmentModal } = useModal();
    
    const locale = language === 'de' ? de : sq;

    const [visits, setVisits] = useState<Visit[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [agendaView, setAgendaView] = useState<AgendaView>('day');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [activeFilters, setActiveFilters] = useState<Record<ActivityFilter, boolean>>({
        visits: true,
        appointments: true,
        tasks: true,
        quotes: false,
    });
    const [loading, setLoading] = useState(true);
    
    const visibleDateRange = useMemo(() => {
        let start, end;
        const refDate = new Date(currentDate);

        switch (agendaView) {
            case 'week':
                start = dateFnsStartOfWeek(refDate, { weekStartsOn: 1 });
                end = addDays(start, 6);
                break;
            case 'month':
                start = startOfMonth(refDate);
                end = endOfMonth(refDate);
                break;
            case 'day':
            default:
                start = new Date(refDate);
                end = new Date(refDate);
                break;
        }
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }, [currentDate, agendaView]);


    const fetchDashboardData = useCallback(async () => {
        if (!profile) return;
        setLoading(true);

        const { start, end } = visibleDateRange;
        const orgId = profile.org_id;
        const userId = profile.id;
        const startISO = start.toISOString();
        const endISO = end.toISOString();

        const [
            { data: weekVisits },
            { data: weekAppointments },
            { data: tasksWithEndTime },
            { data: tasksWithoutEndTime },
            { data: weekQuotes }
        ] = await Promise.all([
            supabase.from('visits').select('*, customers(name, address)').eq('org_id', orgId).eq('assigned_employee_id', userId).lte('start_time', endISO).gte('end_time', startISO),
            supabase.from('appointments').select('*, customers(name, address)').eq('org_id', orgId).eq('user_id', userId).lte('start_time', endISO).gte('end_time', startISO),
            // Query for tasks WITH an end time, checking for overlaps
            supabase.from('tasks').select('*, customers(name, address)').eq('org_id', orgId).eq('user_id', userId).not('end_time', 'is', null).lte('start_time', endISO).gte('end_time', startISO),
            // Query for tasks WITHOUT an end time, checking if start time is in range
            supabase.from('tasks').select('*, customers(name, address)').eq('org_id', orgId).eq('user_id', userId).is('end_time', null).gte('start_time', startISO).lte('start_time', endISO),
            supabase.from('quotes').select('*, customers(name)').eq('org_id', orgId).eq('user_id', userId).gte('issue_date', startISO).lte('issue_date', endISO)
        ]);
        
        const allTasks = [...(tasksWithEndTime || []), ...(tasksWithoutEndTime || [])];
        const uniqueTasks = Array.from(new Map(allTasks.map(item => [item.id, item])).values());
        // Sort tasks by start time after combining
        uniqueTasks.sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime());

        setVisits((weekVisits as any) || []);
        setAppointments((weekAppointments as any) || []);
        setTasks((uniqueTasks as any) || []);
        setQuotes((weekQuotes as any) || []);
        setLoading(false);

    }, [profile, visibleDateRange]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData, refreshKey]);

    const appointmentStatusColors: { [key in AppointmentStatus]: string } = {
        draft: 'yellow', open: 'blue', in_progress: 'purple', done: 'green',
    };
    const toggleFilter = (filter: ActivityFilter) => {
      setActiveFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
    };

    const agendaItems = useMemo(() => {
        const visitStatusColors: { [key in VisitStatus]: string } = { planned: 'blue', completed: 'green', cancelled: 'red' };
        const quoteStatusColors: { [key in QuoteStatus]: string } = { draft: 'yellow', sent: 'blue', accepted: 'green', declined: 'red' };

        const combined = [
            ...(activeFilters.visits ? visits.map(v => ({ id: `visit-${v.id}`, type: 'visit' as const, date: parseAsLocalDate(v.start_time), title: v.purpose || v.category, customerDetails: `Customer: ${v.customers?.name || 'N/A'}`, locationDetails: v.location || v.customers?.address, link: `/visits/edit/${v.id}`, label: v.visit_number, icon: BriefcaseIcon, status: v.status, statusColor: visitStatusColors[v.status] })) : []),
            ...(activeFilters.appointments ? appointments.map(a => ({ id: `appt-${a.id}`, type: 'appointment' as const, date: parseAsLocalDate(a.start_time), title: a.title, customerDetails: `Customer: ${a.customers?.name || 'N/A'}`, locationDetails: a.customers?.address, link: `/appointments`, label: t('appointments'), labelKey: 'appointments', state: { openModalForId: a.id.toString() }, icon: CalendarIcon, status: a.status, statusColor: appointmentStatusColors[a.status] })) : []),
            ...(activeFilters.tasks ? tasks.filter(task => task.start_time).map(task => ({ id: `task-${task.id}`, type: 'task' as const, date: parseAsLocalDate(task.start_time!), title: task.title, customerDetails: `Task for ${task.customers?.name || 'internal task'}`, locationDetails: task.customers?.address, link: `/tasks`, label: t('tasks'), labelKey: 'tasks', state: { openModalForId: task.id }, icon: ClipboardDocumentListIcon, status: task.is_complete ? 'completed' : 'pending', statusColor: task.is_complete ? 'green' : 'yellow' })) : []),
            ...(activeFilters.quotes ? quotes.map(q => ({ id: `quote-${q.id}`, type: 'quote' as const, date: parseAsLocalDate(q.issue_date), title: `Quote #${q.quote_number}`, customerDetails: `For: ${q.customers?.name}`, locationDetails: `Total: €${q.total_amount.toFixed(2)}`, link: `/quotes/edit/${q.id}`, label: q.quote_number, icon: DocumentPlusIcon, status: q.status, statusColor: quoteStatusColors[q.status] })) : [])
        ];
        return combined
            .filter((item): item is typeof item & { date: Date } => !!item.date && isValid(item.date))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [visits, appointments, tasks, quotes, activeFilters, t]);

    const filterOptions: { id: ActivityFilter, label: string }[] = [
        { id: 'visits', label: t('visits') },
        { id: 'appointments', label: t('appointments') },
        { id: 'tasks', label: t('tasks') },
        { id: 'quotes', label: t('quotes') },
    ];
    
    const handlePrev = () => {
        setCurrentDate(current => {
            if (agendaView === 'week') return subWeeks(current, 1);
            if (agendaView === 'month') return subMonths(current, 1);
            return subDays(current, 1);
        });
    };

    const handleNext = () => {
        setCurrentDate(current => {
            if (agendaView === 'week') return addWeeks(current, 1);
            if (agendaView === 'month') return addMonths(current, 1);
            return addDays(current, 1);
        });
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const dateDisplayString = useMemo(() => {
        const { start, end } = visibleDateRange;
        switch (agendaView) {
            case 'day':
                return format(currentDate, 'PPPP', { locale });
            case 'week':
                if (start.getMonth() === end.getMonth()) {
                    return `${format(start, 'd.', { locale })} - ${format(end, 'd. MMMM yyyy', { locale })}`;
                } else {
                    return `${format(start, 'd. MMMM', { locale })} - ${format(end, 'd. MMMM yyyy', { locale })}`;
                }
            case 'month':
                return format(currentDate, 'LLLL yyyy', { locale });
        }
    }, [currentDate, agendaView, visibleDateRange, locale]);

    const AgendaItemCard: React.FC<{item: (typeof agendaItems)[0] & { state?: any, labelKey?: string }}> = ({ item }) => {
      const handleItemClick = () => {
        // Correctly extract the raw ID after the first hyphen, which is crucial for UUIDs (tasks).
        const firstHyphenIndex = item.id.indexOf('-');
        if (firstHyphenIndex === -1) {
          console.error("Malformed agenda item ID:", item.id);
          return;
        }
        const rawId = item.id.substring(firstHyphenIndex + 1);

        if (item.type === 'task') {
            const task = tasks.find(t => t.id === rawId);
            if (task) {
                openEditTaskModal(task);
            }
        } else if (item.type === 'appointment') {
            const apptId = parseInt(rawId, 10);
            const appointment = appointments.find(a => a.id === apptId);
            if (appointment) {
                openEditAppointmentModal(appointment);
            }
        } else {
            openTab({ path: item.link, label: item.label, state: item.state, labelKey: item.labelKey });
        }
      };
      
      return (
      <li key={item.id} onClick={handleItemClick} className="cursor-pointer group">
        <div className="relative pb-8">
            <span className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-gray-200 dark:bg-slate-700 group-hover:bg-primary-500 transition-colors" aria-hidden="true" />
            <div className="relative flex items-start space-x-3">
                <div>
                    <span className="h-10 w-10 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center ring-8 ring-gray-50 dark:ring-slate-900 group-hover:ring-primary-100 dark:group-hover:ring-primary-900/50 transition-all">
                        <item.icon className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 transition-colors" aria-hidden="true" />
                    </span>
                </div>
                <div className="min-w-0 flex-1 pt-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3 -mt-1 group-hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-white flex-1 truncate pr-2">{item.title}</p>
                        <time dateTime={item.date.toISOString()} className="whitespace-nowrap text-sm font-mono bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-200 px-2 py-1 rounded">
                            {formatEuropeanTime(item.date)}
                        </time>
                    </div>
                    <div className="mt-2 space-y-2">
                        <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center"><UserIcon className="w-4 h-4 mr-2 text-gray-400 shrink-0"/><span>{item.customerDetails}</span></p>
                        {item.locationDetails && <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center"><MapPinIcon className="w-4 h-4 mr-2 text-gray-400 shrink-0"/><span>{item.locationDetails}</span></p>}
                        {item.status && <div className="pt-1"><span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-${item.statusColor}-50 text-${item.statusColor}-700 ring-${item.statusColor}-600/20 capitalize`}>{t(item.status as any)}</span></div>}
                    </div>
                </div>
            </div>
        </div>
      </li>
    )};

    const groupedByDay = agendaItems.reduce((acc, item) => {
        const day = item.date.toISOString().split('T')[0];
        if (!acc[day]) acc[day] = [];
        acc[day].push(item);
        return acc;
    }, {} as Record<string, typeof agendaItems>);
    
    const sortedDays = Object.keys(groupedByDay).sort();

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('agenda')}</h1>
                    <div className="flex items-center space-x-2">
                         <span className="font-semibold text-gray-700 dark:text-gray-300">{dateDisplayString}</span>
                        <div className="flex items-center space-x-1">
                            <button onClick={handlePrev} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5"/></button>
                            <button onClick={handleToday} className="px-3 py-1.5 text-sm font-medium border rounded-md dark:border-gray-600">{t('today')}</button>
                            <button onClick={handleNext} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5"/></button>
                        </div>
                        <div className="flex items-center space-x-1 bg-gray-200 dark:bg-slate-700 rounded-lg p-1">
                            <button onClick={() => setAgendaView('day')} className={`px-3 py-1 text-sm font-medium rounded-md capitalize ${agendaView === 'day' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('day')}</button>
                            <button onClick={() => setAgendaView('week')} className={`px-3 py-1 text-sm font-medium rounded-md capitalize ${agendaView === 'week' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('week')}</button>
                            <button onClick={() => setAgendaView('month')} className={`px-3 py-1 text-sm font-medium rounded-md capitalize ${agendaView === 'month' ? 'bg-white dark:bg-slate-800 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('month')}</button>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2 overflow-x-auto pb-2">{filterOptions.map(option => (<button key={option.id} onClick={() => toggleFilter(option.id)} className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${activeFilters[option.id] ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-slate-600'}`}>{option.label}</button>))}</div>
            </div>
            
            {loading ? <div className="text-center p-8 text-gray-500">{t('loadingAgenda')}</div> : agendaItems.length > 0 ? (agendaView === 'day' ? (<div className="flow-root"><ul role="list" className="-mb-8">{agendaItems.map(item => <AgendaItemCard key={item.id} item={item}/>)}</ul></div>) : (<div className="space-y-6">{sortedDays.map(day => (<div key={day}><h2 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">{format(new Date(day + 'T00:00:00'), 'EEEE, dd. MMMM', { locale })}</h2><div className="flow-root"><ul role="list" className="-mb-8">{groupedByDay[day].map(item => <AgendaItemCard key={item.id} item={item}/>)}</ul></div></div>))}</div>)) : (<div className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg shadow-sm"><CalendarIcon className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('noActivitiesFound')}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('agendaClear')}</p></div>)}
        </div>
      );
}

export default FieldServiceDashboard;