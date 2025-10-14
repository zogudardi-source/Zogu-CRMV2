
import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'de' ? 'al' : 'de');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
    >
      {language.toUpperCase()}
    </button>
  );
};

export default LanguageSwitcher;
