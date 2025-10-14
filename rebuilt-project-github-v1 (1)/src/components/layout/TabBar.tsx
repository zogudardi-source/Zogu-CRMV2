import React from 'react';
import { NavLink } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTabs } from '../../contexts/TabContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

// Define the set of base paths that are considered main/list pages (not object pages).
const BASE_PATHS = new Set([
  '/', '/dispatcher', '/customers', '/appointments', '/visits', '/quotes',
  '/invoices', '/inventory', '/expenses', '/tasks', '/reports', '/team',
  '/settings', '/migration-center', '/profile'
]);

const TabBar: React.FC = () => {
  const { tabs, activeTabKey, closeTab, closeAllTabs } = useTabs();
  const { profile } = useAuth();
  const { t } = useLanguage();

  // The tabbing UI is hidden if there's only the dashboard tab.
  if (tabs.length <= 1) {
    return null;
  }

  const handleCloseTab = (e: React.MouseEvent, key: string) => {
    // Prevent default browser action (e.g., focus shifting).
    e.preventDefault();
    // Stop this event from bubbling up to prevent any parent
    // listeners (like React Router) from interfering with the close action.
    e.stopPropagation();
    
    // Decouple the state update from the event. This pushes the execution
    // to the end of the browser's event queue, guaranteeing the full
    // click cycle (mousedown + mouseup) completes before the element is removed.
    setTimeout(() => {
      closeTab(key);
    }, 0);
  };

  return (
    <div className="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
      <div className="flex items-center">
        <nav className="flex-1 flex space-x-1 overflow-x-auto p-1.5 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTabKey === tab.key;
            // A "main tab" is any tab whose path is a main list/base page.
            const isMainTabPage = BASE_PATHS.has(tab.path);

            return (
              <div
                key={tab.key}
                className={`flex items-center shrink-0 group whitespace-nowrap rounded-md transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-900'
                    : 'hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                <NavLink
                  to={tab.path}
                  className={`pl-4 pr-3 py-2 text-sm ${
                    isMainTabPage
                      ? 'font-bold text-primary-600 dark:text-primary-400'
                      : isActive
                        ? 'font-medium text-gray-900 dark:text-white'
                        : 'font-medium text-gray-500 dark:text-gray-400'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </NavLink>
                {!tab.isPermanent && (
                  <button
                    onMouseDown={(e) => handleCloseTab(e, tab.key)}
                    className="pr-2"
                    aria-label={`Close tab: ${tab.label}`}
                  >
                    <div className="p-0.5 rounded-full hover:bg-gray-300/50 dark:hover:bg-slate-600/50">
                       {/* The icon is made invisible to pointer events to ensure the parent button is always the reliable click target. */}
                       <XMarkIcon 
                          className={`w-4 h-4 pointer-events-none ${
                            isActive 
                              ? 'text-primary-600 dark:text-gray-200' 
                              : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'
                          }`} 
                        />
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </nav>
        <div className="px-2 shrink-0">
          <button
            onClick={closeAllTabs}
            className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700"
            aria-label={t('closeAllTabs')}
            title={t('closeAllTabs')}
          >
            <XMarkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TabBar;