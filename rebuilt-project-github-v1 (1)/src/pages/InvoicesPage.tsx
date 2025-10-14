import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Invoice, InvoiceStatus } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, EnvelopeIcon, ArrowDownTrayIcon, EyeIcon, ChevronUpIcon, ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import generateDocumentPDF from '../lib/pdfGenerator';
import { generateNextNumber } from '../lib/numberGenerator';
import { formatEuropeanDate } from '../lib/formatting';
import { format } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import Pagination from '../components/ui/Pagination';
import ConfirmModal from '../components/modals/ConfirmModal';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
const ITEMS_PER_PAGE = 20;

const InvoicesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();
  const { addToast } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'issue_date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  
  const canCreate = profile?.role !== 'field_service_employee' && profile?.role !== 'super_admin';
  const canManage = profile?.role !== 'field_service_employee';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';
  
  const invoiceStatuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue'];

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter]);
  
  useEffect(() => {
    const state = location.state as { statusFilter?: string }; // Accept any string from navigation state
    if (state?.statusFilter) {
        // Validate that the passed filter is a valid InvoiceStatus before applying it.
        if (invoiceStatuses.includes(state.statusFilter as InvoiceStatus)) {
            setStatusFilter(state.statusFilter as InvoiceStatus);
        } else {
            console.error(`Invalid status filter "${state.statusFilter}" passed to InvoicesPage. Ignoring.`);
        }
        // Clear the state regardless to prevent it from being re-applied on refresh.
        navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const fetchInvoices = useCallback(async () => {
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

    let query = supabase
      .from('invoices')
      .select('*, customers:customers!left(id, name, email), organizations:organizations!left(name)', { count: 'exact' });

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    
    if (searchTerm) {
        const filters = [`invoice_number.ilike.%${searchTerm}%`];
        if (customerIdFilter && customerIdFilter.length > 0) {
            filters.push(`customer_id.in.(${customerIdFilter.join(',')})`);
        }
        query = query.or(filters.join(','));
    }

    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let { data, error, count } = await query
      .order(sortConfig.key, { 
          ascending: sortConfig.direction === 'asc',
          referencedTable: sortConfig.key.includes('.') ? sortConfig.key.split('.')[0] : undefined
      })
      .range(from, to);

    if (error) {
        console.error('Error fetching invoices:', error.message);
        addToast({ title: 'Error', body: `Failed to fetch invoices: ${error.message}`, type: 'error' });
    } else {
        const fetchedInvoices = (data as any) || [];
        setTotalItems(count || 0);

        if (fetchedInvoices.length > 0) {
            const invoiceIds = fetchedInvoices.map((i: Invoice) => i.id.toString());
            const { data: logs } = await supabase
                .from('email_logs')
                .select('related_document_id')
                .eq('document_type', 'invoice')
                .in('related_document_id', invoiceIds);
            
            const sentInvoiceIds = new Set((logs || []).map(l => l.related_document_id));

            const invoicesWithSentStatus = fetchedInvoices.map((inv: Invoice) => ({
                ...inv,
                was_sent_via_email: sentInvoiceIds.has(inv.id.toString())
            }));
            setInvoices(invoicesWithSentStatus);
        } else {
            setInvoices([]);
        }
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, statusFilter, sortConfig, currentPage, addToast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices, refreshKey]);

  const handleSort = (key: string) => {
    setCurrentPage(0);
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCopyInvoice = async (invoiceId: number) => {
    if (!profile) return;
    try {
        setLoading(true);
        // 1. Fetch original invoice and its items
        const { data: originalInvoice, error: fetchError } = await supabase
            .from('invoices')
            .select('*, invoice_items(*)')
            .eq('id', invoiceId)
            .single();

        if (fetchError || !originalInvoice) throw new Error(fetchError?.message || 'Invoice not found.');

        // 2. Prepare new invoice data
        const newInvoiceNumber = await generateNextNumber(profile.org_id, 'invoice');
        const today = new Date();
        const dueDate = new Date();
        dueDate.setDate(today.getDate() + 14);

        const { id, created_at, invoice_number, status, payment_link_url, stripe_payment_intent_id, invoice_items, ...rest } = originalInvoice;

        const newInvoiceData = {
            ...rest,
            invoice_number: newInvoiceNumber,
            status: 'draft' as InvoiceStatus,
            issue_date: format(today, 'yyyy-MM-dd'),
            due_date: format(dueDate, 'yyyy-MM-dd'),
            customer_notes: `(Copy of ${originalInvoice.invoice_number})\n${originalInvoice.customer_notes || ''}`.trim(),
            internal_notes: originalInvoice.internal_notes || '',
        };

        // 3. Insert new invoice
        const { data: newInvoice, error: insertError } = await supabase
            .from('invoices')
            .insert(newInvoiceData)
            .select()
            .single();
        
        if (insertError) throw insertError;

        // 4. Prepare and insert new items
        if (invoice_items && invoice_items.length > 0) {
            const newItems = invoice_items.map(({ id: itemId, invoice_id, ...item }) => ({
                ...item,
                invoice_id: newInvoice.id
            }));
            const { error: itemsError } = await supabase.from('invoice_items').insert(newItems);
            if (itemsError) throw itemsError;
        }

        addToast({ title: 'Success', body: `Invoice copied. Opening new draft...`, type: 'success' });
        openTab({ path: `/invoices/edit/${newInvoice.id}`, label: newInvoice.invoice_number });

    } catch (error: any) {
        addToast({ title: 'Error', body: `Failed to copy invoice: ${error.message}`, type: 'error' });
    } finally {
        setLoading(false);
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!invoiceToDelete) return;
    
    // Release stock if the invoice was active
    const stockRelevantStatuses: InvoiceStatus[] = ['sent', 'overdue', 'paid'];
    if (stockRelevantStatuses.includes(invoiceToDelete.status)) {
        const { data: items } = await supabase.from('invoice_items').select('product_id, quantity').eq('invoice_id', invoiceToDelete.id).not('product_id', 'is', null);
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

    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceToDelete.id);
    const { error } = await supabase.from('invoices').delete().eq('id', invoiceToDelete.id);
    if (error) {
        addToast({ title: 'Error', body: 'Error deleting invoice: ' + error.message, type: 'error' });
    } else {
        addToast({ title: 'Success', body: 'Invoice deleted.', type: 'success' });
        fetchInvoices();
    }
    setInvoiceToDelete(null);
  };

  const handleDownloadPDF = async (invoiceId: number) => {
    try {
        await generateDocumentPDF(invoiceId, 'invoice', language);
    } catch (error: any) {
        addToast({ type: 'error', title: 'PDF Error', body: error.message });
    }
  };

  const handleSendEmail = async (invoice: Invoice) => {
    if (!invoice.customers?.email) {
      addToast({ type: 'error', title: 'Missing Email', body: 'This customer does not have an email address saved.' });
      return;
    }
    try {
        await generateDocumentPDF(invoice.id, 'invoice', language);
        const subject = `Invoice ${invoice.invoice_number} from your company`;
        const body = `Dear ${invoice.customers?.name},\n\nPlease find attached the invoice for your recent transaction.\n\n(Remember to attach the PDF you just downloaded!)\n\nBest regards,\nYour Company`;
        window.location.href = `mailto:${invoice.customers.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (error: any) {
         addToast({ type: 'error', title: 'PDF Error', body: error.message });
    }
  };
  
  const statusColors: { [key in InvoiceStatus]: string } = {
    draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-300/50',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
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

  const MobileInvoiceCard: React.FC<{ invoice: Invoice }> = ({ invoice }) => (
    <div onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">
                    {invoice.customers ? (
                        <button onClick={(e) => { e.stopPropagation(); openTab({ path: `/customers/${invoice.customer_id}`, label: invoice.customers.name }); }} className="text-left hover:underline">{invoice.customers.name}</button>
                    ) : (
                        'N/A'
                    )}
                </p>
                <p className="text-sm font-mono text-gray-500">{invoice.invoice_number}</p>
            </div>
            <div className="flex items-center gap-x-2">
                {invoice.was_sent_via_email && <EnvelopeIcon className="w-5 h-5 text-blue-500" title="Email sent" />}
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[invoice.status]} capitalize`}>{t(invoice.status as any)}</span>
            </div>
        </div>
        <div className="flex justify-between items-end text-sm">
            <span className="text-gray-500">{formatEuropeanDate(invoice.issue_date)}</span>
            <span className="font-bold text-lg">€{invoice.total_amount.toFixed(2)}</span>
        </div>
    </div>
  );

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('invoices')}</h1>
        {canCreate && (
          <button onClick={() => openTab({ path: '/invoices/new', label: t('newInvoice') })} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
            <PlusIcon className="w-5 h-5 mr-2" /> {t('newInvoice')}
          </button>
        )}
      </div>

      <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col sm:flex-row gap-4">
        <input 
          type="text"
          placeholder={t('searchByInvoice')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        />
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
          className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="all">{t('allStatuses')}</option>
          {invoiceStatuses.map(status => (
            <option key={status} value={status} className="capitalize">{t(status as any)}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="p-6 text-center text-gray-500">{t('loading')}</div> : (
        isFieldServiceEmployee ? (
            <div className="space-y-4">
               {invoices.length > 0 ? invoices.map(invoice => (
                  <MobileInvoiceCard key={invoice.id} invoice={invoice} />
                )) : <p className="p-6 text-center text-gray-500">{t('noInvoicesFound')}</p>}
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
                    <SortableHeader sortKey="invoice_number" label={t('invoice_number')} />
                    <SortableHeader sortKey="customers.name" label={t('customer')} />
                    {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label={t('organization')} />}
                    <SortableHeader sortKey="issue_date" label={t('issue_date')} />
                    <SortableHeader sortKey="total_amount" label={t('total')} />
                    <SortableHeader sortKey="status" label={t('status')} />
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800">
                    {invoices.length > 0 ? invoices.map(invoice => (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap"><button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} className="font-medium text-primary-600 hover:underline">{invoice.invoice_number}</button></td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                            {invoice.customers ? (
                                <button onClick={() => openTab({ path: `/customers/${invoice.customer_id}`, label: invoice.customers.name })} className="text-primary-600 hover:underline">{invoice.customers.name}</button>
                            ) : (
                                <span className="text-gray-900 dark:text-white">N/A</span>
                            )}
                        </td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{invoice.organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(invoice.issue_date)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{invoice.total_amount.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-x-2">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[invoice.status]} capitalize`}>{t(invoice.status as any)}</span>
                                {invoice.was_sent_via_email && <EnvelopeIcon className="w-5 h-5 text-blue-500" title={t('sentViaEmail')}/>}
                            </div>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            {invoice.status === 'paid' ? (
                                <button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} title={t('view')}><EyeIcon className="w-5 h-5 inline-block text-gray-500 hover:text-primary-600"/></button>
                            ) : (
                                <button onClick={() => openTab({ path: `/invoices/edit/${invoice.id}`, label: invoice.invoice_number })} title={t('editView')}><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button>
                            )}
                            
                            {canManage && invoice.status !== 'paid' && (
                               <button onClick={() => handleCopyInvoice(invoice.id)} title={t('copyInvoice')}><DocumentDuplicateIcon className="w-5 h-5 inline-block text-gray-500 hover:text-primary-600"/></button>
                            )}

                            {canManage && (
                                <>
                                <button onClick={() => handleSendEmail(invoice)} title={t('sendEmail')}><EnvelopeIcon className="w-5 h-5 inline-block text-gray-500 hover:text-gray-700"/></button>
                                <button onClick={() => handleDownloadPDF(invoice.id)} title={t('downloadPDF')}><ArrowDownTrayIcon className="w-5 h-5 inline-block text-gray-500 hover:text-gray-700"/></button>
                                {invoice.status === 'draft' && (
                                    <button onClick={() => setInvoiceToDelete(invoice)} title={t('delete')}><TrashIcon className="w-5 h-5 inline-block text-red-600 hover:text-red-800"/></button>
                                )}
                                </>
                            )}
                        </td>
                    </tr>
                    )) : (
                    <tr><td colSpan={profile?.role === 'super_admin' ? 7 : 6} className="p-4 text-center text-gray-500">{t('noInvoicesFound')}</td></tr>
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
        isOpen={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t('delete') + ' ' + t('invoice')}
        message={`${t('confirmDeleteInvoice')} #${invoiceToDelete?.invoice_number}?`}
        confirmText={t('delete')}
      />
    </>
  );
};

export default InvoicesPage;