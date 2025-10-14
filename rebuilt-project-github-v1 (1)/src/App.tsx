import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, Outlet, useOutlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { TraceProvider } from './contexts/TraceContext';
import { RefreshProvider, useRefresh } from './contexts/RefreshContext';
import { TabProvider, useTabs } from './contexts/TabContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { ModalContext, ModalContextType } from './contexts/ModalContext';
import { isSupabaseConfigured, supabase } from './services/supabase';
import ConfigurationNotice from './components/ConfigurationNotice';
import { generateNextNumber } from './lib/numberGenerator';
import { Customer, Product, Task, Expense, Appointment } from './types';
import { defaultPermissions } from './constants';


import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import InvoicesPage from './pages/InvoicesPage';
import ExpensesPage from './pages/ExpensesPage';
import CustomersPage from './pages/CustomersPage';
import ProfilePage from './pages/ProfilePage';
import MainLayout from './components/layout/MainLayout';
import MobileLayout from './components/layout/MobileLayout';
import InvoiceEditor from './pages/InvoiceEditor';
import ReportsPage from './pages/ReportsPage';
import TasksPage from './pages/TasksPage'; 
import QuotesPage from './pages/QuotesPage';
import QuoteEditor from './pages/QuoteEditor';
import AppointmentsPage from './pages/AppointmentsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import TeamPage from './pages/TeamPage';
import VisitsPage from './pages/VisitsPage';
import VisitEditor from './pages/VisitEditor';
import CustomerDetailPage from './pages/CustomerDetailPage';
import DispatcherPage from './pages/DispatcherPage';
import SettingsPage from './pages/SettingsPage';
import MigrationCenterPage from './pages/MigrationCenterPage';
import AuditLogPage from './pages/AuditLogPage';
import TextBlocksPage from './pages/TextBlocksPage';
import LegalContentPage from './pages/LegalContentPage';

// Modal Components
import ProductModal from './components/modals/ProductModal';
import TaskModal from './components/modals/TaskModal';
import ExpenseModal from './components/modals/ExpenseModal';
import AppointmentModal from './components/modals/AppointmentModal';
import CustomerModal from './components/modals/CustomerModal';


// This guard checks for a valid session. If not found, it redirects to the auth page.
const AuthGuard: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary-600"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return children;
};

// This guard checks if the user has the required permission for a specific module.
const PermissionGuard: React.FC<{ children: React.ReactElement; permission: string }> = ({ children, permission }) => {
    const { profile, permissions, permissionsLoaded } = useAuth();
    
    if (!permissionsLoaded) {
      return null; // Or a loading spinner, but null prevents layout flicker
    }

    if (profile && profile.role !== 'super_admin') {
        const userPermissions = permissions 
          ? permissions 
          : (defaultPermissions[profile.role] || []);

        if (!userPermissions.includes(permission)) {
            return <Navigate to="/" replace />;
        }
    }
    return children;
};

// This component acts as the persistent layout shell for all protected routes.
const ProtectedRoutes: React.FC = () => {
    const { profile } = useAuth();
    const { cacheCurrentPage } = useTabs();
    const outlet = useOutlet();
    const location = useLocation();
    
    // By cloning the outlet and giving it a unique key based on the pathname,
    // we force React to create a NEW instance of the page component (e.g., InvoiceEditor)
    // every time the URL changes. This is a crucial step to ensure each tab
    // has its own isolated component instance and state.
    const outletWithKey = outlet ? React.cloneElement(outlet, { key: location.pathname }) : null;

    // This effect is the bridge between the router and the tab context. It informs
    // the context about the currently rendered page component, allowing the context
    // to implement its "cache-if-not-exists" strategy.
    useEffect(() => {
        if (outletWithKey) {
            cacheCurrentPage(location.pathname, outletWithKey);
        }
    }, [outletWithKey, location.pathname, cacheCurrentPage]);

    const Layout = profile?.role === 'field_service_employee' ? MobileLayout : MainLayout;
    
    // The Layout component has been refactored to not need the outlet prop.
    // It will get the cached pages directly from the TabContext.
    return <Layout />;
};


const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes are now nested under a single parent route */}
      <Route 
        element={
          <AuthGuard>
            <ProtectedRoutes />
          </AuthGuard>
        }
      >
        <Route path="/" element={<PermissionGuard permission="dashboard"><DashboardPage /></PermissionGuard>} />
        <Route path="/inventory" element={<PermissionGuard permission="inventory"><InventoryPage /></PermissionGuard>} />
        <Route path="/invoices" element={<PermissionGuard permission="invoices"><InvoicesPage /></PermissionGuard>} />
        <Route path="/invoices/new" element={<PermissionGuard permission="invoices"><InvoiceEditor /></PermissionGuard>} />
        <Route path="/invoices/edit/:id" element={<PermissionGuard permission="invoices"><InvoiceEditor /></PermissionGuard>} />
        <Route path="/quotes" element={<PermissionGuard permission="quotes"><QuotesPage /></PermissionGuard>} />
        <Route path="/quotes/new" element={<PermissionGuard permission="quotes"><QuoteEditor /></PermissionGuard>} />
        <Route path="/quotes/edit/:id" element={<PermissionGuard permission="quotes"><QuoteEditor /></PermissionGuard>} />
        <Route path="/customers" element={<PermissionGuard permission="customers"><CustomersPage /></PermissionGuard>} />
        <Route path="/customers/:id" element={<PermissionGuard permission="customers"><CustomerDetailPage /></PermissionGuard>} />
        <Route path="/expenses" element={<PermissionGuard permission="expenses"><ExpensesPage /></PermissionGuard>} />
        <Route path="/reports" element={<PermissionGuard permission="reports"><ReportsPage /></PermissionGuard>} />
        <Route path="/audit-log" element={<PermissionGuard permission="audit-log"><AuditLogPage /></PermissionGuard>} />
        <Route path="/tasks" element={<PermissionGuard permission="tasks"><TasksPage /></PermissionGuard>} />
        <Route path="/dispatcher" element={<PermissionGuard permission="dispatcher"><DispatcherPage /></PermissionGuard>} />
        <Route path="/appointments" element={<PermissionGuard permission="appointments"><AppointmentsPage /></PermissionGuard>} />
        <Route path="/visits" element={<PermissionGuard permission="visits"><VisitsPage /></PermissionGuard>} />
        <Route path="/visits/new" element={<PermissionGuard permission="visits"><VisitEditor /></PermissionGuard>} />
        <Route path="/visits/edit/:id" element={<PermissionGuard permission="visits"><VisitEditor /></PermissionGuard>} />
        <Route path="/profile" element={<PermissionGuard permission="profile"><ProfilePage /></PermissionGuard>} />
        <Route path="/team" element={<PermissionGuard permission="team"><TeamPage /></PermissionGuard>} />
        <Route path="/settings" element={<PermissionGuard permission="settings"><SettingsPage /></PermissionGuard>} />
        <Route path="/migration-center" element={<PermissionGuard permission="migration-center"><MigrationCenterPage /></PermissionGuard>} />
        <Route path="/text-blocks" element={<PermissionGuard permission="text-blocks"><TextBlocksPage /></PermissionGuard>} />
        <Route path="/legal" element={<LegalContentPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, profile } = useAuth();
    const { triggerRefresh } = useRefresh();
    const { addToast } = useNotifications();

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [modalDefaultDate, setModalDefaultDate] = useState<Date | null>(null);

    // NEW state for editing
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);

    // State for data needed by modals
    const [customers, setCustomers] = useState<Customer[]>([]);

    useEffect(() => {
        // Fetch customers if either appointment or task modal is about to open.
        if ((isAppointmentModalOpen || isTaskModalOpen) && profile?.org_id) {
            supabase.from('customers').select('*').eq('org_id', profile.org_id)
                .then(({ data }) => {
                    setCustomers(data || []);
                });
        }
    }, [isAppointmentModalOpen, isTaskModalOpen, profile?.org_id]);

    const handleCloseModals = useCallback(() => {
        setIsProductModalOpen(false);
        setIsTaskModalOpen(false);
        setIsExpenseModalOpen(false);
        setIsAppointmentModalOpen(false);
        setIsCustomerModalOpen(false);
        // NEW: reset edit state
        setTaskToEdit(null);
        setAppointmentToEdit(null);
    }, []);

    const handleSaveSuccess = useCallback(() => {
        triggerRefresh();
        handleCloseModals();
    }, [triggerRefresh, handleCloseModals]);

    const createSaveHandler = useCallback(async (
        type: 'product' | 'task' | 'appointment' | 'customer',
        data: Partial<Product | Task | Appointment | Customer>
    ) => {
        if (!user || !profile?.org_id) {
            addToast({ type: 'error', title: 'Error', body: 'Cannot save: Not logged in.'});
            return;
        }

        try {
            const tableName = `${type}s`;
            const newNumber = await generateNextNumber(profile.org_id, type);
            
            let numberField = `${type}_number`;
            if (type === 'task') numberField = ''; // Tasks don't have sequential numbers
            
            const dataToInsert: any = { 
                ...data,
                org_id: profile.org_id,
                user_id: user.id,
            };
            if (numberField) {
                dataToInsert[numberField] = newNumber;
            }

            const { error } = await supabase.from(tableName).insert(dataToInsert);
            if (error) throw error;

            addToast({ type: 'success', title: 'Success', body: `${type.charAt(0).toUpperCase() + type.slice(1)} created.`});
            handleSaveSuccess();
        } catch (error: any) {
            addToast({ type: 'error', title: 'Error', body: error.message });
        }
    }, [user, profile, addToast, handleSaveSuccess]);

    const updateSaveHandler = useCallback(async (
        type: 'task' | 'appointment',
        data: Partial<Task | Appointment>
    ) => {
        if (!data.id) {
            addToast({ type: 'error', title: 'Error', body: 'Cannot update: Item ID is missing.' });
            return;
        }

        try {
            const tableName = `${type}s`;
            const { error } = await supabase.from(tableName).update(data).eq('id', data.id);
            if (error) throw error;

            addToast({ type: 'success', title: 'Success', body: `${type.charAt(0).toUpperCase() + type.slice(1)} updated.` });
            handleSaveSuccess();
        } catch (error: any) {
            addToast({ type: 'error', title: 'Error', body: error.message });
        }
    }, [addToast, handleSaveSuccess]);

    const value: ModalContextType = {
        openProductModal: useCallback(() => { setTaskToEdit(null); setAppointmentToEdit(null); setIsProductModalOpen(true); }, []),
        openTaskModal: useCallback((defaultDate?: Date) => { setTaskToEdit(null); setAppointmentToEdit(null); setModalDefaultDate(defaultDate || null); setIsTaskModalOpen(true); }, []),
        openExpenseModal: useCallback(() => { setTaskToEdit(null); setAppointmentToEdit(null); setIsExpenseModalOpen(true); }, []),
        openAppointmentModal: useCallback((defaultDate?: Date) => { setTaskToEdit(null); setAppointmentToEdit(null); setModalDefaultDate(defaultDate || new Date()); setIsAppointmentModalOpen(true); }, []),
        openCustomerModal: useCallback(() => { setTaskToEdit(null); setAppointmentToEdit(null); setIsCustomerModalOpen(true); }, []),
        openEditTaskModal: useCallback((task: Task) => {
            setTaskToEdit(task);
            setIsTaskModalOpen(true);
        }, []),
        openEditAppointmentModal: useCallback((appointment: Appointment) => {
            setAppointmentToEdit(appointment);
            setIsAppointmentModalOpen(true);
        }, [])
    };

    return (
        <ModalContext.Provider value={value}>
            {children}
            {isProductModalOpen && <ProductModal product={null} closeModal={handleCloseModals} onSave={(data) => createSaveHandler('product', data)} />}
            {isTaskModalOpen && 
                <TaskModal 
                    task={taskToEdit} 
                    onClose={handleCloseModals} 
                    onSave={taskToEdit ? (data) => updateSaveHandler('task', data) : (data) => createSaveHandler('task', data)} 
                    defaultDate={taskToEdit ? null : modalDefaultDate} 
                />
            }
            {isExpenseModalOpen && <ExpenseModal expense={null} closeModal={handleCloseModals} onSave={handleSaveSuccess} />}
            {isAppointmentModalOpen && 
                <AppointmentModal 
                    appointment={appointmentToEdit} 
                    customers={customers} 
                    onClose={handleCloseModals} 
                    onSave={appointmentToEdit ? (data) => updateSaveHandler('appointment', data) : (data) => createSaveHandler('appointment', data)} 
                    defaultDate={appointmentToEdit ? null : modalDefaultDate} 
                />
            }
            {isCustomerModalOpen && <CustomerModal customer={null} closeModal={handleCloseModals} onSave={(data) => createSaveHandler('customer', data as Customer)} />}
        </ModalContext.Provider>
    );
};


function App() {
  if (!isSupabaseConfigured) {
    return <ConfigurationNotice />;
  }

  return (
    <LanguageProvider>
      <HashRouter>
        <TraceProvider>
          <RefreshProvider>
            <AuthProvider>
              <NotificationProvider>
                <TabProvider>
                  <ModalProvider>
                    <AppRoutes />
                  </ModalProvider>
                </TabProvider>
              </NotificationProvider>
            </AuthProvider>
          </RefreshProvider>
        </TraceProvider>
      </HashRouter>
    </LanguageProvider>
  );
}

export default App;