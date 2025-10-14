import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Quote, QuoteStatus } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { PlusIcon, PencilIcon, TrashIcon, DocumentDuplicateIcon, ChevronUpIcon, ChevronDownIcon, ArrowDownTrayIcon, EnvelopeIcon, ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
import { convertQuoteToInvoice } from '../lib/conversion';
import generateDocumentPDF from '../lib/pdfGenerator';
import { generateNextNumber } from '../lib/numberGenerator';
import ConfirmModal from '../components/modals/ConfirmModal';
import { formatEuropeanDate } from '../lib/formatting';
import { format } from 'date-fns';
import Pagination from '../components/ui/Pagination';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
type QuoteStatusFilter = QuoteStatus | 'expired';
const ITEMS_PER_PAGE = 20;

const QuotesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab } = useTabs();
  const { addToast } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatusFilter | 'all'>('all');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [quoteToConvert, setQuoteToConvert] = useState<Quote | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'issue_date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const canCreate = profile?.role !== 'super_admin';
  const canManage = profile?.role !== 'field_service_employee';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';
  
  const quoteStatuses: QuoteStatusFilter[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    const state = location.state as { statusFilter?: string }; // Accept any string from navigation state
    if (state?.statusFilter) {
        // Validate that the passed filter is a valid QuoteStatus before applying it.
        if (quoteStatuses.includes(state.statusFilter as QuoteStatusFilter)) {
            setStatusFilter(state.statusFilter as QuoteStatusFilter);
        } else {
            console.error(`Invalid status filter "${state.statusFilter}" passed to QuotesPage. Ignoring.`);
        }
        // Clear the state regardless to prevent it from being re-applied on refresh.
        navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const fetchQuotes = useCallback(async () => {
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

    let query = supabase.from('quotes').select('*, customers:customers!left(id, name), organizations:organizations!left(name)', { count: 'exact' });

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'expired') {
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('status', 'sent').lt('valid_until_date', today);
      } else {
        query = query.eq('status', statusFilter);
      }
    }
    
    if (searchTerm) {
        const filters = [`quote_number.ilike.%${searchTerm}%`];
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
        console.error('Error fetching quotes:', error.message);
        addToast({ title: 'Error', body: `Failed to fetch quotes: ${error.message}`, type: 'error' });
    } else {
        const fetchedQuotes = (data as any) || [];
        setTotalItems(count || 0);

        if (fetchedQuotes.length > 0) {
            const quoteIds = fetchedQuotes.map((q: Quote) => q.id.toString());
            const { data: logs } = await supabase
                .from('email_logs')
                .select('related_document_id')
                .eq('document_type', 'quote')
                .in('related_document_id', quoteIds);
            
            const sentQuoteIds = new Set((logs || []).map(l => l.related_document_id));

            const quotesWithSentStatus = fetchedQuotes.map((quote: Quote) => ({
                ...quote,
                was_sent_via_email: sentQuoteIds.has(quote.id.toString())
            }));
            setQuotes(quotesWithSentStatus);
        } else {
            setQuotes([]);
        }
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, statusFilter, sortConfig, currentPage, addToast]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes, refreshKey]);
  
  const handleSort = (key: string) => {
    setCurrentPage(0);
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const handleCopyQuote = async (quoteId: number) => {
    if (!profile) return;
    try {
        setLoading(true);
        const { data: originalQuote, error: fetchError } = await supabase
            .from('quotes')
            .select('*, quote_items(*)')
            .eq('id', quoteId)
            .single();

        if (fetchError || !originalQuote) throw new Error(fetchError?.message || 'Quote not found.');
        
        const newQuoteNumber = await generateNextNumber(profile.org_id, 'quote');
        const today = new Date();
        const validUntil = new Date();
        validUntil.setDate(today.getDate() + 14);

        const { id, created_at, quote_number, status, quote_items, ...rest } = originalQuote;

        const newQuoteData = {
            ...rest,
            quote_number: newQuoteNumber,
            status: 'draft' as QuoteStatus,
            issue_date: format(today, 'yyyy-MM-dd'),
            valid_until_date: format(validUntil, 'yyyy-MM-dd'),
            customer_notes: `(Copy of ${originalQuote.quote_number})\n${originalQuote.customer_notes || ''}`.trim(),
            internal_notes: originalQuote.internal_notes || '',
        };

        const { data: newQuote, error: insertError } = await supabase.from('quotes').insert(newQuoteData).select().single();
        if (insertError) throw insertError;
        
        if (quote_items && quote_items.length > 0) {
            const newItems = quote_items.map(({ id: itemId, quote_id, ...item }) => ({ ...item, quote_id: newQuote.id }));
            const { error: itemsError } = await supabase.from('quote_items').insert(newItems);
            if (itemsError) throw itemsError;
        }

        addToast({ title: 'Success', body: `Quote copied. Opening new draft...`, type: 'success' });
        openTab({ path: `/quotes/edit/${newQuote.id}`, label: newQuote.quote_number });

    } catch (error: any) {
        addToast({ title: 'Error', body: `Failed to copy quote: ${error.message}`, type: 'error' });
    } finally {
        setLoading(false);
    }
  };

  const handleOpenConfirmModal = (quote: Quote) => {
    setQuoteToConvert(quote);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmConversion = async () => {
    if (!quoteToConvert || !profile) return;
    try {
      setLoading(true);
      const newInvoice = await convertQuoteToInvoice(quoteToConvert.id, profile);
      addToast({ type: 'success', title: 'Success', body: `Successfully converted quote to invoice #${newInvoice.invoice_number}.` });
      openTab({ path: `/invoices/edit/${newInvoice.id}`, label: newInvoice.invoice_number });
    } catch (error: any) {
      addToast({ type: 'error', title: 'Conversion Failed', body: error.message });
    } finally {
      setIsConfirmModalOpen(false);
      setQuoteToConvert(null);
      setLoading(false);
      fetchQuotes();
    }
  };

  const handleConfirmDelete = async () => {
    if (!quoteToDelete) return;

    // Release stock if the quote was active
    const stockRelevantStatuses: QuoteStatus[] = ['sent', 'accepted'];
    if (stockRelevantStatuses.includes(quoteToDelete.status)) {
        const { data: items } = await supabase.from('quote_items').select('product_id, quantity').eq('quote_id', quoteToDelete.id).not('product_id', 'is', null);
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

    await supabase.from('quote_items').delete().eq('quote_id', quoteToDelete.id);
    const { error } = await supabase.from('quotes').delete().eq('id', quoteToDelete.id);
    if (error) {
        addToast({ title: 'Error', body: 'Error deleting quote: ' + error.message, type: 'error' });
    } else {
        addToast({ title: 'Success', body: 'Quote deleted.', type: 'success' });
        fetchQuotes();
    }
    setQuoteToDelete(null);
  };

  const handleDownloadPDF = async (quoteId: number) => {
    try {
        await generateDocumentPDF(quoteId, 'quote', language);
    } catch(error: any) {
        addToast({ type: 'error', title: 'PDF Error', body: error.message });
    }
  };
  
  const statusColors: { [key in QuoteStatusFilter | 'default']: string } = {
    draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-300/50',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-300/50',
    accepted: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-300/50',
    declined: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
    expired: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-300/50',
    default: 'bg-gray-100 text-gray-800',
  };
  
  const getStatusInfo = (quote: Quote): { label: string; color: string } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Compare date part only
    const validUntil = new Date(quote.valid_until_date + 'T00:00:00');
    
    if (quote.status === 'sent' && validUntil < today) {
        return { label: t('expired'), color: statusColors.expired };
    }
    return { label: t(quote.status as any), color: statusColors[quote.status] };
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

  const MobileQuoteCard: React.FC<{ quote: Quote }> = ({ quote }) => {
    const { label, color } = getStatusInfo(quote);
    return (
        <div onClick={() => openTab({ path: `/quotes/edit/${quote.id}`, label: quote.quote_number })} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2 cursor-pointer">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-bold">
                        {quote.customers ? (
                            <button onClick={(e) => { e.stopPropagation(); openTab({ path: `/customers/${quote.customer_id}`, label: quote.customers.name }); }} className="text-left hover:underline">{quote.customers.name}</button>
                        ) : (
                            'N/A'
                        )}
                    </p>
                    <p className="text-sm font-mono text-gray-500">{quote.quote_number}</p>
                </div>
                <div className="flex items-center gap-x-2">
                    {quote.was_sent_via_email && <EnvelopeIcon className="w-5 h-5 text-blue-500" title={t('sentViaEmail')} />}
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color} capitalize`}>{label}</span>
                </div>
            </div>
            <div className="flex justify-between items-end text-sm">
                <div className="space-y-1">
                    <p className="text-gray-500">{t('issue_date')}: {formatEuropeanDate(quote.issue_date)}</p>
                    <p className="text-gray-500">{t('valid_until')}: {formatEuropeanDate(quote.valid_until_date)}</p>
                </div>
                <span className="font-bold text-lg">€{quote.total_amount.toFixed(2)}</span>
            </div>
        </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('quotes')}</h1>
          {canCreate && (
            <button onClick={() => openTab({ path: '/quotes/new', label: t('newQuote') })} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('newQuote')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800 flex flex-col sm:flex-row gap-4">
          <input 
            type="text"
            placeholder={t('searchByQuote')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as QuoteStatusFilter | 'all')}
            className="w-full sm:w-auto p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="all">{t('allStatuses')}</option>
            {quoteStatuses.map(status => (
              <option key={status} value={status} className="capitalize">{t(status as any)}</option>
            ))}
          </select>
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">{t('loading')}</div> : (
          isFieldServiceEmployee ? (
              <div className="space-y-4">
                 {quotes.length > 0 ? quotes.map(quote => (
                    <MobileQuoteCard key={quote.id} quote={quote} />
                  )) : <p className="p-6 text-center text-gray-500">{t('noQuotesFound')}</p>}
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
                        <SortableHeader sortKey="quote_number" label={t('quote_number')} />
                        <SortableHeader sortKey="customers.name" label={t('customer')} />
                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label={t('organization')} />}
                        <SortableHeader sortKey="issue_date" label={t('issue_date')} />
                        <SortableHeader sortKey="valid_until_date" label={t('valid_until')} />
                        <SortableHeader sortKey="total_amount" label={t('total')} />
                        <SortableHeader sortKey="status" label={t('status')} />
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                    {quotes.length > 0 ? quotes.map(quote => {
                        const { label, color } = getStatusInfo(quote);
                        return (
                            <tr key={quote.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                                <td className="px-6 py-3 whitespace-nowrap"><button onClick={() => openTab({ path: `/quotes/edit/${quote.id}`, label: quote.quote_number })} className="font-medium text-primary-600 hover:underline">{quote.quote_number}</button></td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                                    {quote.customers ? (
                                        <button onClick={() => openTab({ path: `/customers/${quote.customer_id}`, label: quote.customers.name })} className="text-primary-600 hover:underline">{quote.customers.name}</button>
                                    ) : (
                                        <span className="text-gray-900 dark:text-white">N/A</span>
                                    )}
                                </td>
                                {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{(quote as any).organizations?.name || 'N/A'}</td>}
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(quote.issue_date)}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(quote.valid_until_date)}</td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{quote.total_amount.toFixed(2)}</td>
                                <td className="px-6 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-x-2">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color} capitalize`}>{label}</span>
                                        {quote.was_sent_via_email && <EnvelopeIcon className="w-5 h-5 text-blue-500" title={t('sentViaEmail')}/>}
                                    </div>
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    {quote.status !== 'accepted' && canManage && (
                                        <button onClick={() => handleOpenConfirmModal(quote)} title={t('convertToInvoice')} className="text-green-600 hover:text-green-800">
                                            <ArrowUpOnSquareIcon className="w-5 h-5 inline-block"/>
                                        </button>
                                    )}
                                    {canManage && <button onClick={() => handleCopyQuote(quote.id)} title={t('copyQuote')}><DocumentDuplicateIcon className="w-5 h-5 inline-block text-gray-500 hover:text-primary-600"/></button>}
                                    <button onClick={() => handleDownloadPDF(quote.id)} title={t('downloadPDF')}><ArrowDownTrayIcon className="w-5 h-5 inline-block text-gray-500 hover:text-gray-700"/></button>
                                    <button onClick={() => openTab({ path: `/quotes/edit/${quote.id}`, label: quote.quote_number })} title={t('editView')}><PencilIcon className="w-5 h-5 inline-block text-primary-600 hover:text-primary-800"/></button>
                                    {canManage && quote.status === 'draft' && (
                                      <button onClick={() => setQuoteToDelete(quote)} title={t('delete')}><TrashIcon className="w-5 h-5 inline-block text-red-600 hover:text-red-800"/></button>
                                    )}
                                </td>
                            </tr>
                        );
                    }) : (
                        <tr><td colSpan={profile?.role === 'super_admin' ? 8 : 7} className="p-4 text-center text-gray-500">{t('noQuotesFound')}</td></tr>
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
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmConversion}
        title={t('convertToInvoice')}
        message={t('confirmConvertToInvoiceMsg').replace('{number}', quoteToConvert?.quote_number || '')}
        confirmText={t('convert')}
      />
      <ConfirmModal
        isOpen={!!quoteToDelete}
        onClose={() => setQuoteToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t('delete') + ' ' + t('quote')}
        message={`${t('confirmDeleteQuote')} #${quoteToDelete?.quote_number}?`}
        confirmText={t('delete')}
      />
    </>
  );
};

export default QuotesPage;