import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { TextBlock } from '../../types';

interface TextBlockModalProps {
  textBlock: Partial<TextBlock> | null;
  onClose: () => void;
  onSave: (data: Partial<TextBlock>) => void;
}

const APPLICABLE_TYPES: ('invoice' | 'quote' | 'visit')[] = ['invoice', 'quote', 'visit'];

// Updated placeholders to use consistent square brackets for a cleaner look.
const PLACEHOLDERS = [
    { placeholder: '[customer.name]', description: 'Full name of the customer' },
    { placeholder: '[customer.address]', description: 'Full address of the customer' },
    { placeholder: '[document.number]', description: 'Number of the current document (e.g., INV-2024-0001)' },
    { placeholder: '[document.date]', description: 'Issue date of the document' },
    { placeholder: '[document.total]', description: 'Total amount of the document' },
    { placeholder: '[user.name]', description: 'Full name of the logged-in user' },
    { placeholder: '[organization.name]', description: 'Name of your organization' },
];

const TextBlockModal: React.FC<TextBlockModalProps> = ({ textBlock, onClose, onSave }) => {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [applicableTo, setApplicableTo] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textBlock) {
      setTitle(textBlock.title || '');
      setContent(textBlock.content || '');
      setApplicableTo(textBlock.applicable_to || []);
    }
  }, [textBlock]);

  const handleApplicableToChange = (type: string) => {
    setApplicableTo(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newText = text.substring(0, start) + placeholder + text.substring(end);
      setContent(newText);
      // Focus and move cursor to after the inserted placeholder
      textarea.focus();
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
      }, 0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || applicableTo.length === 0) {
      alert("Title, content, and at least one applicable document type are required.");
      return;
    }
    onSave({
      id: textBlock?.id,
      title,
      content,
      applicable_to: applicableTo as any,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl p-6">
        <h2 className="text-xl font-bold mb-6">{textBlock?.id ? t('editTextBlock') : t('newTextBlock')}</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium">{t('textBlockTitle')}</label>
                <input value={title} onChange={e => setTitle(e.target.value)} required className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500"/>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('textBlockContent')}</label>
                <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} required rows={10} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 font-mono text-sm focus:ring-primary-500 focus:border-primary-500"/>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h4 className="font-semibold mb-3">{t('availablePlaceholders')}</h4>
                <div className="flex flex-wrap gap-2">
                    {PLACEHOLDERS.map(p => (
                        <button
                            type="button"
                            key={p.placeholder}
                            onClick={() => handleInsertPlaceholder(p.placeholder)}
                            className="text-xs bg-gray-200 dark:bg-gray-600 p-1 px-2 rounded hover:bg-primary-100 dark:hover:bg-primary-500/20 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                            title={p.description}
                        >
                            <code>{p.placeholder}</code>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">{t('applicableTo')}</label>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {APPLICABLE_TYPES.map(type => (
                        <label key={type} className="flex items-center cursor-pointer">
                            <input type="checkbox" checked={applicableTo.includes(type)} onChange={() => handleApplicableToChange(type)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"/>
                            <span className="ml-2 capitalize">{t(type === 'visit' ? 'visits' : type as any)}</span>
                        </label>
                    ))}
                </div>
            </div>

          <div className="flex justify-end space-x-2 border-t dark:border-gray-700 pt-6 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">{t('cancel')}</button>
            <button type="submit" className="px-4 py-2 text-white bg-primary-600 rounded-md hover:bg-primary-700">{t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TextBlockModal;