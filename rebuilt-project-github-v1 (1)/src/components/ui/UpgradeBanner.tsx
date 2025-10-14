import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';

interface UpgradeBannerProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

const UpgradeBanner: React.FC<UpgradeBannerProps> = ({ isOpen, onClose, message }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  if (!isOpen) return null;

  const handleUpgradeClick = () => {
    // In a real app with a pricing page, you would navigate there.
    // For now, it can just close the banner or navigate to profile.
    // navigate('/pricing'); 
    onClose();
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-3xl z-50 px-4 animate-fade-in-down">
        <div className="p-4 bg-gradient-to-r from-primary-500 to-indigo-600 rounded-lg shadow-2xl text-white">
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <h3 className="font-bold">{t('upgradeToPro')}</h3>
                    <p className="text-sm text-primary-100">{message}</p>
                </div>
                <button 
                    onClick={handleUpgradeClick}
                    className="ml-4 px-4 py-2 bg-white text-primary-600 font-semibold rounded-md shadow-md hover:bg-gray-100 transition-colors text-sm shrink-0"
                >
                    {t('upgradeNow')}
                </button>
                <button onClick={onClose} className="ml-2 p-1 text-white hover:bg-white/20 rounded-full">
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
  );
};

export default UpgradeBanner;