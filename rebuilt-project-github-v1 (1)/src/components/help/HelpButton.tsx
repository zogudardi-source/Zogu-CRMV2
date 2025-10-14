import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import HelpModal from './HelpModal';

const getPageKeyFromPathname = (pathname: string): string => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'dashboard';
    
    const page = segments[0];
    const action = segments[1];

    if (['invoices', 'quotes', 'visits'].includes(page)) {
        if (action === 'new' || action === 'edit') return `${page}_editor`;
        return `${page}_list`;
    }
    if (page === 'customers') {
        if (action) return 'customer_detail'; // If there is a second segment (the ID)
        return 'customers_list';
    }
    if (['inventory', 'expenses', 'tasks', 'appointments', 'dispatcher', 'team', 'settings', 'reports', 'profile', 'migration-center', 'text-blocks', 'audit-log'].includes(page)) {
      return `${page}_list`; // Standardize to _list for list pages
    }

    return page; // fallback
};


const HelpButton: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const location = useLocation();

    const pageKey = useMemo(() => getPageKeyFromPathname(location.pathname), [location.pathname]);

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-slate-700"
                title="Help for this page"
            >
                <QuestionMarkCircleIcon className="w-6 h-6" />
            </button>
            {isModalOpen && <HelpModal pageKey={pageKey} onClose={() => setIsModalOpen(false)} />}
        </>
    );
};

export default HelpButton;
