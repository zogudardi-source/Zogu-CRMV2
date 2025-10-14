import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel' 
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    // The modal can be closed by the parent component after the action is complete.
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 id="confirm-modal-title" className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end space-x-2">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 bg-gray-200 rounded-md text-sm font-medium hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500"
          >
            {cancelText}
          </button>
          <button 
            type="button" 
            onClick={handleConfirm} 
            className="px-4 py-2 text-white bg-primary-600 rounded-md text-sm font-medium hover:bg-primary-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
