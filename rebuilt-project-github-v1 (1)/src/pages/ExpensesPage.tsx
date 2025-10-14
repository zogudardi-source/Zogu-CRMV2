import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Expense } from '../types';
import ExpenseModal from '../components/modals/ExpenseModal';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate } from '../lib/formatting';
import { generateNextNumber } from '../lib/numberGenerator';
import { format } from 'date-fns';
import Pagination from '../components/ui/Pagination';
import ConfirmModal from '../components/modals/ConfirmModal';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
const ITEMS_PER_PAGE = 20;

const ExpensesPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { addToast } = useNotifications();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'expense_date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  const canCreate = profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm]);

  const fetchExpenses = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase
      .from('expenses')
      .select('*, organizations(name), profiles(full_name, email)', { count: 'exact' });

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    
    if (searchTerm) {
      query = query.or(`description.ilike.%${searchTerm}%,expense_number.ilike.%${searchTerm}%`);
    }
    
    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    query = query
      .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })
      .range(from, to);
    
    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching expenses:', error.message);
        addToast({ type: 'error', title: 'Error fetching expenses', body: error.message });
    } else {
        setExpenses(data as any || []);
        setTotalItems(count || 0);
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, sortConfig, currentPage, addToast]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses, refreshKey]);

  const handleSort = (key: string) => {
    setCurrentPage(0);
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (expense: Expense | null = null) => {
    setSelectedExpense(expense);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedExpense(null);
  };

  const handleSaveExpense = () => {
    fetchExpenses();
    handleCloseModal();
  };

  const handleCopyExpense = async (expenseId: number) => {
    if (!profile) return;
    try {
        setLoading(true);
        const { data: original, error: fetchError } = await supabase.from('expenses').select('*').eq('id', expenseId).single();
        if (fetchError || !original) throw new Error(fetchError?.message || 'Expense not found.');
        
        const newNumber = await generateNextNumber(profile.org_id, 'expense');
        const { id, created_at, expense_number, ...rest } = original;

        const newExpenseData = {
            ...rest,
            expense_number: newNumber,
            expense_date: format(new Date(), 'yyyy-MM-dd'),
            description: `(Copy) ${original.description}`.trim(),
        };

        const { data: newExpense, error: insertError } = await supabase.from('expenses').insert(newExpenseData).select().single();
        if (insertError) throw insertError;

        addToast({ title: 'Success', body: `Expense copied. Opening new draft...`, type: 'success' });
        handleOpenModal(newExpense);

    } catch (error: any) {
        addToast({ title: 'Error', body: `Failed to copy expense: ${error.message}`, type: 'error' });
    } finally {
        setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    const { error } = await supabase.from('expenses').delete().eq('id', expenseToDelete.id);
    if (error) {
      addToast({ title: 'Error', body: 'Error deleting expense: ' + error.message, type: 'error' });
    } else {
      addToast({ title: 'Success', body: 'Expense deleted.', type: 'success' });
      fetchExpenses();
    }
    setExpenseToDelete(null);
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
  
  const MobileExpenseCard: React.FC<{ expense: Expense }> = ({ expense }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-2">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">{expense.description}</p>
                <p className="text-sm font-mono text-gray-500">{expense.expense_number}</p>
            </div>
            <span className="font-bold text-lg">€{expense.amount.toFixed(2)}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatEuropeanDate(expense.expense_date)}
        </p>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('expenses')}</h1>
          {canCreate && (
            <button onClick={() => handleOpenModal()} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('addExpense')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <input 
            type="text"
            placeholder={t('searchByExpense')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">{t('loading')}</div> : (
          isFieldServiceEmployee ? (
             <div className="space-y-4">
                 {expenses.length > 0 ? expenses.map(expense => (
                    <MobileExpenseCard key={expense.id} expense={expense} />
                  )) : <p className="p-6 text-center text-gray-500">{t('noExpensesFound')}</p>}
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
                        <SortableHeader sortKey="expense_date" label={t('date')} />
                        <SortableHeader sortKey="expense_number" label={t('expense_number')} />
                        <SortableHeader sortKey="description" label={t('description')} />
                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label={t('organization')} />}
                        <SortableHeader sortKey="category" label={t('category')} />
                        <SortableHeader sortKey="amount" label={t('amount')} />
                        <SortableHeader sortKey="profiles.full_name" label={t('createdBy')} />
                        <SortableHeader sortKey="created_at" label={t('createdAt')} />
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                    {expenses.map(expense => (
                        <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(expense.expense_date)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{expense.expense_number}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{expense.description}</td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{expense.organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{expense.category ? t(expense.category as any) : '-'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{expense.amount.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{(expense as any).profiles?.full_name || 'N/A'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(expense.created_at)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            <button onClick={() => handleOpenModal(expense)} className="text-primary-600 hover:text-primary-800" title={t('edit')}><PencilIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleCopyExpense(expense.id)} title={t('copyExpense')}><DocumentDuplicateIcon className="w-5 h-5 text-gray-500 hover:text-primary-600"/></button>
                            <button onClick={() => setExpenseToDelete(expense)} className="text-red-600 hover:text-red-800" title={t('delete')}><TrashIcon className="w-5 h-5"/></button>
                        </td>
                        </tr>
                    ))}
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
      {isModalOpen && <ExpenseModal expense={selectedExpense} closeModal={handleCloseModal} onSave={handleSaveExpense} />}
      <ConfirmModal
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={`${t('delete')} ${t('expenses')}`}
        message={`${t('confirmDeleteExpense')} "${expenseToDelete?.description}"?`}
        confirmText={t('delete')}
      />
    </>
  );
};

export default ExpensesPage;