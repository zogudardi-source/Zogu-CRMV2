import React, { useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { CubeIcon } from '@heroicons/react/24/solid';
import { allNavLinks } from '../../constants';


interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { t } = useLanguage();
  const { profile, permissions, permissionsLoaded } = useAuth();
  const sidebar = useRef<HTMLDivElement>(null);

  // Effect to handle closing the sidebar on click outside on mobile.
  useEffect(() => {
    if (!sidebarOpen) return;

    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !target || sidebar.current.contains(target as Node)) return;
      if (window.innerWidth < 1024) { // Only on mobile where it's an overlay
        setSidebarOpen(false);
      }
    };

    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (keyCode === 27 && window.innerWidth < 1024) { // ESC key on mobile
        setSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [sidebarOpen, setSidebarOpen]);
  
  const visibleNavLinks = allNavLinks.filter(link => {
      // Add an exception for the 'legal-content' link to make it visible to all logged-in users,
      // bypassing the standard permission check. This ensures this informational page is always accessible.
      if (link.permissionKey === 'legal-content') {
        return !!profile; // Show if any user is logged in
      }

      if (!profile) return false;
      if (profile.role === 'super_admin') return true; // Super admin sees everything
      if (!permissionsLoaded) return false; // Wait until permissions are loaded to prevent flicker

      // Use database permissions if available, otherwise fallback to default roles
      if (permissions) {
          return permissions.includes(link.permissionKey);
      } else {
          return link.defaultRoles.includes(profile.role);
      }
  });
  
  // Separate the legal link from the main navigation links.
  const mainNavLinks = visibleNavLinks.filter(link => link.permissionKey !== 'legal-content');
  const legalNavLink = visibleNavLinks.find(link => link.permissionKey === 'legal-content');


  return (
      <div
        ref={sidebar}
        className={`flex flex-col z-40 left-0 top-0 h-screen bg-slate-900 shrink-0 transition-all duration-300 ease-in-out
          absolute lg:static overflow-y-auto no-scrollbar
          ${ sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:w-0 lg:translate-x-0' }
        `}
      >
        <div className={`px-4 mb-2 transition-opacity duration-200 ${!sidebarOpen && 'lg:opacity-0 lg:invisible'}`}>
            <NavLink to="/" className="flex items-center space-x-2 h-16">
                <CubeIcon className="w-8 h-8 text-white" />
                <span className="text-2xl font-bold text-white">ZOGU</span>
            </NavLink>
        </div>
        
        {/* Main Links Area - flex-grow pushes the legal link down */}
        <div className={`flex-grow space-y-2 px-4 transition-opacity duration-200 ${!sidebarOpen && 'lg:opacity-0 lg:invisible'}`}>
          {mainNavLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              state={{ __tabLabelKey: link.label }}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                }`
              }
              end={link.to === '/'}
            >
              <link.icon className="w-5 h-5 mr-3" />
              <span>{t(link.label as any)}</span>
            </NavLink>
          ))}
        </div>

        {/* Legal Link - Rendered at the bottom */}
        {legalNavLink && (
          <div className={`px-4 pb-4 transition-opacity duration-200 ${!sidebarOpen && 'lg:opacity-0 lg:invisible'}`}>
             <NavLink
              key={legalNavLink.to}
              to={legalNavLink.to}
              state={{ __tabLabelKey: legalNavLink.label }}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-primary-500'
                    : 'text-gray-400 hover:text-white'
                }`
              }
              title={t(legalNavLink.label as any)}
            >
              <legalNavLink.icon className="w-5 h-5" />
            </NavLink>
          </div>
        )}
      </div>
  );
};

export default Sidebar;