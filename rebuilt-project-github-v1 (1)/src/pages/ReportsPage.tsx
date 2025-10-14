import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Customer, Visit, Invoice, Quote, Profile, Organization, Expense } from '../types';
import DatePicker from '../components/ui/DatePicker';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { downloadCsv, generateReportPdf } from '../lib/export';
import { generateDatevExport } from '../lib/datev';
import { ArrowDownTrayIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface SalesByCustomer {
  customerName: string;
  totalSales: number;
}
interface TopSellingProduct {
    productName: string;
    totalQuantity: number;
    totalRevenue: number;
}
interface TeamPerformance {
    employeeName: string;
    totalRevenue: number;
    completedVisits: number;
}

interface ReportData {
  kpis: {
    newCustomers: number;
    avgInvoiceValue: number;
    quoteConversionRate: number;
  };
  profitLoss: {
    revenue: number;
    expenses: number;
    profit: number;
  };
  salesByCustomer: SalesByCustomer[];
  taxSummary: {
    collected: number;
  };
  topSellingProducts: TopSellingProduct[];
  teamPerformance: TeamPerformance[];
}

const ReportsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const [startDate, setStartDate] = useState<Date | null>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [endDate, setEndDate] = useState<Date | null>(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  
  useEffect(() => {
    if (profile?.role === 'super_admin') {
      supabase.from('organizations').select('*').order('name').then(({ data }) => {
        setOrganizations(data || []);
      });
    } else if (profile?.org_id) {
      setSelectedOrgId(profile.org_id);
      supabase.from('organizations').select('*').eq('id', profile.org_id).single().then(({ data }) => {
        if (data) {
          setOrganizations([data]);
          setCurrentOrganization(data);
        }
      });
    }
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [exportMenuRef]);

  const generateReport = useCallback(async () => {
    const targetOrgId = profile?.role === 'super_admin' ? selectedOrgId : profile?.org_id;
    if (!user || !targetOrgId || !startDate || !endDate) return;
    setLoading(true); setReportData(null);
    const startDateString = format(startDate, 'yyyy-MM-dd');
    const endDateString = format(endDate, 'yyyy-MM-dd');
    const [{ data: invoices }, { data: expenses }, { data: quotes }, { data: customers }, { data: visits }, { data: employees }] = await Promise.all([
      supabase.from('invoices').select('id, total_amount, customer_id, user_id, customers!inner(name)').eq('org_id', targetOrgId).eq('status', 'paid').gte('issue_date', startDateString).lte('issue_date', endDateString),
      supabase.from('expenses').select('amount').eq('org_id', targetOrgId).gte('expense_date', startDateString).lte('expense_date', endDateString),
      supabase.from('quotes').select('status').eq('org_id', targetOrgId).gte('issue_date', startDateString).lte('issue_date', endDateString),
      supabase.from('customers').select('created_at').eq('org_id', targetOrgId).gte('created_at', startDateString).lte('created_at', endDateString),
      supabase.from('visits').select('assigned_employee_id, status').eq('org_id', targetOrgId).gte('visit_date', startDateString).lte('visit_date', endDateString),
      supabase.from('profiles').select('id, full_name, email').eq('org_id', targetOrgId),
    ]);
    const paidInvoices = invoices || [];
    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const avgInvoiceValue = paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0;
    const acceptedQuotes = (quotes || []).filter(q => q.status === 'accepted').length;
    const relevantQuotes = (quotes || []).filter(q => ['sent', 'accepted', 'declined'].includes(q.status)).length;
    const quoteConversionRate = relevantQuotes > 0 ? (acceptedQuotes / relevantQuotes) * 100 : 0;
    const totalExpenses = (expenses || []).reduce((sum, exp) => sum + exp.amount, 0);
    const profit = totalRevenue - totalExpenses;
    const customerSales: { [key: string]: number } = {};
    paidInvoices.forEach(inv => {
      const customerName = (inv.customers as any)?.name || 'Unknown Customer';
      customerSales[customerName] = (customerSales[customerName] || 0) + inv.total_amount;
    });
    const salesByCustomer = Object.entries(customerSales).map(([customerName, totalSales]) => ({ customerName, totalSales })).sort((a, b) => a.totalSales - b.totalSales);
    let totalVatCollected = 0;
    if (paidInvoices.length > 0) {
      const { data: items } = await supabase.from('invoice_items').select('quantity, unit_price, vat_rate').in('invoice_id', paidInvoices.map(i => i.id));
      totalVatCollected = (items || []).reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.vat_rate / 100)), 0);
    }
    let topSellingProducts: TopSellingProduct[] = [];
    if (paidInvoices.length > 0) {
      const { data: items } = await supabase.from('invoice_items').select('quantity, unit_price, products!left(name)').in('invoice_id', paidInvoices.map(i => i.id));
      const productMap: { [key: string]: { totalQuantity: number, totalRevenue: number } } = {};
      (items || []).forEach(item => {
        if (item.products) {
          const name = (item.products as any)?.name;
          if (name) {
            if (!productMap[name]) productMap[name] = { totalQuantity: 0, totalRevenue: 0 };
            productMap[name].totalQuantity += item.quantity;
            productMap[name].totalRevenue += item.quantity * item.unit_price;
          }
        }
      });
      topSellingProducts = Object.entries(productMap).map(([productName, data]) => ({ productName, ...data })).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);
    }
    const teamRevenueMap: { [key: string]: number } = {};
    paidInvoices.forEach(inv => { if (inv.user_id) teamRevenueMap[inv.user_id] = (teamRevenueMap[inv.user_id] || 0) + inv.total_amount; });
    const teamVisitsMap: { [key: string]: number } = {};
    (visits || []).forEach(v => { if (v.assigned_employee_id && v.status === 'completed') { teamVisitsMap[v.assigned_employee_id] = (teamVisitsMap[v.assigned_employee_id] || 0) + 1; } });
    const teamPerformance = (employees || []).map(emp => ({ employeeName: emp.full_name || emp.email, totalRevenue: teamRevenueMap[emp.id] || 0, completedVisits: teamVisitsMap[emp.id] || 0 })).filter(e => e.totalRevenue > 0 || e.completedVisits > 0).sort((a, b) => b.totalRevenue - a.totalRevenue);
    setReportData({ kpis: { newCustomers: (customers || []).length, avgInvoiceValue, quoteConversionRate }, profitLoss: { revenue: totalRevenue, expenses: totalExpenses, profit }, salesByCustomer, taxSummary: { collected: totalVatCollected }, topSellingProducts, teamPerformance });
    setLoading(false);
  }, [user, profile, startDate, endDate, selectedOrgId]);

  const handleExport = (fileType: 'csv' | 'pdf') => {
    if (!reportData) { alert(t('pleaseGenerateReportFirst')); return; }
    const orgName = organizations.find(o => o.id === (profile?.role === 'super_admin' ? selectedOrgId : profile?.org_id))?.company_name || 'Report';
    const dateRange = `${format(startDate!, 'yyyy-MM-dd')}_to_${format(endDate!, 'yyyy-MM-dd')}`;
    const filename = `${orgName}_Report_${dateRange}`;
    if (fileType === 'csv') {
      const dataToExport = [...reportData.salesByCustomer.map(item => ({ Report: 'Sales by Customer', ...item })), ...reportData.topSellingProducts.map(item => ({ Report: 'Top Selling Products', ...item })), ...reportData.teamPerformance.map(item => ({ Report: 'Team Performance', ...item }))];
      downloadCsv(dataToExport, `${filename}.csv`);
    } else if (fileType === 'pdf') {
      generateReportPdf(reportData, orgName, { start: format(startDate!, 'dd.MM.yyyy'), end: format(endDate!, 'dd.MM.yyyy') }, t);
    }
    setIsExportMenuOpen(false);
  };

  const handleDatevExport = async () => {
    const targetOrgId = profile?.role === 'super_admin' ? selectedOrgId : profile?.org_id;
    const org = organizations.find(o => o.id === targetOrgId);
    if (!org || !startDate || !endDate) return;

    if (!org.datev_settings || !org.datev_settings.debtor_account) {
        alert("DATEV settings are incomplete. Please configure them in the Settings page.");
        return;
    }

    setLoading(true);
    try {
        const startDateString = format(startDate, 'yyyy-MM-dd');
        const endDateString = format(endDate, 'yyyy-MM-dd');

        const { data: invoices } = await supabase.from('invoices').select('*, invoice_items(*), customers(name)').eq('org_id', targetOrgId).eq('status', 'paid').gte('issue_date', startDateString).lte('issue_date', endDateString);
        const { data: expenses } = await supabase.from('expenses').select('*').eq('org_id', targetOrgId).gte('expense_date', startDateString).lte('expense_date', endDateString);

        await generateDatevExport(invoices || [], expenses || [], org.datev_settings, { start: startDate, end: endDate });

    } catch (error: any) {
        alert("Failed to generate DATEV export: " + error.message);
    } finally {
        setLoading(false);
        setIsExportMenuOpen(false);
    }
  };

  const ReportCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
    <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-md p-6 ${className}`}>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </div>
  );
  
  const KPICard: React.FC<{ title: string; value: string; }> = ({ title, value }) => (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );

  return (
    <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('reports')}</h1>
            {reportData && (
                <div className="relative" ref={exportMenuRef}>
                    <button onClick={() => setIsExportMenuOpen(prev => !prev)} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md shadow-sm hover:bg-gray-700">
                        <ArrowDownTrayIcon className="w-5 h-5 mr-2" /> {t('export')}
                        <ChevronDownIcon className="w-4 h-4 ml-2"/>
                    </button>
                    {isExportMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg z-10">
                            {currentOrganization?.is_datev_export_enabled && (
                                <button onClick={handleDatevExport} disabled={loading} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50">{t('exportForDatev')}</button>
                            )}
                            <button onClick={() => handleExport('csv')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">{t('exportAsCsv')}</button>
                            <button onClick={() => handleExport('pdf')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">{t('exportAsPdf')}</button>
                        </div>
                    )}
                </div>
            )}
        </div>
      
      <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col md:flex-row items-center gap-4">
        {profile?.role === 'super_admin' && (
            <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('organization')}</label>
                <select value={selectedOrgId} onChange={e => {
                    setSelectedOrgId(e.target.value);
                    setCurrentOrganization(organizations.find(o => o.id === e.target.value) || null);
                }} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                    <option value="">-- {t('selectOrg')} --</option>
                    {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
            </div>
        )}
        <div className="flex-1 w-full"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('startDate')}</label><DatePicker selected={startDate} onChange={setStartDate} /></div>
        <div className="flex-1 w-full"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('endDate')}</label><DatePicker selected={endDate} onChange={setEndDate} /></div>
        <button onClick={generateReport} disabled={loading || (profile?.role === 'super_admin' && !selectedOrgId)} className="w-full md:w-auto mt-4 md:mt-0 px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700 disabled:bg-primary-300">
          {loading ? t('generating') : t('generateReport')}
        </button>
      </div>

      {loading && <div className="text-center p-8">{t('generating')}</div>}

      {reportData && (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><KPICard title={t('newCustomers')} value={reportData.kpis.newCustomers.toString()} /><KPICard title={t('avgInvoiceValue')} value={`€${reportData.kpis.avgInvoiceValue.toFixed(2)}`} /><KPICard title={t('quoteConversion')} value={`${reportData.kpis.quoteConversionRate.toFixed(1)}%`} /></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><ReportCard title={t('profitLoss')}><div className="space-y-3"><div className="flex justify-between items-baseline"><p className="text-gray-600 dark:text-gray-400">{t('totalRevenue')}</p><p className="text-2xl font-semibold text-green-600">€{reportData.profitLoss.revenue.toFixed(2)}</p></div><div className="flex justify-between items-baseline"><p className="text-gray-600 dark:text-gray-400">{t('totalExpenses')}</p><p className="text-2xl font-semibold text-red-600">- €{reportData.profitLoss.expenses.toFixed(2)}</p></div><hr className="border-gray-200 dark:border-gray-600 my-2" /><div className="flex justify-between items-baseline"><p className="font-bold text-gray-800 dark:text-gray-200">{t('netProfit')}</p><p className={`text-3xl font-bold ${reportData.profitLoss.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>€{reportData.profitLoss.profit.toFixed(2)}</p></div></div></ReportCard><ReportCard title={t('taxSummary')}><div className="space-y-3"><div className="flex justify-between items-baseline"><p className="text-gray-600 dark:text-gray-400">{t('vatCollected')}</p><p className="text-2xl font-semibold text-blue-600">€{reportData.taxSummary.collected.toFixed(2)}</p></div><p className="text-xs text-gray-400 italic pt-4">{t('vatPaidNotTracked')}</p></div></ReportCard></div>
            <ReportCard title={t('salesByCustomer')} className="min-h-[400px]">{reportData.salesByCustomer.length > 0 ? (<ResponsiveContainer width="100%" height={300 + reportData.salesByCustomer.length * 10}><BarChart data={reportData.salesByCustomer} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(200, 200, 200, 0.2)"/><XAxis type="number" tickFormatter={(value) => `€${value}`} /><YAxis type="category" dataKey="customerName" width={150} tick={{ fontSize: 12 }} /><Tooltip cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }} formatter={(value) => `€${Number(value).toFixed(2)}`} /><Bar dataKey="totalSales" fill="#3b82f6" barSize={20}><LabelList dataKey="totalSales" position="right" formatter={(value) => `€${Number(value).toFixed(0)}`} fontSize={10} /></Bar></BarChart></ResponsiveContainer>) : <p className="text-center text-gray-500 py-10">{t('noSalesDataForPeriod')}</p>}</ReportCard>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><ReportCard title={t('topSellingProducts')}><div className="overflow-auto max-h-72"><table className="min-w-full text-sm"><thead className="sticky top-0 bg-white dark:bg-slate-800"><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{t('product')}</th><th className="py-2 text-right">{t('quantity')}</th><th className="py-2 text-right">{t('revenue')}</th></tr></thead><tbody>{reportData.topSellingProducts.length > 0 ? reportData.topSellingProducts.map(item => (<tr key={item.productName} className="border-b border-gray-100 dark:border-gray-700"><td className="py-2 pr-4">{item.productName}</td><td className="py-2 text-right">{item.totalQuantity}</td><td className="py-2 text-right font-medium">€{item.totalRevenue.toFixed(2)}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-gray-500">{t('noProductSalesData')}</td></tr>)}</tbody></table></div></ReportCard><ReportCard title={t('teamPerformance')}><div className="overflow-auto max-h-72"><table className="min-w-full text-sm"><thead className="sticky top-0 bg-white dark:bg-slate-800"><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-2">{t('employee')}</th><th className="py-2 text-right">{t('revenue')}</th><th className="py-2 text-right">{t('visitsDone')}</th></tr></thead><tbody>{reportData.teamPerformance.length > 0 ? reportData.teamPerformance.map(item => (<tr key={item.employeeName} className="border-b border-gray-100 dark:border-gray-700"><td className="py-2 pr-4">{item.employeeName}</td><td className="py-2 text-right font-medium">€{item.totalRevenue.toFixed(2)}</td><td className="py-2 text-right">{item.completedVisits}</td></tr>)) : (<tr><td colSpan={3} className="py-4 text-center text-gray-500">{t('noTeamPerformanceData')}</td></tr>)}</tbody></table></div></ReportCard></div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;