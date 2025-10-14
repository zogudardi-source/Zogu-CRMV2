import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Changelog } from '../types';
import { formatEuropeanDate, formatEuropeanTime } from '../lib/formatting';
import { UserCircleIcon, PencilIcon, PlusCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import Pagination from '../ui/Pagination';
import { useLanguage } from '../../contexts/LanguageContext';

interface ChangelogTimelineProps {
  tableName: string;
  recordId: string;
}

const ITEMS_PER_PAGE = 10;

const actionIcons: Record<string, React.ElementType> = {
  INSERT: PlusCircleIcon,
  UPDATE: PencilIcon,
  DELETE: TrashIcon,
};

const ChangelogTimeline: React.FC<ChangelogTimelineProps> = ({ tableName, recordId }) => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<Changelog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === '') return <span className="text-gray-500 italic">{t('empty')}</span>;
    if (typeof value !== 'string') return <span className="font-mono">{String(value)}</span>;
    return `"${value}"`;
  };

  const renderChanges = (log: Changelog) => {
      const changes = log.changes ? Object.entries(log.changes) : [];
      const filteredChanges = changes.filter(([key]) => !['id', 'org_id', 'user_id', 'created_at', 'updated_at'].includes(key));

      if (log.action === 'INSERT') {
          if (filteredChanges.length === 0) return <p>{t('recordCreatedWithDefaults')}</p>;
          return (
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {filteredChanges.map(([field, value]) => (
                      <li key={field}>
                          {t('set')} <strong>{field.replace(/_/g, ' ')}</strong> {t('to')} {formatValue(value)}.
                      </li>
                  ))}
              </ul>
          );
      }
      if (log.action === 'DELETE') {
          if (filteredChanges.length === 0) return <p>{t('recordDeleted')}</p>;
           return (
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {filteredChanges.map(([field, value]) => (
                      <li key={field}>
                          <strong>{field.replace(/_/g, ' ')}</strong> {t('was')} {formatValue(value)}.
                      </li>
                  ))}
              </ul>
          );
      }
      if (log.action === 'UPDATE' && log.changes) {
          // Fix: Cast 'values' from 'unknown' to 'any' to safely access 'old' and 'new' properties in the audit log timeline. The 'changes' field in the 'Changelog' type is 'any', and Object.entries infers the value as 'unknown', causing a type error.
          if (filteredChanges.length === 0) return <p>{t('recordUpdatedNoChanges')}</p>;
          return (
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {filteredChanges.map(([field, values]: [string, any]) => (
                      <li key={field}>
                          {t('changed')} <strong>{field.replace(/_/g, ' ')}</strong> {t('from')} {formatValue(values.old)} {t('to')} {formatValue(values.new)}.
                      </li>
                  ))}
              </ul>
          );
      }
      return null;
  };

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      const from = currentPage * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from('changelog')
        .select('*', { count: 'exact' })
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error("Error fetching changelog:", error);
      } else {
        setLogs(data || []);
        setTotalItems(count || 0);
      }
      setLoading(false);
    };

    fetchLogs();
  }, [tableName, recordId, currentPage]);

  if (loading) {
    return <div>{t('loadingHistory')}</div>;
  }

  if (logs.length === 0) {
    return <p className="text-gray-500">{t('noHistoryFound')}</p>;
  }

  return (
    <div>
        <div className="flow-root">
        <ul role="list" className="-mb-8">
            {logs.map((log, index) => {
            const Icon = actionIcons[log.action] || UserCircleIcon;
            const actionText = log.action === 'INSERT' ? t('createdThisRecord') : log.action === 'UPDATE' ? t('updatedThisRecord') : t('deletedThisRecord');
            return (
                <li key={log.id}>
                <div className="relative pb-8">
                    {index !== logs.length - 1 && (
                    <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
                    )}
                    <div className="relative flex space-x-3">
                    <div>
                        <span className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center ring-8 ring-white dark:ring-gray-800">
                        <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                        </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                        <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-900 dark:text-white">{log.user_email || t('system')}</span> {actionText}
                        </p>
                        <div className="mt-2">
                            {renderChanges(log)}
                        </div>
                        </div>
                        <div className="whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                            <time dateTime={log.created_at}>{formatEuropeanDate(log.created_at)}</time>
                            <p className="text-xs">{formatEuropeanTime(log.created_at)}</p>
                        </div>
                    </div>
                    </div>
                </div>
                </li>
            )
            })}
        </ul>
        </div>
        <div className="mt-8">
            <Pagination
                currentPage={currentPage}
                totalItems={totalItems}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
            />
        </div>
    </div>
  );
};

export default ChangelogTimeline;