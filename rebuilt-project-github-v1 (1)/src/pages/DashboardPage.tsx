import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import FieldServiceDashboard from '../components/dashboard/FieldServiceDashboard';

const DashboardPage: React.FC = () => {
  const { profile } = useAuth();
  const { refreshKey } = useRefresh();

  if (!profile) {
    return <div className="text-center p-8 text-gray-500">Loading...</div>;
  }
  
  if (profile.role === 'field_service_employee') {
    return <FieldServiceDashboard refreshKey={refreshKey} />;
  }

  return <AdminDashboard refreshKey={refreshKey} />;
};

export default DashboardPage;