import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const ConfigurationNotice: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-2xl p-8 mx-4 space-y-6 bg-white rounded-lg shadow-2xl dark:bg-gray-800">
        <div className="text-center">
            <svg className="w-16 h-16 mx-auto text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
                {t('configurationRequired')}
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
                {t('welcomeToZogu')}
            </p>
        </div>

        <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {t('openFollowingFile')}
            </p>
            <code className="block px-3 py-2 mt-1 text-sm text-red-600 bg-gray-200 rounded-md dark:bg-gray-900 dark:text-red-400">
                services/supabase.ts
            </code>
        </div>
        
        <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
               {t('replacePlaceholders')}
            </p>
            <pre className="mt-2 overflow-x-auto text-sm bg-gray-200 rounded-md dark:bg-gray-900">
                <code className="text-gray-700 dark:text-gray-300">
{`
const supabaseUrl = 'YOUR_SUPABASE_URL'; // <-- REPLACE THIS
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'; // <-- REPLACE THIS
`}
                </code>
            </pre>
        </div>
        
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            {t('pageWillReload')}
        </p>
      </div>
    </div>
  );
};

export default ConfigurationNotice;