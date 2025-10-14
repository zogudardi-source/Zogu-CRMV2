import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { TextBlock } from '../../types';

interface TextBlockSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
  documentType: 'invoice' | 'quote' | 'visit';
}

const TextBlockSelectionModal: React.FC<TextBlockSelectionModalProps> = ({ isOpen, onClose, onSelect, documentType }) => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewBlock, setPreviewBlock] = useState<TextBlock | null>(null);

  useEffect(() => {
    if (isOpen && profile?.org_id) {
      setLoading(true);
      setPreviewBlock(null); // Reset preview on open
      supabase
        .from('text_blocks')
        .select('*')
        .eq('org_id', profile.org_id)
        .contains('applicable_to', [documentType])
        .order('title')
        .then(({ data, error }) => {
          if (error) console.error("Error fetching text blocks:", error);
          else setTextBlocks(data || []);
          setLoading(false);
        });
    }
  }, [isOpen, profile, documentType]);

  if (!isOpen) return null;

  const handleSelectAndClose = () => {
    if (previewBlock) {
        onSelect(previewBlock.content);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl p-6 flex flex-col h-[60vh] max-h-[700px]">
        <h2 className="text-xl font-bold mb-4 shrink-0">{t('selectTextBlock')}</h2>
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p>{t('loading')}...</p></div>
        ) : textBlocks.length > 0 ? (
            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Left Panel: List of Blocks */}
                <div className="w-1/3 border-r dark:border-gray-700 pr-4 overflow-y-auto">
                    <div className="space-y-2">
                    {textBlocks.map(block => (
                        <button
                        key={block.id}
                        onClick={() => setPreviewBlock(block)}
                        className={`w-full text-left p-3 rounded-md transition-colors text-sm font-medium ${
                            previewBlock?.id === block.id 
                            ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-200' 
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        >
                        {block.title}
                        </button>
                    ))}
                    </div>
                </div>

                {/* Right Panel: Preview */}
                <div className="w-2/3 flex flex-col">
                    <h3 className="text-lg font-semibold mb-2 shrink-0">{t('preview')}</h3>
                    <div className="flex-1 p-3 border rounded-md bg-gray-50 dark:bg-gray-900 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {previewBlock ? (
                        previewBlock.content
                    ) : (
                        <p className="text-gray-400 italic">{t('selectItemToPreview')}</p>
                    )}
                    </div>
                </div>
            </div>
        ) : (
          <p className="flex-1 text-center text-gray-500 py-10">{t('noTextBlocks')}</p>
        )}
        
        <div className="mt-6 flex justify-end space-x-2 border-t dark:border-gray-700 pt-4 shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">
            {t('cancel')}
          </button>
          <button
            onClick={handleSelectAndClose}
            disabled={!previewBlock}
            className="px-4 py-2 text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
          >
            {t('insertTextBlock')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextBlockSelectionModal;