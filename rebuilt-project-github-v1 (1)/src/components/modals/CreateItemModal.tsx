import React from 'react';
import {
  BriefcaseIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: 'visit' | 'task' | 'appointment') => void;
  t: (key: any) => string;
}

const CreateItemModal: React.FC<CreateItemModalProps> = ({ isOpen, onClose, onSelect, t }) => {
  if (!isOpen) return null;

  const items = [
    { type: 'visit' as const, label: t('newVisit'), icon: BriefcaseIcon },
    { type: 'appointment' as const, label: t('addAppointment'), icon: CalendarDaysIcon },
    { type: 'task' as const, label: t('addTask'), icon: ClipboardDocumentListIcon },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-xl font-bold mb-4">{t('whatToCreate')}</h2>
        <div className="space-y-3">
          {items.map(item => (
            <button key={item.type} onClick={() => onSelect(item.type)} className="w-full flex items-center p-3 text-left bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
              <item.icon className="w-6 h-6 mr-4 text-primary-600" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 text-right">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md text-sm font-medium">{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
};

export default CreateItemModal;