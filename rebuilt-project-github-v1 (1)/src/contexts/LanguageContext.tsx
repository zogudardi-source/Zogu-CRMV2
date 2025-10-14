
import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { translations } from '../constants';

type Language = 'de' | 'al';
type TranslationKey = keyof typeof translations['de'];

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('de');

  const t = useCallback((key: TranslationKey): string => {
    return translations[language][key] || translations['de'][key];
  }, [language]);
  
  const value = {
    language,
    setLanguage,
    t
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
