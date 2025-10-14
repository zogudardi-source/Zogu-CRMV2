import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTabs } from '../../contexts/TabContext';
import { useModal } from '../../contexts/ModalContext';
import { Invoice, InvoiceStatus, QuoteStatus } from '../../types';
import { DocumentTextIcon, BanknotesIcon, PlusIcon, EnvelopeIcon, ArrowDownTrayIcon, PencilIcon, DocumentPlusIcon, DocumentDuplicateIcon, CalendarIcon, ClipboardDocumentListIcon, BriefcaseIcon, UserPlusIcon, CalendarDaysIcon, CurrencyDollarIcon, ArchiveBoxIcon, ExclamationTriangleIcon, ClockIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import generateDocumentPDF from '../../lib/pdfGenerator';
import UpgradeBanner from '../ui/UpgradeBanner';
import { CubeIcon } from '@heroicons/react/24/solid';
import { formatEuropeanDate } from '../../lib/formatting';
import { parseAsLocalDate } from '../../lib/formatting';
import { useNotifications } from '../../contexts/NotificationContext';

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="p-3 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600">
                <p className="font-bold text-gray-900 dark:text-white mb-2">{label}</p>
                {payload.slice().reverse().map((pld: any) => (
                    pld.value > 0 && (
                        <div key={pld.dataKey} className="flex items-center justify-between space-x-4">
                            <div className="flex items-center">
                                <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: pld.fill }}></span>
                                <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">{pld.name}:</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">€{pld.value.toFixed(2)}</span>
                        </div>
                    )
                ))}
            </div>
        );
    }
    return null;
};

const yAxisTickFormatter = (value: number) => {
    if (value >= 1000) {
        return `€${(value / 1000).toFixed(1)}k`;
    }
    return `€${value}`;
};

interface AdminDashboardProps {
    refreshKey: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ refreshKey }) => {
    const { user, profile } = useAuth();
    const { t, language } = useLanguage();
    const { openTab } = useTabs();
    const { openProductModal, openTaskModal, openExpenseModal, openAppointmentModal, openCustomerModal } = useModal();
    const { addToast } = useNotifications();
    
    const [stats, setStats] = useState({ totalRevenue: 0, unpaidInvoices: 0, pendingQuotes: 0 });
    const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
    const [salesData, setSalesData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [invoiceCount, setInvoiceCount] = useState(0);
    const [quoteCount, setQuoteCount] = useState(0);
    const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
    const [bannerMessage, setBannerMessage] = useState('');
    
    const [actionableItems, setActionableItems] = useState({ overdueInvoices: 0, expiringQuotes: 0, unassignedVisits: 0 });
    const [dispatchSummary, setDispatchSummary] = useState<{ unassignedToday: number; employeeLoad: { id: string; name: string; activityCount: number }[] }>({ unassignedToday: 0, employeeLoad: [] });
  
    const fetchDashboardData = useCallback(async () => {
        if (!user || !profile) return;
        setLoading(true);

        const applyOrgFilter = (query: any) => {
            if (profile?.role !== 'super_admin' && profile?.org_id) {
                return query.eq('org_id', profile.org_id);
            }
            return query;
        };
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const aWeekFromNow = new Date(today);
        aWeekFromNow.setDate(today.getDate() + 7);
        const aWeekFromNowStr = aWeekFromNow.toISOString().split('T')[0];
        const currentYear = today.getFullYear();

        const [
            { data: invoicesData },
            { count: overdueInvoicesCount },
            { count: expiringQuotesCount },
            { count: unassignedVisitsCount },
            { count: unassignedTodayCount },
            { data: employees },
            { data: visitsToday },
            { data: tasksToday },
            { data: appointmentsToday },
            { data: recentInvoicesData },
            { data: pendingQuotesData },
        ] = await Promise.all([
            applyOrgFilter(supabase.from('invoices').select('total_amount, issue_date, status').gte('issue_date', `${currentYear}-01-01`).lte('issue_date', `${currentYear}-12-31`)),
            applyOrgFilter(supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'overdue')),
            applyOrgFilter(supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('valid_until_date', todayStr).lte('valid_until_date', aWeekFromNowStr)),
            applyOrgFilter(supabase.from('visits').select('id', { count: 'exact', head: true }).is('assigned_employee_id', null).eq('status', 'planned')),
            applyOrgFilter(supabase.from('visits').select('id', { count: 'exact', head: true }).is('assigned_employee_id', null).eq('status', 'planned').gte('start_time', `${todayStr}T00:00:00`).lte('start_time', `${todayStr}T23:59:59`)),
            applyOrgFilter(supabase.from('profiles').select('id, full_name, email').in('role', ['field_service_employee', 'key_user', 'admin'])),
            applyOrgFilter(supabase.from('visits').select('id, assigned_employee_id').eq('status', 'planned').gte('start_time', `${todayStr}T00:00:00`).lte('start_time', `${todayStr}T23:59:59`)),
            applyOrgFilter(supabase.from('tasks').select('id, user_id').eq('is_complete', false).gte('start_time', `${todayStr}T00:00:00`).lte('start_time', `${todayStr}T23:59:59`)),
            applyOrgFilter(supabase.from('appointments').select('id, user_id, status').gte('start_time', `${todayStr}T00:00:00`).lte('start_time', `${todayStr}T23:59:59`)),
            applyOrgFilter(supabase.from('invoices').select('*, customers:customers!left(id, name, email), organizations:organizations!left(name)').order('issue_date', { ascending: false }).limit(5)),
            applyOrgFilter(supabase.from('quotes').select('id').eq('status', 'sent')),
        ]);

        if (invoicesData) {
            const totalRevenue = invoicesData.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + inv.total_amount, 0);
            const unpaidInvoices = invoicesData.filter(inv => ['sent', 'overdue'].includes(inv.status)).length;
            setStats({ totalRevenue, unpaidInvoices, pendingQuotes: pendingQuotesData?.length || 0 });

            const monthlySales = Array(12).fill(0).map((_, i) => ({ name: new Date(0, i).toLocaleString(language, { month: 'short' }), paid: 0, sent: 0, overdue: 0, draft: 0 }));
            invoicesData.forEach(inv => {
                const issueDate = parseAsLocalDate(inv.issue_date);
                if (issueDate) {
                    const month = issueDate.getMonth();
                    if (['paid', 'sent', 'overdue', 'draft'].includes(inv.status)) {
                        monthlySales[month][inv.status as InvoiceStatus] += inv.total_amount;
                    }
                }
            });
            setSalesData(monthlySales);
        }
        
        setActionableItems({ overdueInvoices: overdueInvoicesCount || 0, expiringQuotes: expiringQuotesCount || 0, unassignedVisits: unassignedVisitsCount || 0 });

        const employeeLoad = (employees || []).map(emp => {
            const visitCount = (visitsToday || []).filter(v => v.assigned_employee_id === emp.id).length;
            const taskCount = (tasksToday || []).filter(t => t.user_id === emp.id).length;
            const apptCount = (appointmentsToday || []).filter(a => a.user_id === emp.id && a.status !== 'done').length;
            return { id: emp.id, name: emp.full_name || emp.email, activityCount: visitCount + taskCount + apptCount };
        }).sort((a, b) => b.activityCount - a.activityCount);
        setDispatchSummary({ unassignedToday: unassignedTodayCount || 0, employeeLoad });
        
        setRecentInvoices(recentInvoicesData || []);
        
        if (profile?.current_plan === 'free') {
            const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { count: invCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('issue_date', firstDayOfMonth);
            if (invCount !== null) setInvoiceCount(invCount);
            const { count: qCount } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('issue_date', firstDayOfMonth);
            if (qCount !== null) setQuoteCount(qCount);
        }
        setLoading(false);
    }, [user, profile, language]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData, refreshKey]);

    const handleDownloadPDF = async (invoiceId: number) => {
        try {
            await generateDocumentPDF(invoiceId, 'invoice', language);
        } catch (error: any) {
            addToast({ type: 'error', title: 'PDF Error', body: error.message });
        }
    };
    
    const handleNewInvoiceClick = () => {
        if (profile?.current_plan === 'free' && invoiceCount >= 3) {
            setBannerMessage("You've reached your monthly limit of 3 invoices on the Starter plan.");
            setShowUpgradeBanner(true);
        } else {
            openTab({ path: '/invoices/new', label: t('newInvoice'), labelKey: 'newInvoice' });
        }
    };

    const handleNewQuoteClick = () => {
        if (profile?.current_plan === 'free' && quoteCount >= 3) {
            setBannerMessage("You've reached your monthly limit of 3 quotes on the Starter plan.");
            setShowUpgradeBanner(true);
        } else {
            openTab({ path: '/quotes/new', label: t('newQuote'), labelKey: 'newQuote' });
        }
    };
        
    const StatCard: React.FC<{ icon: React.ElementType, title: string, value: string | number, color: string, onClick?: () => void }> = ({ icon: Icon, title, value, color, onClick }) => (
        <div onClick={onClick} className={`p-6 bg-white rounded-xl shadow-md dark:bg-slate-800 flex items-center space-x-4 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow duration-200' : ''}`}>
            <div className={`p-3 rounded-full ${color}`}><Icon className="w-6 h-6 text-white"/></div>
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
  
    const ActionCenter = () => {
        const items = [
            { count: actionableItems.overdueInvoices, textKey: 'overdueInvoices' as const, icon: ExclamationTriangleIcon, path: '/invoices', labelKey: 'invoices', color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-500/10', state: { statusFilter: 'overdue' } },
            { count: actionableItems.expiringQuotes, textKey: 'quotesExpiringSoon' as const, icon: ClockIcon, path: '/quotes', labelKey: 'quotes', color: 'text-amber-500', bgColor: 'bg-amber-500/10', state: { statusFilter: 'sent' } },
            { count: actionableItems.unassignedVisits, textKey: 'unassignedVisits' as const, icon: BriefcaseIcon, path: '/dispatcher', labelKey: 'dispatcher', color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-500/10', state: null },
        ];
        
        const visibleItems = items.filter(item => item.count > 0);
        if(visibleItems.length === 0) return null;

        return (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
            <h2 className="text-lg font-semibold mb-4">{t('actionCenter')}</h2>
            <div className="space-y-3">
                {visibleItems.map(item => (
                    <button key={item.textKey} onClick={() => openTab({ path: item.path, label: t(item.labelKey as any), labelKey: item.labelKey, state: item.state })} className={`w-full flex items-center p-3 rounded-lg text-left transition-colors ${item.bgColor} hover:opacity-80`}>
                        <item.icon className={`w-6 h-6 mr-4 ${item.color}`}/>
                        <div className="flex-1">
                            <span className="font-bold text-gray-900 dark:text-white">{item.count}</span>
                            <span className="ml-2 text-gray-700 dark:text-gray-300">{t(item.textKey)}</span>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-gray-400"/>
                    </button>
                ))}
            </div>
            </div>
        );
    };

    const DispatchHub = () => (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{t('dispatchHub')}</h2>
                <button onClick={() => openTab({ path: '/dispatcher', label: t('dispatcher'), labelKey: 'dispatcher'})} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">{t('goToDispatcher')}</button>
            </div>
            
            {dispatchSummary.unassignedToday > 0 && (
            <div className="p-3 mb-4 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
                <p className="font-semibold text-amber-700 dark:text-amber-300">{dispatchSummary.unassignedToday} {dispatchSummary.unassignedToday > 1 ? t('unassignedActivitiesToday') : t('unassignedActivityToday')}</p>
            </div>
            )}
            
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">{t('teamLoadToday')}</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
                {dispatchSummary.employeeLoad.length > 0 ? dispatchSummary.employeeLoad.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-700/50 rounded-md">
                        <p className="font-medium text-gray-800 dark:text-gray-200">{emp.name}</p>
                        <span className="px-2 py-0.5 text-xs font-semibold text-primary-800 bg-primary-100 dark:text-primary-200 dark:bg-primary-500/20 rounded-full">{emp.activityCount} {emp.activityCount !== 1 ? t('activities') : t('activity')}</span>
                    </div>
                )) : <p className="text-sm text-center text-gray-500 py-4">{t('noEmployeesWithActivitiesToday')}</p>}
            </div>
        </div>
    );
    
    if (loading) return <div className="text-center p-8 text-gray-500">{t('loadingDashboard')}</div>;
    const hasChartData = salesData.some(month => month.paid > 0 || month.sent > 0 || month.overdue > 0 || month.draft > 0);
    const statusColors: { [key in InvoiceStatus]: string } = { draft: 'bg-yellow-100 text-yellow-800', sent: 'bg-blue-100 text-blue-800', paid: 'bg-green-100 text-green-800', overdue: 'bg-red-100 text-red-800' };

    return (
        <div className="space-y-8">
            <UpgradeBanner isOpen={showUpgradeBanner} onClose={() => setShowUpgradeBanner(false)} message={bannerMessage} />
            {profile?.role === 'super_admin' && <div className="p-4 mb-6 bg-yellow-100 border-l-4 border-yellow-500 rounded-r-lg dark:bg-yellow-900/50"><div className="flex"><div className="flex-shrink-0"><CubeIcon className="w-5 h-5 text-yellow-600" /></div><div className="ml-3"><p className="text-sm text-yellow-700 dark:text-yellow-200">{t('superAdminMode')}</p></div></div></div>}
            
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('dashboard')}</h1>
    
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
                <h2 className="text-lg font-semibold mb-4">{t('quickCreate')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                    <button onClick={handleNewInvoiceClick} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><PlusIcon className="w-6 h-6 mb-1" />{t('newInvoice')}</button>
                    <button onClick={handleNewQuoteClick} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-sky-50 text-sky-700 font-semibold rounded-lg hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><DocumentDuplicateIcon className="w-6 h-6 mb-1" />{t('newQuote')}</button>
                    <button onClick={openCustomerModal} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-indigo-50 text-indigo-700 font-semibold rounded-lg hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><UserPlusIcon className="w-6 h-6 mb-1" />{t('newCustomer')}</button>
                    <button onClick={() => openTab({ path: '/visits/new', label: t('newVisit'), labelKey: 'newVisit' })} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-purple-50 text-purple-700 font-semibold rounded-lg hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><BriefcaseIcon className="w-6 h-6 mb-1" />{t('newVisit')}</button>
                    <button onClick={openProductModal} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-pink-50 text-pink-700 font-semibold rounded-lg hover:bg-pink-100 dark:bg-pink-500/10 dark:text-pink-400 dark:hover:bg-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><ArchiveBoxIcon className="w-6 h-6 mb-1" />{t('newProduct')}</button>
                    <button onClick={() => openTaskModal()} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-amber-50 text-amber-700 font-semibold rounded-lg hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><ClipboardDocumentListIcon className="w-6 h-6 mb-1" />{t('addTask')}</button>
                    <button onClick={openExpenseModal} disabled={profile?.role === 'super_admin'} className="flex flex-col items-center justify-center p-3 bg-red-50 text-red-700 font-semibold rounded-lg hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"><CurrencyDollarIcon className="w-6 h-6 mb-1" />{t('addExpense')}</button>
                    <button onClick={() => openAppointmentModal()} className="flex flex-col items-center justify-center p-3 bg-teal-50 text-teal-700 font-semibold rounded-lg hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-400 dark:hover:bg-teal-500/20"><CalendarDaysIcon className="w-6 h-6 mb-1" />{t('addAppointment')}</button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard icon={BanknotesIcon} title={t('totalRevenueThisYear')} value={`€${stats.totalRevenue.toFixed(2)}`} color="bg-green-500" />
                <StatCard icon={DocumentTextIcon} title={t('unpaidInvoices')} value={stats.unpaidInvoices} color="bg-yellow-500" onClick={() => openTab({ path: '/invoices', label: t('invoices'), labelKey: 'invoices', state: { statusFilter: 'sent' } })} />
                <StatCard icon={DocumentPlusIcon} title={t('pending_quotes')} value={stats.pendingQuotes} color="bg-blue-500" onClick={() => openTab({ path: '/quotes', label: t('quotes'), labelKey: 'quotes', state: { statusFilter: 'sent' } })} />
            </div>
    
            <ActionCenter />
    
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md"><h2 className="text-lg font-semibold mb-4">{t('sales_overview')}</h2>{hasChartData ? <ResponsiveContainer width="100%" height={300}><BarChart data={salesData} margin={{ top: 5, right: 20, left: -5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(200, 200, 200, 0.2)"/><XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} /><YAxis tickFormatter={yAxisTickFormatter} tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} /><Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }} /><Legend iconType="circle" iconSize={10} wrapperStyle={{ paddingTop: '20px' }} /><Bar dataKey="paid" stackId="sales" name={t('paid')} fill="#22c55e" radius={[4, 4, 0, 0]} /><Bar dataKey="draft" stackId="sales" name={t('draft')} fill="#eab308" radius={[4, 4, 0, 0]} /><Bar dataKey="sent" stackId="sales" name={t('sent')} fill="#3b82f6" radius={[4, 4, 0, 0]} /><Bar dataKey="overdue" stackId="sales" name={t('overdue')} fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">{t('noSalesDataThisYear')}</div>}</div>
                <div className="lg:col-span-2"><DispatchHub /></div>
            </div>
    
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden"><h2 className="p-6 text-lg font-semibold border-b dark:border-slate-700">{t('recent_invoices')}</h2><div className="overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-50/50 dark:bg-slate-800/50"><tr className="text-left"><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('invoice_number')}</th><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('customer')}</th>{profile?.role === 'super_admin' && <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('organization')}</th>}<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('date')}</th><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('total')}</th><th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('status')}</th><th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('actions')}</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-slate-700">{recentInvoices.length > 0 ? recentInvoices.map(invoice => (<tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50"><td className="px-6 py-4"><button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} className="font-medium text-primary-600 hover:underline">{invoice.invoice_number}</button></td><td className="px-6 py-4 whitespace-nowrap text-sm">{invoice.customers ? (<button onClick={() => openTab({ path: `/customers/${invoice.customer_id}`, label: invoice.customers.name })} className="font-medium text-primary-600 hover:underline">{invoice.customers.name}</button>) : (<span className="text-gray-900 dark:text-gray-200">N/A</span>)}</td>{profile?.role === 'super_admin' && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{((invoice as any).organizations as any)?.name || 'N/A'}</td>}<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(invoice.issue_date)}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">€{invoice.total_amount.toFixed(2)}</td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[invoice.status]} capitalize`}>{t(invoice.status as any)}</span></td><td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2"><button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} title={t('editView')}><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button><button onClick={() => handleDownloadPDF(invoice.id)} title={t('downloadPDF')}><ArrowDownTrayIcon className="w-5 h-5 inline-block text-gray-500 dark:text-gray-400 hover:text-primary-600"/></button></td></tr>)) : (<tr><td colSpan={profile?.role === 'super_admin' ? 7 : 6} className="p-4 text-center text-gray-500">{t('noRecentInvoices')}</td></tr>)}</tbody></table></div></div>
        </div>
    );
}

export default AdminDashboard;