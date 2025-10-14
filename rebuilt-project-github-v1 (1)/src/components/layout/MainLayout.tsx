import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Chatbot from '../Chatbot';
import TraceMonitor from '../TraceMonitor';
import TabBar from './TabBar';
import ToastContainer from '../notifications/ToastContainer';
import { useAuth } from '../../contexts/AuthContext';
import { useTabs } from '../../contexts/TabContext';

const MainLayout: React.FC = () => {
  const { user, profile } = useAuth();
  const { tabs, activeTabKey, cachedPages } = useTabs();

  // Sidebar state is local to the layout and is not part of the tab system.
  const [sidebarOpen, setSidebarOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  return (
    <div className="relative flex h-screen bg-gray-50 dark:bg-slate-900">
      <ToastContainer />
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      ></div>

      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <TabBar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-slate-900 p-4 sm:p-6 lg:p-8">
          {/* 
            The rendering logic is now simpler and more robust. It iterates through the tabs
            from the central context and renders the corresponding component from the
            central cache, managed entirely by TabProvider.
          */}
          {tabs.map(tab => (
            <div
              key={tab.key}
              style={{ display: activeTabKey === tab.key ? 'block' : 'none' }}
              className="h-full w-full"
            >
              {cachedPages[tab.key]}
            </div>
          ))}
        </main>
      </div>
      
      {profile?.role === 'super_admin' && <Chatbot />}
      {user?.email === 'dardan.zogu@hotmail.com' && <TraceMonitor />}
    </div>
  );
};

export default MainLayout;
