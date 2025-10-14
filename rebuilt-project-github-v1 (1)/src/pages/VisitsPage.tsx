import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Visit, VisitStatus } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, EnvelopeIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate } from '../lib/formatting';
import { generateNextNumber } from '../lib/numberGenerator';
import { addDays, format } from 'date-fns';
import Pagination from '../components/ui/Pagination';
import ConfirmModal from '../components/modals/ConfirmModal';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
const ITEMS_PER_PAGE = 20;

const VisitsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();
  const { addToast } = useNotifications();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<VisitStatus | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'start_time', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [visitToDelete, setVisitToDelete] = useState<Visit | null>(null);
  
  const canCreate = profile?.role !== 'super_admin';
  const canManage = profile?.role !== 'field_service_employee';

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter]);

  const fetchVisits = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    
    let customerIdFilter: number[] | null = null;
    if (searchTerm) {
        const { data: customerIds } = await supabase
            .from('customers')
            .select('id')
            .ilike('name', `%${searchTerm}%`);
        if (customerIds && customerIds.length > 0) {
            customerIdFilter = customerIds.map(c => c.id);
        }
    }

    let query = supabase.from('visits').select('*, customers:customers!left(id, name), profiles:profiles!left(full_name)', { count: 'exact' });

    if (profile.role === 'field_service_employee') {
      query = query.eq('assigned_employee_id', profile.id);
    } else if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (searchTerm) {
        const filters = [`visit_number.ilike.%${searchTerm}%`, `location.ilike.%${searchTerm}%`];
        if (customerIdFilter && customerIdFilter.length > 0) {
            filters.push(`customer_id.in.(${customerIdFilter.join(',')})`);
        }
        query = query.or(filters.join(','));
    }

    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, error, count } = await query
      .order(sortConfig.key, { 
        ascending: sortConfig.direction === 'asc', 
        referencedTable: sortConfig.key.includes('.') ? sortConfig.key.split('.')[0] : undefined 
      })
      .range(from, to);

    if (error) {
        console.error('Error fetching visits:', error.message);
        addToast({ title: 'Error', body: `Failed to fetch visits: ${error.message}`, type: 'error' });
    } else {
        const fetchedVisits = (data as any) || [];
        setTotalItems(count || 0);

        if (fetchedVisits.length > 0) {
            const visitIds = fetchedVisits.map((v: Visit) => v.id.toString());
            const { data: logs } = await supabase
                .from('email_logs')
                .select('related_document_id')
                .eq('document_type', 'visit_reminder')
                .in('related_document_id', visitIds);
            
            const sentVisitIds = new Set((logs || []).map(l => l.related_document_id));

            const visitsWithSentStatus = fetchedVisits.map((vis: Visit) => ({
                ...vis,
                was_sent_via_email: sentVisitIds.has(vis.id.toString())
            }));
            setVisits(visitsWithSentStatus);
        } else {
            setVisits([]);
        }
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, statusFilter, sortConfig, currentPage, addToast]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits, refreshKey]);
  
  const handleSort = (key: string) => {
    setCurrentPage(0);
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCopyVisit = async (visitId: number) => {
    if (!profile) return;
    try {
      setLoading(true);
      const { data: original, error: fetchError } = await supabase
        .from('visits')
        .select('*, visit_products(*), visit_expenses(*)')
        .eq('id', visitId)
        .single();
      
      if (fetchError || !original) throw new Error(fetchError?.message || 'Visit not found.');

      const newNumber = await generateNextNumber(profile.org_id, 'visit');
      const tomorrow = addDays(new Date(), 1);
      
      // Fix: Exclude relationship arrays `visit_products` and `visit_expenses` from the `...rest` spread
      const { id, created_at, visit_number, status, signature_date, signature_storage_path, visit_products, visit_expenses, ...rest } = original;

      const newVisitData = {
        ...rest,
        visit_number: newNumber,
        status: 'planned' as VisitStatus,
        start_time: tomorrow.toISOString(),
        end_time: addDays(tomorrow, 1).toISOString(), // Placeholder, can be adjusted
        purpose: `(Copy) ${original.purpose || ''}`.trim()
      };

      const { data: newVisit, error: insertError } = await supabase.from('visits').insert(newVisitData).select().single();
      if (insertError) throw insertError;

      if (visit_products && visit_products.length > 0) {
        const newProducts = (visit_products as any[]).map(p => ({
            visit_id: newVisit.id,
            product_id: p.product_id,
            quantity: p.quantity,
            unit_price: p.unit_price,
        }));
        const { error: productsError } = await supabase.from('visit_products').insert(newProducts);
        if(productsError) throw productsError;
      }
      if (visit_expenses && visit_expenses.length > 0) {
        const newExpenses = (visit_expenses as any[]).map(e => ({
            visit_id: newVisit.id,
            expense_id: e.expense_id,
        }));
        const { error: expensesError } = await supabase.from('visit_expenses').insert(newExpenses);
        if(expensesError) throw expensesError;
      }

      addToast({ title: 'Success', body: `Visit copied. Opening new draft...`, type: 'success' });
      openTab({ path: `/visits/edit/${newVisit.id}`, label: newVisit.visit_number });
    } catch (error: any) {
      addToast({ title: 'Error', body: `Failed to copy visit: ${error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!visitToDelete) return;
    
    // Release stock if the visit was active
    const stockRelevantStatuses: VisitStatus[] = ['planned', 'completed'];
    if (stockRelevantStatuses.includes(visitToDelete.status)) {
        const { data: items } = await supabase.from('visit_products').select('product_id, quantity').eq('visit_id', visitToDelete.id).not('product_id', 'is', null);
        if (items && items.length > 0) {
            const stockUpdates = items.map(item => ({
                product_id: item.product_id!,
                quantity_delta: -item.quantity // Negative delta to increase stock
            }));
            const { error: stockError } = await supabase.rpc('update_stock_levels', { updates: stockUpdates });
            if (stockError) {
                addToast({ title: 'Stock Error', body: stockError.message, type: 'error' });
            }
        }
    }

    await supabase.from('visit_products').delete().eq('visit_id', visitToDelete.id);
    await supabase.from('visit_expenses').delete().eq('visit_id', visitToDelete.id);
    const { error } = await supabase.from('visits').delete().eq('id', visitToDelete.id);
    if (error) {
        addToast({ title: 'Error', body: 'Error deleting visit: ' + error.message, type: 'error' });
    } else {
        addToast({ title: 'Success', body: 'Visit deleted.', type: 'success' });
        fetchVisits();
    }
    setVisitToDelete(null);
  };
  
  const statusColors: { [key in VisitStatus]: string } = {
    planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
  };
  
  const visitStatuses: VisitStatus[] = ['planned', 'completed', 'cancelled'];

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

  const VisitCard: React.FC<{ visit: Visit }> = ({ visit }) => (
    <div 
      onClick={() => openTab({ path: `/visits/edit/${visit.id}`, label: visit.visit_number })}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-bold">
            {visit.customers ? (
                <button onClick={(e) => { e.stopPropagation(); openTab({ path: `/customers/${visit.customer_id}`, label: visit.customers.name }); }} className="text-left hover:underline">{visit.customers.name}</button>
            ) : (
                'N/A'
            )}
          </p>
          <p className="text-sm font-mono text-gray-500">{visit.visit_number}</p>
        </div>
        <div className="flex items-center gap-x-2">
            {visit.was_sent_via_email && <EnvelopeIcon className="w-5 h-5 text-blue-500" title="Reminder sent" />}
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[visit.status]} capitalize`}>{t(visit.status as any)}</span>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300">{visit.location}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {formatEuropeanDate(visit.start_time)} - {visit.profiles?.full_name || 'Unassigned'}
      </p>
    </div>
  );

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('visits')}</h1>
        {canCreate && (
          <button onClick={() => openTab({ path: '/visits/new', label: t('newVisit') })} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
            <PlusIcon className="w-5 h-5 mr-2" /> {t('newVisit')}
          </button>
        )}
      </div>

      <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col sm:flex-row gap-4">
        <input 
          type="text"
          placeholder={t('searchByVisit')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        />
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VisitStatus | 'all')}
          className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="all">{t('allStatuses')}</option>
          {visitStatuses.map(status => (
            <option key={status} value={status} className="capitalize">{t(status as any)}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="p-6 text-center text-gray-500">{t('loading')}</div> : (
        profile?.role === 'field_service_employee' ? (
          <div className="space-y-4">
            {visits.length > 0 ? visits.map(visit => (
              <VisitCard key={visit.id} visit={visit} />
            )) : <p className="p-6 text-center text-gray-500">{t('noVisitsFound')}</p>}
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
                    <SortableHeader sortKey="visit_number" label="Visit #" />
                    <SortableHeader sortKey="customers.name" label="Customer" />
                    <SortableHeader sortKey="start_time" label={t('startTime')} />
                    <SortableHeader sortKey="profiles.full_name" label={t('assignedEmployee')} />
                    <SortableHeader sortKey="status" label={t('status')} />
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                  {visits.length > 0 ? visits.map(visit => (
                    <tr key={visit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <td className="px-6 py-3 whitespace-nowrap"><button onClick={() => openTab({ path: `/visits/edit/${visit.id}`, label: visit.visit_number })} className="font-medium text-primary-600 hover:underline">{visit.visit_number}</button></td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                          {visit.customers ? (
                              <button onClick={() => openTab({ path: `/customers/${visit.customer_id}`, label: visit.customers.name })} className="text-primary-600 hover:underline">{visit.customers.name}</button>
                          ) : (
                              <span className="text-gray-900 dark:text-white">N/A</span>
                          )}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(visit.start_time)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{visit.profiles?.full_name || 'Unassigned'}</td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-x-2">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[visit.status]} capitalize`}>{t(visit.status as any)}</span>
                          {visit.was_sent_via_email && <EnvelopeIcon className="w-5 h-5 text-blue-500" title="Reminder sent"/>}
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {canManage && <button onClick={() => handleCopyVisit(visit.id)} title={t('copyVisit')}><DocumentDuplicateIcon className="w-5 h-5 inline-block text-gray-500 hover:text-primary-600"/></button>}
                        <button onClick={() => openTab({ path: `/visits/edit/${visit.id}`, label: visit.visit_number })} title={t('edit')}><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button>
                        {canManage && visit.status === 'planned' && (
                          <button onClick={() => setVisitToDelete(visit)} title={t('delete')}><TrashIcon className="w-5 h-5 inline-block text-red-600 hover:text-red-800"/></button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="p-4 text-center text-gray-500">{t('noVisitsFound')}</td></tr>
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
    <ConfirmModal
        isOpen={!!visitToDelete}
        onClose={() => setVisitToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Visit"
        message={`Are you sure you want to delete visit #${visitToDelete?.visit_number}? This will also remove associated products and expenses.`}
        confirmText="Delete"
    />
    </>
  );
};

export default VisitsPage;