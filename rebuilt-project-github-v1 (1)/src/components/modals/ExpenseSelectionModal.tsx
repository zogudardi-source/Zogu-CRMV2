import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useRefresh } from '../../contexts/RefreshContext';
import { Expense } from '../../types';

interface ExpenseSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (expenses: Expense[]) => void;
  onAddNew: () => void;
  context?: 'visit' | 'invoice' | 'quote';
}

const ExpenseSelectionModal: React.FC<ExpenseSelectionModalProps> = ({ isOpen, onClose, onAdd, onAddNew, context = 'invoice' }) => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchExpenses = useCallback(async () => {
    if (!profile?.org_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('expense_date', { ascending: false });

    if (error) {
      console.error('Error fetching expenses:', error);
    } else {
      setExpenses(data);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (isOpen) {
      fetchExpenses();
    }
  }, [isOpen, fetchExpenses, refreshKey]);

  const handleToggleSelection = (id: number) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleAddSelected = () => {
    const selectedExpenses = expenses.filter(expense => selectedIds.has(expense.id));
    onAdd(selectedExpenses);
  };

  const filteredExpenses = expenses.filter(expense =>
    (expense.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="expense-selection-modal-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 flex flex-col h-[80vh] max-h-[600px]">
        <h2 id="expense-selection-modal-title" className="text-xl font-bold mb-4">{t('selectExpenses')}</h2>
        
        <input
          type="text"
          placeholder={t('searchExpenses')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded mb-4 dark:bg-gray-700 dark:border-gray-600"
        />

        <div className="flex-1 overflow-y-auto border-t border-b dark:border-gray-700">
          {loading ? (
            <p className="text-center p-4">Loading expenses...</p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {filteredExpenses.map(expense => (
                <li key={expense.id} className="p-3 flex items-center hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(expense.id)}
                    onChange={() => handleToggleSelection(expense.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="ml-3 text-sm">
                    <p className="font-medium text-gray-900 dark:text-gray-200">{expense.description}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      {context !== 'visit' && `€${expense.amount.toFixed(2)} on `}
                      {new Date(expense.expense_date).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-between items-center pt-4">
           <button
            type="button"
            onClick={onAddNew}
            className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-100 rounded-md hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-900"
          >
            {t('newExpense')}
          </button>
          <div className="flex space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-white bg-primary-600 rounded-md disabled:bg-primary-300"
            >
              {t('addSelected')} ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenseSelectionModal;