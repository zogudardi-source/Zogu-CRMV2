

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useRefresh } from '../../contexts/RefreshContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTabs } from '../../contexts/TabContext';
import { useModal } from '../../contexts/ModalContext';
import { 
  UserCircleIcon, ArrowRightOnRectangleIcon, Bars3Icon, ArrowPathIcon, BellIcon, PlusIcon, ChevronDownIcon,
  DocumentTextIcon, DocumentDuplicateIcon, UserPlusIcon, BriefcaseIcon, ArchiveBoxIcon, ClipboardDocumentListIcon, CurrencyDollarIcon, CalendarDaysIcon
} from '@heroicons/react/24/outline';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import NotificationPanel from '../notifications/NotificationPanel';
import { defaultPermissions } from '../../constants';
import GlobalSearch from '../search/GlobalSearch';
import HelpButton from '../help/HelpButton';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  // Fix: Destructured `signOut` from `useAuth` to make it available for the logout button.
  const { user, profile, permissions, signOut } = useAuth();
  const { triggerRefresh } = useRefresh();
  const { unreadCount } = useNotifications();
  const location = useLocation();
  const { t } = useLanguage();
  const { openTab } = useTabs();
  const { openProductModal, openTaskModal, openExpenseModal, openAppointmentModal, openCustomerModal } = useModal();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  const isEditorPage = location.pathname.includes('/new') || location.pathname.includes('/edit/');

  const handleRefresh = () => {
    if (isEditorPage) return;
    setIsRefreshing(true);
    triggerRefresh();
    setTimeout(() => setIsRefreshing(false), 1000); // Visual feedback duration
  };

  // Effect to handle closing dropdowns on click outside.
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!target) return;
      if (dropdownRef.current && !dropdownRef.current.contains(target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target as Node)) {
        setNotificationsOpen(false);
      }
      if (createMenuRef.current && !createMenuRef.current.contains(target as Node)) {
        setIsCreateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', clickHandler);
    return () => document.removeEventListener('mousedown', clickHandler);
  }, []);
  
  const hasPermission = useCallback((permissionKey: string): boolean => {
    if (!profile) return false;

    // Use database permissions if they exist and are an array
    if (Array.isArray(permissions)) {
      return permissions.includes(permissionKey);
    }

    // Otherwise, fall back to the default permissions for the user's role
    const roleDefaults = defaultPermissions[profile.role] || [];
    return roleDefaults.includes(permissionKey);
  }, [profile, permissions]);


  const canCreateInvoice = useMemo(() => profile?.role !== 'super_admin' && profile?.role !== 'field_service_employee' && hasPermission('invoices'), [profile, hasPermission]);
  const canCreateQuote = useMemo(() => profile?.role !== 'super_admin' && hasPermission('quotes'), [profile, hasPermission]);
  const canCreateCustomer = useMemo(() => profile?.role !== 'super_admin' && hasPermission('customers'), [profile, hasPermission]);
  const canCreateVisit = useMemo(() => profile?.role !== 'super_admin' && hasPermission('visits'), [profile, hasPermission]);
  const canCreateProduct = useMemo(() => profile?.role !== 'super_admin' && hasPermission('inventory'), [profile, hasPermission]);
  const canCreateTask = useMemo(() => profile?.role !== 'super_admin' && hasPermission('tasks'), [profile, hasPermission]);
  const canCreateExpense = useMemo(() => profile?.role !== 'super_admin' && hasPermission('expenses'), [profile, hasPermission]);
  const canCreateAppointment = useMemo(() => hasPermission('appointments'), [hasPermission]);

  const createMenuItems = [
    { label: t('newInvoice'), icon: DocumentTextIcon, action: () => openTab({ path: '/invoices/new', label: t('newInvoice'), labelKey: 'newInvoice' }), condition: canCreateInvoice },
    { label: t('newQuote'), icon: DocumentDuplicateIcon, action: () => openTab({ path: '/quotes/new', label: t('newQuote'), labelKey: 'newQuote' }), condition: canCreateQuote },
    { label: t('newCustomer'), icon: UserPlusIcon, action: openCustomerModal, condition: canCreateCustomer },
    { label: t('newVisit'), icon: BriefcaseIcon, action: () => openTab({ path: '/visits/new', label: t('newVisit'), labelKey: 'newVisit' }), condition: canCreateVisit },
    { label: t('newProduct'), icon: ArchiveBoxIcon, action: openProductModal, condition: canCreateProduct },
    { label: t('addTask'), icon: ClipboardDocumentListIcon, action: () => openTaskModal(), condition: canCreateTask },
    { label: t('addExpense'), icon: CurrencyDollarIcon, action: openExpenseModal, condition: canCreateExpense },
    { label: t('addAppointment'), icon: CalendarDaysIcon, action: () => openAppointmentModal(), condition: canCreateAppointment },
  ].filter(item => item.condition);


  return (
    <header className="flex items-center justify-between h-16 px-4 bg-gray-50 border-b shrink-0 dark:bg-slate-900 dark:border-slate-800 sm:px-6 lg:px-8">
      {/* Left section */}
      <div className="flex items-center space-x-4 flex-shrink-0">
        <button
            className="text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={t('toggleSidebar')}
        >
            <Bars3Icon className="w-6 h-6" />
        </button>
      </div>
      
      {/* Center section - Search Bar (hidden on mobile) */}
      <div className="flex-1 flex justify-center px-4 hidden md:flex">
        <GlobalSearch />
      </div>

      {/* Right section */}
      <div className="flex items-center space-x-4 flex-shrink-0">
        <button
          onClick={handleRefresh}
          disabled={isEditorPage}
          className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('refreshData')}
          aria-label={t('refreshData')}
        >
          <ArrowPathIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        <div className="relative" ref={createMenuRef}>
            <button
                onClick={() => setIsCreateMenuOpen(prev => !prev)}
                className="flex items-center gap-x-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700"
            >
                <PlusIcon className="w-5 h-5" />
                <span className="hidden sm:inline">{t('create')}</span>
                <ChevronDownIcon className="w-4 h-4" />
            </button>
            {isCreateMenuOpen && createMenuItems.length > 0 && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-md shadow-lg z-20 border dark:border-slate-700">
                    {createMenuItems.map(item => (
                        <button
                            key={item.label}
                            onClick={() => { item.action(); setIsCreateMenuOpen(false); }}
                            className="w-full text-left flex items-center gap-x-3 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
                        >
                            <item.icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
        
        <div className="relative" ref={notificationsRef}>
            <button
                onClick={() => setNotificationsOpen(prev => !prev)}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-slate-700"
                aria-label={t('toggleNotifications')}
            >
                <BellIcon className="w-6 h-6"/>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                        {unreadCount}
                    </span>
                )}
            </button>
            {notificationsOpen && <NotificationPanel onClose={() => setNotificationsOpen(false)} />}
        </div>

        <HelpButton />
        
        <LanguageSwitcher />

        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center space-x-2 focus:outline-none"
            onClick={() => setDropdownOpen(prev => !prev)}
          >
            <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-200 sm:block">
              {profile?.full_name || user?.email}
            </span>
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center dark:bg-slate-700">
              <UserCircleIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
            </div>
          </button>
          {dropdownOpen && (
            <div 
              className="absolute right-0 w-48 mt-2 py-2 bg-white rounded-md shadow-xl z-20 dark:bg-slate-800 border dark:border-slate-700"
            >
              <NavLink
                to="/profile"
                onClick={() => setDropdownOpen(false)}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
              >
                {t('profile')}
              </NavLink>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  signOut();
                }}
                className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5 mr-2" />
                {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;