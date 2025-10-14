import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Changelog } from '../types';
import { formatEuropeanDate, formatEuropeanTime } from '../lib/formatting';
import Pagination from '../components/ui/Pagination';
import DatePicker from '../components/ui/DatePicker';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

const ITEMS_PER_PAGE = 50;

const AuditLogPage: React.FC = () => {
    const { profile } = useAuth();
    const { t } = useLanguage();
    const [logs, setLogs] = useState<Changelog[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [expandedLogRow, setExpandedLogRow] = useState<string | null>(null);

    const [filters, setFilters] = useState({
        user_email: '',
        action: '',
        table_name: '',
        startDate: null as Date | null,
        endDate: null as Date | null,
    });
    
    const formatValue = (value: any) => {
        if (value === null || value === undefined || value === '') return <span className="text-gray-500 italic">{t('empty')}</span>;
        if (typeof value !== 'string') return <span className="font-mono">{String(value)}</span>;
        return `"${value}"`;
    };

    const renderChangeDetails = (log: Changelog) => {
        const changes = log.changes ? Object.entries(log.changes) : [];
        const filteredChanges = changes.filter(([key]) => !['id', 'org_id', 'user_id', 'created_at', 'updated_at', 'password'].includes(key));

        if (filteredChanges.length === 0) {
            if (log.action === 'INSERT') return <p>{t('recordCreatedWithDefaults')}</p>;
            if (log.action === 'UPDATE') return <p>{t('recordUpdatedNoChanges')}</p>;
            if (log.action === 'DELETE') return <p>{t('recordDeleted')}</p>;
            return null;
        }

        if (log.action === 'INSERT') {
            return (
                <>
                    <p className="font-semibold mb-1">{t('recordCreatedTitle')}</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        {filteredChanges.map(([field, value]) => (
                            <li key={field}>{t('set')} <strong>{field.replace(/_/g, ' ')}</strong> {t('to')} {formatValue(value)}.</li>
                        ))}
                    </ul>
                </>
            );
        }
        if (log.action === 'DELETE') {
            return (
                <>
                    <p className="font-semibold mb-1">{t('recordDeletedTitle')}</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        {filteredChanges.map(([field, value]) => (
                            <li key={field}><strong>{field.replace(/_/g, ' ')}</strong> {t('was')} {formatValue(value)}.</li>
                        ))}
                    </ul>
                </>
            );
        }
        if (log.action === 'UPDATE') {
            return (
                <>
                    <p className="font-semibold mb-1">{t('changes')}:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        {filteredChanges.map(([field, values]: [string, any]) => (
                            <li key={field}>{t('changed')} <strong>{field.replace(/_/g, ' ')}</strong> {t('from')} {formatValue(values.old)} {t('to')} {formatValue(values.new)}.</li>
                        ))}
                    </ul>
                </>
            );
        }
        return null;
    };

    const fetchLogs = useCallback(async () => {
        if (!profile) return;
        setLoading(true);

        let query = supabase.from('changelog').select('*', { count: 'exact' });

        if (profile.role !== 'super_admin') {
            query = query.eq('org_id', profile.org_id);
        }
        if (filters.user_email) {
            query = query.ilike('user_email', `%${filters.user_email}%`);
        }
        if (filters.action) {
            query = query.eq('action', filters.action);
        }
        if (filters.table_name) {
            query = query.eq('table_name', filters.table_name);
        }
        if (filters.startDate) {
            query = query.gte('created_at', filters.startDate.toISOString());
        }
        if (filters.endDate) {
            const endOfDay = new Date(filters.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endOfDay.toISOString());
        }
        
        const from = currentPage * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, error, count } = await query;

        if (error) {
            console.error("Error fetching audit logs:", error);
            alert("Failed to fetch audit logs.");
        } else {
            setLogs(data || []);
            setTotalItems(count || 0);
        }

        setLoading(false);
    }, [profile, filters, currentPage]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const handleDateChange = (field: 'startDate' | 'endDate', date: Date | null) => {
        setFilters(prev => ({ ...prev, [field]: date }));
    };

    const actionColors: Record<string, string> = {
        INSERT: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        UPDATE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('auditLog')}</h1>

            <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <input type="text" name="user_email" placeholder={t('userEmail')} value={filters.user_email} onChange={handleFilterChange} className="p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600" />
                    <select name="action" value={filters.action} onChange={handleFilterChange} className="p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                        <option value="">{t('allActions')}</option>
                        <option value="INSERT">{t('create')}</option>
                        <option value="UPDATE">{t('update')}</option>
                        <option value="DELETE">{t('delete')}</option>
                    </select>
                    <select name="table_name" value={filters.table_name} onChange={handleFilterChange} className="p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                        <option value="">{t('allObjects')}</option>
                        <option value="customers">{t('customer')}</option>
                        <option value="invoices">{t('invoice')}</option>
                        <option value="quotes">{t('quote')}</option>
                        <option value="visits">{t('visits')}</option>
                        <option value="tasks">{t('tasks')}</option>
                        <option value="appointments">{t('appointments')}</option>
                        <option value="products">{t('product')}</option>
                        <option value="expenses">{t('expenses')}</option>
                    </select>
                    <DatePicker selected={filters.startDate} onChange={date => handleDateChange('startDate', date)} />
                    <DatePicker selected={filters.endDate} onChange={date => handleDateChange('endDate', date)} />
                </div>
            </div>

            {loading ? (
                <div className="text-center p-8">{t('loading')}</div>
            ) : (
                <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 dark:bg-slate-900/50">
                                <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
                                    <th className="px-2 py-3 w-4"></th>
                                    <th className="px-6 py-3">{t('date')}</th>
                                    <th className="px-6 py-3">{t('user')}</th>
                                    <th className="px-6 py-3">{t('actions')}</th>
                                    <th className="px-6 py-3">{t('object')}</th>
                                    <th className="px-6 py-3">{t('recordId')}</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y dark:divide-gray-700">
                                {logs.map(log => (
                                    <React.Fragment key={log.id}>
                                        <tr>
                                            <td className="px-2 py-4">
                                                <button onClick={() => setExpandedLogRow(expandedLogRow === log.id ? null : log.id)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                                                    {expandedLogRow === log.id ? <ChevronDownIcon className="w-4 h-4"/> : <ChevronRightIcon className="w-4 h-4"/>}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">{formatEuropeanDate(log.created_at)} {formatEuropeanTime(log.created_at)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">{log.user_email}</td>
                                            <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${actionColors[log.action]}`}>{log.action}</span></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm capitalize">{log.table_name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{log.record_id}</td>
                                        </tr>
                                        {expandedLogRow === log.id && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
                                                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-800 dark:text-gray-200">
                                                        {renderChangeDetails(log)}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination currentPage={currentPage} totalItems={totalItems} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
                </div>
            )}
        </div>
    );
};

export default AuditLogPage;