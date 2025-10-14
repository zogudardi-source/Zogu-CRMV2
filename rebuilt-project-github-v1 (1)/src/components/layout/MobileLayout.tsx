import React from 'react';
import Header from './Header';
import BottomNavBar from './BottomNavBar';
import Chatbot from '../Chatbot';
import TraceMonitor from '../TraceMonitor';
import ToastContainer from '../notifications/ToastContainer';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext';
import { useTabs } from '../../contexts/TabContext';
import TabBar from './TabBar';

const MobileLayout: React.FC = () => {
  const { user, profile } = useAuth();
  const { tabs, activeTabKey, cachedPages } = useTabs();
  const { openTaskModal, openExpenseModal, openAppointmentModal } = useModal();

  return (
    <>
      {/* 
        This is the new CSS Grid layout. It's the most robust way to handle
        a "sticky header/footer" layout.
        - grid-rows-[auto_1fr_auto]: Defines three rows. The first and last
          take up only the space they need, and the middle one (1fr) takes
          up all the rest of the available space.
        - h-screen: Ensures the grid container takes up the full viewport height.
        - overflow-hidden: Prevents the whole page from scrolling.
      */}
      <div className="grid grid-rows-[auto_1fr_auto] h-screen bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <ToastContainer />
        
        {/* Header Area (First Row) */}
        <div className="shrink-0">
          <Header sidebarOpen={false} setSidebarOpen={() => {}} />
          <TabBar />
        </div>
        
        {/* Main Content (Second Row - The Scrollable Area) */}
        <main className="overflow-y-auto p-4 sm:p-6">
          {tabs.map(tab => (
            <div
              key={tab.key}
              style={{ display: activeTabKey === tab.key ? 'block' : 'none' }}
              className="w-full h-full"
            >
              {cachedPages[tab.key]}
            </div>
          ))}
        </main>

        {/* Bottom Navigation (Third Row) */}
        <BottomNavBar 
          onOpenTaskModal={openTaskModal}
          onOpenExpenseModal={openExpenseModal}
          onOpenAppointmentModal={openAppointmentModal}
        />

        {/* These components are fixed overlays and are not part of the grid */}
        {profile?.role === 'super_admin' && <Chatbot />}
        {user?.email === 'dardan.zogu@hotmail.com' && <TraceMonitor />}
      </div>
    </>
  );
};

export default MobileLayout;
