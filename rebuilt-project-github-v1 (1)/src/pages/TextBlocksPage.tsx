import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { TextBlock, Organization } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import TextBlockModal from '../components/modals/TextBlockModal';
import Pagination from '../components/ui/Pagination';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useNotifications } from '../contexts/NotificationContext';
import { formatEuropeanDate } from '../lib/formatting';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
const ITEMS_PER_PAGE = 20;

const TextBlocksPage: React.FC = () => {
    const { profile, user } = useAuth();
    const { t } = useLanguage();
    const { refreshKey } = useRefresh();
    const { addToast } = useNotifications();
    const [textBlocks, setTextBlocks] = useState<(TextBlock & { organization_name?: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedBlock, setSelectedBlock] = useState<TextBlock | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'title', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(0);
    const [totalItems, setTotalItems] = useState(0);
    const [blockToDelete, setBlockToDelete] = useState<TextBlock | null>(null);
    
    // State for super admin
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState<string>('');

    const canCreate = profile?.role !== 'field_service_employee';

    useEffect(() => {
        if (profile?.role === 'super_admin') {
            supabase.from('organizations').select('id, name').then(({ data }) => {
                setOrganizations(data || []);
            });
        }
    }, [profile]);

    useEffect(() => {
        setCurrentPage(0);
    }, [searchTerm, selectedOrgId]);

    const fetchTextBlocks = useCallback(async () => {
        if (!profile) return;
        setLoading(true);

        const targetOrgId = profile.role === 'super_admin' ? selectedOrgId : profile.org_id;

        if (profile.role === 'super_admin' && !targetOrgId) {
            setTextBlocks([]);
            setTotalItems(0);
            setLoading(false);
            return;
        }

        let query = supabase.from('text_blocks').select('*, organizations(name)', { count: 'exact' });

        if (targetOrgId) {
            query = query.eq('org_id', targetOrgId);
        }

        if (searchTerm) {
            query = query.or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);
        }

        const from = currentPage * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' }).range(from, to);
        
        const { data, error, count } = await query;
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Failed to fetch text blocks.' });
        } else {
            const formattedData = (data || []).map(item => ({ ...item, organization_name: (item as any).organizations?.name || 'N/A'}));
            setTextBlocks(formattedData);
            setTotalItems(count || 0);
        }
        setLoading(false);
    }, [profile, searchTerm, currentPage, sortConfig, addToast, selectedOrgId]);

    useEffect(() => {
        fetchTextBlocks();
    }, [fetchTextBlocks, refreshKey]);

    const handleSort = (key: string) => {
        setCurrentPage(0);
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const handleOpenModal = (block: TextBlock | null = null) => {
        setSelectedBlock(block);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedBlock(null);
    };

    const handleSave = async (data: Partial<TextBlock>) => {
        const targetOrgId = profile?.role === 'super_admin' ? selectedOrgId : profile?.org_id;
        if (!targetOrgId || !user?.id) {
            addToast({ type: 'error', title: 'Error', body: 'Organization not selected or user not logged in.' });
            return;
        };
        const dataToSave = { ...data, org_id: targetOrgId, user_id: user.id };
        const { error } = await supabase.from('text_blocks').upsert(dataToSave);
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Failed to save text block: ' + error.message });
        } else {
            addToast({ type: 'success', title: 'Success', body: 'Text block saved.' });
            handleCloseModal();
            fetchTextBlocks();
        }
    };

    const handleConfirmDelete = async () => {
        if (!blockToDelete) return;
        const { error } = await supabase.from('text_blocks').delete().eq('id', blockToDelete.id);
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Failed to delete text block: ' + error.message });
        } else {
            addToast({ type: 'success', title: 'Success', body: 'Text block deleted.' });
            fetchTextBlocks();
        }
        setBlockToDelete(null);
    };

    const SortableHeader: React.FC<{ sortKey: string; label: string }> = ({ sortKey, label }) => (
        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" onClick={() => handleSort(sortKey)}>
            <div className="flex items-center">
                <span>{label}</span>
                {sortConfig.key === sortKey && (sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />)}
            </div>
        </th>
    );

    return (
        <>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('textBlocks')}</h1>
                    {canCreate && (
                        <button 
                            onClick={() => handleOpenModal()} 
                            disabled={profile?.role === 'super_admin' && !selectedOrgId}
                            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            <PlusIcon className="w-5 h-5 mr-2" /> {t('newTextBlock')}
                        </button>
                    )}
                </div>

                {profile?.role === 'super_admin' && (
                    <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
                        <label htmlFor="org-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('selectOrg')}</label>
                        <select
                            id="org-select"
                            value={selectedOrgId}
                            onChange={e => setSelectedOrgId(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                        >
                            <option value="">-- {t('selectOrgToBegin')} --</option>
                            {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                        </select>
                    </div>
                )}
                
                <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
                    <input type="text" placeholder={t('search')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"/>
                </div>
                {loading ? <div className="p-6 text-center text-gray-500">{t('loading')}</div> : (
                    <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-50 dark:bg-slate-900/50">
                                    <tr>
                                        <SortableHeader sortKey="title" label={t('title')} />
                                        <SortableHeader sortKey="content" label={t('content')} />
                                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label={t('organization')} />}
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('applicableTo')}</th>
                                        <SortableHeader sortKey="created_at" label={t('createdAt')} />
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y dark:divide-gray-700">
                                    {textBlocks.map(block => (
                                        <tr key={block.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{block.title}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 truncate max-w-sm">{block.content}</td>
                                            {profile?.role === 'super_admin' && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{block.organization_name}</td>}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">{block.applicable_to.map(type => t(type as any)).join(', ')}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(block.created_at)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                                <button onClick={() => handleOpenModal(block)} className="text-primary-600 hover:text-primary-800" title={t('edit')}><PencilIcon className="w-5 h-5"/></button>
                                                <button onClick={() => setBlockToDelete(block)} className="text-red-600 hover:text-red-800" title={t('delete')}><TrashIcon className="w-5 h-5"/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination currentPage={currentPage} totalItems={totalItems} itemsPerPage={ITEMS_PER_PAGE} onPageChange={setCurrentPage} />
                    </div>
                )}
            </div>
            {isModalOpen && <TextBlockModal textBlock={selectedBlock} onClose={handleCloseModal} onSave={handleSave} />}
            <ConfirmModal
                isOpen={!!blockToDelete}
                onClose={() => setBlockToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={t('delete') + ' ' + t('textBlocks')}
                message={t('confirmDeleteTextBlock')}
                confirmText={t('delete')}
            />
        </>
    );
};

export default TextBlocksPage;