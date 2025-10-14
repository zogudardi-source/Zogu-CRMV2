import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LegalContent } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type LegalContentData = {
    agb: LegalContent;
    datenschutz: LegalContent;
};

const LegalContentPage: React.FC = () => {
    const { profile } = useAuth();
    const { t, language } = useLanguage();
    const [content, setContent] = useState<LegalContentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'agb' | 'datenschutz'>('agb');
    
    // editable state for super_admin
    const [editableContentDe, setEditableContentDe] = useState('');
    const [editableContentAl, setEditableContentAl] = useState('');

    const isSuperAdmin = profile?.role === 'super_admin';

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('legal_content').select('*');
        if (error) {
            console.error("Error fetching legal content:", error);
        } else {
            const agb = data.find(d => d.key === 'agb');
            const datenschutz = data.find(d => d.key === 'datenschutz');
            setContent({
                agb: agb || { key: 'agb', content_de: '', content_al: '' },
                datenschutz: datenschutz || { key: 'datenschutz', content_de: '', content_al: '' },
            });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (content) {
            const currentContent = content[activeTab];
            setEditableContentDe(currentContent.content_de || '');
            setEditableContentAl(currentContent.content_al || '');
        }
    }, [content, activeTab]);
    
    const handleSave = async () => {
        if (!isSuperAdmin || !content) return;
        setIsSaving(true);
        const { error } = await supabase.from('legal_content').upsert({
            key: activeTab,
            content_de: editableContentDe,
            content_al: editableContentAl,
        });
        if (error) {
            alert('Error saving content: ' + error.message);
        } else {
            alert('Content saved successfully!');
            fetchData();
        }
        setIsSaving(false);
    };

    const contentForDisplay = content ? (content[activeTab][language === 'de' ? 'content_de' : 'content_al'] || '') : '';

    if (loading) {
        return <div className="text-center p-8">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('legalContent')}</h1>
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('agb')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'agb' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                            {t('agb')}
                        </button>
                        <button
                            onClick={() => setActiveTab('datenschutz')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'datenschutz' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                            {t('datenschutz')}
                        </button>
                    </nav>
                </div>

                <div className="p-6">
                    {isSuperAdmin ? (
                        <div className="space-y-4">
                             <div>
                                <label className="block text-sm font-medium mb-1">Deutsch (DE)</label>
                                <textarea
                                    value={editableContentDe}
                                    onChange={e => setEditableContentDe(e.target.value)}
                                    rows={15}
                                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Shqip (AL)</label>
                                <textarea
                                    value={editableContentAl}
                                    onChange={e => setEditableContentAl(e.target.value)}
                                    rows={15}
                                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                                />
                            </div>
                            <div className="flex justify-end">
                                <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
                                    {isSaving ? t('saving') : t('save')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <article className="prose dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {contentForDisplay || 'Content not available in this language.'}
                            </ReactMarkdown>
                        </article>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LegalContentPage;
