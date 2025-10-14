
import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTabs } from '../../contexts/TabContext';
import {
  HomeIcon,
  UsersIcon,
  BriefcaseIcon,
  UserCircleIcon,
  PlusIcon,
  XMarkIcon,
  DocumentPlusIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

interface BottomNavBarProps {
  onOpenTaskModal: () => void;
  onOpenExpenseModal: () => void;
  onOpenAppointmentModal: () => void;
}


const BottomNavBar: React.FC<BottomNavBarProps> = ({ onOpenTaskModal, onOpenExpenseModal, onOpenAppointmentModal }) => {
  const { t } = useLanguage();
  const { openTab, activeTabKey } = useTabs();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: t('dashboard'), icon: HomeIcon, labelKey: 'dashboard' },
    { path: '/quotes', label: t('quotes'), icon: DocumentPlusIcon, labelKey: 'quotes' },
    // Placeholder for the FAB
    { path: 'FAB_PLACEHOLDER', label: '', icon: PlusIcon, labelKey: ''},
    { path: '/customers', label: t('customers'), icon: UsersIcon, labelKey: 'customers' },
    { path: '/visits', label: t('visits'), icon: BriefcaseIcon, labelKey: 'visits' },
  ];
  
  // The order is reversed to appear correctly from bottom-to-top in the UI.
  const menuItems = [
    { label: t('newVisit'), icon: BriefcaseIcon, action: () => openTab({ path: '/visits/new', label: t('newVisit'), labelKey: 'newVisit' }) },
    { label: t('newQuote'), icon: DocumentPlusIcon, action: () => openTab({ path: '/quotes/new', label: t('newQuote'), labelKey: 'newQuote' }) },
    { label: t('addAppointment'), icon: CalendarDaysIcon, action: onOpenAppointmentModal },
    { label: t('addTask'), icon: ClipboardDocumentListIcon, action: onOpenTaskModal },
    { label: t('addExpense'), icon: CurrencyDollarIcon, action: onOpenExpenseModal },
  ].reverse();

  const handleMenuAction = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };


  return (
    <>
      {/* Overlay for menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-gray-900 bg-opacity-75 z-40 transition-opacity" 
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}

      {/* Main Navigation Bar */}
      <nav className="relative h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-around items-center z-50">
        
        {/* FAB Menu Items */}
        <div className={`absolute bottom-full mb-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 transition-all duration-300 ease-in-out ${isMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
            {menuItems.map((item) => (
                <button 
                    key={item.label}
                    onClick={() => handleMenuAction(item.action)}
                    className="flex items-center justify-between w-64 bg-white dark:bg-slate-700 rounded-full shadow-lg pl-6 pr-2 py-2 text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
                >
                    <span>{item.label}</span>
                    <span className="w-10 h-10 bg-gray-100 dark:bg-slate-600 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-300">
                        <item.icon className="w-6 h-6"/>
                    </span>
                </button>
            ))}
        </div>

        {navLinks.slice(0, 2).map((link) => {
          const isActive = activeTabKey === link.path;
          return (
            <button key={link.path} onClick={() => openTab({ path: link.path, label: link.label, labelKey: link.labelKey })} className={`flex flex-col items-center justify-center w-full h-full text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`}>
                <link.icon className="w-6 h-6 mb-1" />
                <span>{link.label}</span>
            </button>
          );
        })}

        <div className="w-full flex justify-center">
             <button 
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="relative w-16 h-16 bg-primary-600 rounded-full text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                style={{ zIndex: 51 }} // Ensure FAB is on top of its menu
             >
                <XMarkIcon className={`w-8 h-8 absolute transition-all duration-300 ${isMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-45 scale-50'}`} />
                <PlusIcon className={`w-8 h-8 absolute transition-all duration-300 ${isMenuOpen ? 'opacity-0 rotate-45 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
            </button>
        </div>

        {navLinks.slice(3, 5).map((link) => {
           const isActive = activeTabKey === link.path;
           return (
             <button key={link.path} onClick={() => openTab({ path: link.path, label: link.label, labelKey: link.labelKey })} className={`flex flex-col items-center justify-center w-full h-full text-xs transition-colors ${isActive ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`}>
                 <link.icon className="w-6 h-6 mb-1" />
                 <span>{link.label}</span>
             </button>
           );
        })}
      </nav>
    </>
  );
};

export default BottomNavBar;
