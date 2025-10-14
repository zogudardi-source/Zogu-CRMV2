import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { XMarkIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { getHelpForPage } from '../../services/helpContentService';
import { useLanguage } from '../../contexts/LanguageContext';

interface HelpModalProps {
    pageKey: string;
    onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ pageKey, onClose }) => {
    const [content, setContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const { language } = useLanguage();

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);

        getHelpForPage(pageKey, language).then(data => {
            if (isMounted) {
                setContent(data);
                setIsLoading(false);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [pageKey, language]);

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                    <div className="flex items-center gap-x-2">
                       <SparklesIcon className="w-6 h-6 text-blue-500" />
                       <h2 className="text-xl font-bold">Help for this page</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700">
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-primary-600"></div>
                        </div>
                    ) : (
                        <article className="prose dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </article>
                    )}
                </main>
            </div>
        </div>,
        document.body
    );
};

export default HelpModal;