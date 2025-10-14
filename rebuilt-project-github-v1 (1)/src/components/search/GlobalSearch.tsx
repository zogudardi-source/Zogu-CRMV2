import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTabs } from '../../contexts/TabContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
    MagnifyingGlassIcon, 
    DocumentTextIcon, 
    UserIcon, 
    ArchiveBoxIcon, 
    ClipboardDocumentListIcon, 
    ArrowPathIcon,
    DocumentPlusIcon,
    BriefcaseIcon,
    CalendarDaysIcon
} from '@heroicons/react/24/outline';
import { Customer, Invoice, Product, Task, Quote, Visit, Appointment } from '../../types';

interface SearchResults {
    customers: Customer[];
    invoices: Invoice[];
    quotes: Quote[];
    visits: Visit[];
    appointments: Appointment[];
    products: Product[];
    tasks: Task[];
}

const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};

const ResultGroup: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
    <div>
        <h3 className="px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center">
            <Icon className="w-4 h-4 mr-2"/> {title}
        </h3>
        {children}
    </div>
);

const ResultItem: React.FC<{ onClick: () => void; title: string; subtitle?: string }> = ({ onClick, title, subtitle }) => (
    <button onClick={onClick} className="w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-slate-700">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
    </button>
);

const GlobalSearch: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    
    const debouncedSearchTerm = useDebounce<string>(searchTerm, 300);
    const { profile } = useAuth();
    const { openTab } = useTabs();
    const { t } = useLanguage();
    const searchRef = useRef<HTMLDivElement>(null);

    const performSearch = useCallback(async (term: string): Promise<SearchResults | null> => {
        if (!profile?.org_id) return null;

        const baseQuery = (table: string, columns: string) => {
            let query = supabase.from(table).select(columns).limit(5);
            if (profile.role !== 'super_admin') {
                query = query.eq('org_id', profile.org_id);
            }
            return query;
        };
        
        const customerCols = 'id, name, customer_number';
        const invoiceCols = 'id, invoice_number, customers(name)';
        const productCols = 'id, name, product_number';
        const taskCols = 'id, title, customers(name)';
        const quoteCols = 'id, quote_number, customers(name)';
        const visitCols = 'id, visit_number, purpose, category, customers(name)';
        const appointmentCols = 'id, title, appointment_number, customers(name)';

        const searchPromises = [
            // Customers (1 query)
            baseQuery('customers', customerCols).or(`name.ilike.%${term}%,customer_number.ilike.%${term}%`),
            
            // Invoices (2 queries)
            baseQuery('invoices', invoiceCols).ilike('invoice_number', `%${term}%`),
            baseQuery('invoices', 'id, invoice_number, customers!inner(name)').ilike('customers.name', `%${term}%`),

            // Products (1 query)
            baseQuery('products', productCols).or(`name.ilike.%${term}%,product_number.ilike.%${term}%`),

            // Tasks (2 queries)
            baseQuery('tasks', taskCols).ilike('title', `%${term}%`),
            baseQuery('tasks', 'id, title, customers!inner(name)').ilike('customers.name', `%${term}%`),
            
            // Quotes (2 queries)
            baseQuery('quotes', quoteCols).ilike('quote_number', `%${term}%`),
            baseQuery('quotes', 'id, quote_number, customers!inner(name)').ilike('customers.name', `%${term}%`),
            
            // Visits (2 queries)
            baseQuery('visits', visitCols).or(`visit_number.ilike.%${term}%,purpose.ilike.%${term}%,category.ilike.%${term}%`),
            baseQuery('visits', 'id, visit_number, purpose, category, customers!inner(name)').ilike('customers.name', `%${term}%`),

            // Appointments (2 queries)
            baseQuery('appointments', appointmentCols).or(`title.ilike.%${term}%,appointment_number.ilike.%${term}%`),
            baseQuery('appointments', 'id, title, appointment_number, customers!inner(name)').ilike('customers.name', `%${term}%`),
        ];
        
        const [
            customerRes,
            invoiceByNumRes, invoiceByCustRes,
            productRes,
            taskByTitleRes, taskByCustRes,
            quoteByNumRes, quoteByCustRes,
            visitByFieldsRes, visitByCustRes,
            apptByFieldsRes, apptByCustRes,
        ] = await Promise.all(searchPromises);

        const combineAndUnique = (res1: { data: any[] | null }, res2: { data: any[] | null }): any[] => {
            const combined = [...(res1.data || []), ...(res2.data || [])];
            return Array.from(new Map(combined.map(item => [item.id, item])).values());
        };

        return {
            customers: (customerRes.data as Customer[]) || [],
            invoices: combineAndUnique(invoiceByNumRes, invoiceByCustRes) as Invoice[],
            quotes: combineAndUnique(quoteByNumRes, quoteByCustRes) as Quote[],
            visits: combineAndUnique(visitByFieldsRes, visitByCustRes) as Visit[],
            appointments: combineAndUnique(apptByFieldsRes, apptByCustRes) as Appointment[],
            products: (productRes.data as Product[]) || [],
            tasks: combineAndUnique(taskByTitleRes, taskByCustRes) as Task[],
        };
    }, [profile]);

    useEffect(() => {
        if (debouncedSearchTerm.length > 2) {
            setLoading(true);
            setIsOpen(true);
            performSearch(debouncedSearchTerm).then(data => {
                setResults(data);
                setLoading(false);
            });
        } else {
            setResults(null);
            setIsOpen(false);
        }
    }, [debouncedSearchTerm, performSearch]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleSelect = (path: string, label: string, state?: any) => {
        openTab({ path, label, state });
        setSearchTerm('');
        setResults(null);
        setIsOpen(false);
    };

    const hasResults = results && (
        results.customers.length > 0 || 
        results.invoices.length > 0 || 
        results.quotes.length > 0 || 
        results.visits.length > 0 || 
        results.appointments.length > 0 || 
        results.products.length > 0 || 
        results.tasks.length > 0
    );

    return (
        <div className="relative w-full max-w-lg" ref={searchRef} role="search">
            <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => { if (searchTerm.length > 2) setIsOpen(true); }}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    aria-label="Global search"
                />
            </div>

            {isOpen && (
                <div className="absolute mt-2 w-full bg-white dark:bg-slate-800 rounded-md shadow-lg z-20 border dark:border-slate-700 max-h-96 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center p-4 text-sm text-gray-500">
                            <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" /> {t('searching')}
                        </div>
                    ) : hasResults ? (
                        <div className="py-2">
                            {results.customers.length > 0 && (
                                <ResultGroup title={t('customers')} icon={UserIcon}>
                                    {results.customers.map(c => <ResultItem key={`cust-${c.id}`} onClick={() => handleSelect(`/customers/${c.id}`, c.name)} title={c.name} subtitle={c.customer_number} />)}
                                </ResultGroup>
                            )}
                            {results.appointments.length > 0 && (
                                <ResultGroup title={t('appointments')} icon={CalendarDaysIcon}>
                                    {results.appointments.map(a => <ResultItem key={`appt-${a.id}`} onClick={() => handleSelect(`/appointments`, 'Appointments', { openModalForId: a.id.toString() })} title={a.title} subtitle={`${a.appointment_number} - ${(a as any).customers?.name || 'N/A'}`} />)}
                                </ResultGroup>
                            )}
                            {results.visits.length > 0 && (
                                <ResultGroup title={t('visits')} icon={BriefcaseIcon}>
                                    {results.visits.map(v => <ResultItem key={`visit-${v.id}`} onClick={() => handleSelect(`/visits/edit/${v.id}`, v.visit_number)} title={v.purpose || v.category} subtitle={`${v.visit_number} - ${(v as any).customers?.name || 'N/A'}`} />)}
                                </ResultGroup>
                            )}
                            {results.quotes.length > 0 && (
                                <ResultGroup title={t('quotes')} icon={DocumentPlusIcon}>
                                    {results.quotes.map(q => <ResultItem key={`quote-${q.id}`} onClick={() => handleSelect(`/quotes/edit/${q.id}`, q.quote_number)} title={q.quote_number} subtitle={(q as any).customers?.name || 'N/A'} />)}
                                </ResultGroup>
                            )}
                            {results.invoices.length > 0 && (
                                <ResultGroup title={t('invoices')} icon={DocumentTextIcon}>
                                    {results.invoices.map(i => <ResultItem key={`inv-${i.id}`} onClick={() => handleSelect(`/invoices/edit/${i.id}`, i.invoice_number)} title={i.invoice_number} subtitle={(i as any).customers?.name || 'N/A'} />)}
                                </ResultGroup>
                            )}
                            {results.products.length > 0 && (
                                <ResultGroup title={t('inventory')} icon={ArchiveBoxIcon}>
                                    {results.products.map(p => <ResultItem key={`prod-${p.id}`} onClick={() => handleSelect(`/inventory`, 'Inventory')} title={p.name} subtitle={p.product_number} />)}
                                </ResultGroup>
                            )}
                             {results.tasks.length > 0 && (
                                <ResultGroup title={t('tasks')} icon={ClipboardDocumentListIcon}>
                                    {results.tasks.map(t => <ResultItem key={`task-${t.id}`} onClick={() => handleSelect(`/tasks`, 'Tasks', { openModalForId: t.id })} title={t.title} subtitle={(t as any).customers?.name || 'Internal'} />)}
                                </ResultGroup>
                            )}
                        </div>
                    ) : (
                        searchTerm.length > 2 && <div className="p-4 text-sm text-center text-gray-500">{t('noResultsFor').replace('{term}', searchTerm)}</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;