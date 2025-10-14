// --- SettingsPage.tsx ---
// This comment is for context and should not be included in the final file.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { UserRole, Organization, RolePermissions, DatevSettings, HelpContent, Customer } from '../types';
import { defaultPermissions, EXPENSE_CATEGORIES } from '../constants';
import { invalidateHelpCache } from '../services/helpContentService';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { exportCustomerDataAsCsv } from '../lib/export';

const ALL_MODULES = [
    { id: 'dashboard', label: 'dashboard' }, { id: 'dispatcher', label: 'dispatcher' },
    { id: 'customers', label: 'customers' }, { id: 'appointments', label: 'appointments' },
    { id: 'visits', label: 'visits' }, { id: 'quotes', label: 'quotes' },
    { id: 'invoices', label: 'invoices' }, { id: 'inventory', label: 'inventory' },
    { id: 'expenses', label: 'expenses' }, { id: 'tasks', label: 'tasks' },
    { id: 'reports', label: 'reports' }, { id: 'team', label: 'team' },
    { id: 'settings', label: 'settings' }, { id: 'profile', label: 'profile' },
    { id: 'migration-center', label: 'migrationCenter' },
    { id: 'audit-log', label: 'auditLog' },
    { id: 'text-blocks', label: 'textBlocks' },
];

const DataPrivacyCenter: React.FC = () => {
    const { profile } = useAuth();
    const { t } = useLanguage();

    const [loadingOrgs, setLoadingOrgs] = useState(false);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);

    const [selectedOrgId, setSelectedOrgId] = useState<string>('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [customerSearch, setCustomerSearch] = useState('');
    
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

    useEffect(() => {
        if (profile?.role === 'super_admin') {
            setLoadingOrgs(true);
            supabase.from('organizations').select('id, name').order('name').then(({ data, error }) => {
                if (data) setOrganizations(data);
                if (error) console.error("Error fetching organizations:", error);
                setLoadingOrgs(false);
            });
        }
    }, [profile]);

    useEffect(() => {
        const orgIdToFetch = profile?.role === 'admin' ? profile.org_id : selectedOrgId;
        if (!orgIdToFetch) {
            setCustomers([]);
            setSelectedCustomerId('');
            return;
        }

        setLoadingCustomers(true);
        supabase.from('customers').select('id, name, customer_number').eq('org_id', orgIdToFetch).order('name').then(({ data, error }) => {
            if (data) setCustomers(data);
            if (error) console.error("Error fetching customers:", error);
            setLoadingCustomers(false);
            setSelectedCustomerId('');
        });
    }, [profile, selectedOrgId]);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch) {
            return customers;
        }
        const searchTerm = customerSearch.toLowerCase();
        return customers.filter(c => 
            (c.name || '').toLowerCase().includes(searchTerm) || 
            (c.customer_number || '').toLowerCase().includes(searchTerm)
        );
    }, [customers, customerSearch]);

    const selectedCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return customers.find(c => c.id.toString() === selectedCustomerId) || null;
    }, [selectedCustomerId, customers]);

    const handleExportJson = async () => {
        if (!selectedCustomer) return;
        setIsProcessing(true);
        try {
            const { data, error } = await supabase.rpc('export_customer_data', { p_customer_id: selectedCustomer.id });
            if (error) throw error;
            
            const jsonData = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `DSGVO_Export_${selectedCustomer.name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            alert(t('dataExportedSuccessfully'));
        } catch (error: any) {
            alert(`Export failed: ${error.message}`);
        }
        setIsProcessing(false);
    };

    const handleExportExcel = async () => {
        if (!selectedCustomer) return;
        setIsProcessing(true);
        try {
            const { data, error } = await supabase.rpc('export_customer_data', { p_customer_id: selectedCustomer.id });
            if (error) throw error;
            
            exportCustomerDataAsCsv(data, selectedCustomer.name);
            
            alert(t('dataExportedSuccessfully'));
        } catch (error: any) {
            alert(`Export failed: ${error.message}`);
        }
        setIsProcessing(false);
    };

    const handleDelete = async () => {
        if (!selectedCustomer) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase.rpc('delete_customer_data', { p_customer_id: selectedCustomer.id });
            if (error) throw error;

            alert(t('customerDeletedSuccessfully'));
            setShowDeleteConfirm(false);
            setDeleteConfirmInput('');
            
            // Refetch customers
            const orgIdToFetch = profile?.role === 'admin' ? profile.org_id : selectedOrgId;
            if (orgIdToFetch) {
                const { data } = await supabase.from('customers').select('id, name, customer_number').eq('org_id', orgIdToFetch).order('name');
                setCustomers(data || []);
                setSelectedCustomerId('');
            }
        } catch (error: any) {
            alert(`Deletion failed: ${error.message}`);
        }
        setIsProcessing(false);
    };

    const isDeleteConfirmed = deleteConfirmInput === selectedCustomer?.customer_number;

    return (
        <div className="max-w-3xl space-y-6">
            <div className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{t('dataPrivacy')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">
                    Export or permanently delete all data associated with a specific customer to comply with data privacy regulations (DSGVO/GDPR).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profile?.role === 'super_admin' && (
                        <div>
                            <label className="block text-sm font-medium">{t('organization')}</label>
                            <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} disabled={loadingOrgs} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                <option value="">-- {t('selectOrg')} --</option>
                                {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium">Search Customer</label>
                            <input
                                type="text"
                                value={customerSearch}
                                onChange={e => setCustomerSearch(e.target.value)}
                                placeholder={t('searchByNameOrId')}
                                disabled={loadingCustomers || (profile?.role !== 'admin' && !selectedOrgId)}
                                className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">{t('customer')}</label>
                            <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} disabled={loadingCustomers || filteredCustomers.length === 0} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                <option value="">-- {t('selectCustomer')} --</option>
                                {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-4 mt-6">
                    <button onClick={handleExportJson} disabled={!selectedCustomer || isProcessing} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">{isProcessing ? t('processing') : t('exportDataJson')}</button>
                    <button onClick={handleExportExcel} disabled={!selectedCustomer || isProcessing} className="px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">{isProcessing ? t('processing') : t('exportAsExcel')}</button>
                    <button onClick={() => setShowDeleteConfirm(true)} disabled={!selectedCustomer || isProcessing} className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400">{isProcessing ? t('processing') : t('deleteData')}</button>
                </div>
            </div>

            {showDeleteConfirm && selectedCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
                        <h2 className="text-xl font-bold text-red-600">{t('confirmCustomerDeletionTitle')}</h2>
                        <p className="my-4" dangerouslySetInnerHTML={{ __html: t('confirmCustomerDeletionMessage').replace('{customerNumber}', `<strong>${selectedCustomer.customer_number}</strong>`) }}></p>
                        <div>
                            <label className="block text-sm font-medium">{t('customerNumber')}</label>
                            <input type="text" value={deleteConfirmInput} onChange={e => setDeleteConfirmInput(e.target.value)} placeholder={selectedCustomer.customer_number} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                        </div>
                        <div className="flex justify-end space-x-2 mt-6">
                            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 bg-gray-200 rounded">{t('cancel')}</button>
                            <button onClick={handleDelete} disabled={!isDeleteConfirmed || isProcessing} className="px-4 py-2 text-white bg-red-600 rounded disabled:bg-red-300">{isProcessing ? t('deleting') : t('delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SettingsPage: React.FC = () => {
    const { profile, permissions: currentUserPermissions, refetchPermissions } = useAuth();
    const { t } = useLanguage();

    const [activeTab, setActiveTab] = useState<'permissions' | 'integrations' | 'premium' | 'datev' | 'help' | 'data-privacy'>('permissions');
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
    const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const configurableRoles = useMemo<UserRole[]>(() => {
        if (profile?.role === 'super_admin') return ['admin', 'key_user', 'field_service_employee'];
        if (profile?.role === 'admin') return ['key_user', 'field_service_employee'];
        return [];
    }, [profile?.role]);

    const [permissions, setPermissions] = useState<Record<UserRole, string[]>>({
        admin: [], key_user: [], field_service_employee: [], super_admin: [],
    });

    const [isPaymentGatewayEnabled, setIsPaymentGatewayEnabled] = useState(false);
    const [isDocumentStorageEnabled, setIsDocumentStorageEnabled] = useState(false);
    const [isDatevExportEnabled, setIsDatevExportEnabled] = useState(false);
    const [isEmailSendingEnabled, setIsEmailSendingEnabled] = useState(false);
    const [isVisitReminderEnabled, setIsVisitReminderEnabled] = useState(false);
    const [isTextBlocksEnabled, setIsTextBlocksEnabled] = useState(false);
    const [stripeAccountId, setStripeAccountId] = useState<string | undefined>(undefined);
    const [datevSettings, setDatevSettings] = useState<Partial<DatevSettings>>({});
    
    const [helpContents, setHelpContents] = useState<HelpContent[]>([]);
    const [isTestingStripe, setIsTestingStripe] = useState(false);
    const [stripeTestResult, setStripeTestResult] = useState<string | null>(null);


    useEffect(() => {
        if (profile?.role === 'super_admin') {
            setIsLoading(true);
            supabase.from('organizations').select('*').order('name').then(({ data }) => {
                setOrganizations(data || []);
                setIsLoading(false);
            });
        }
    }, [profile]);
    
    useEffect(() => {
        if (profile?.role === 'super_admin' && selectedOrgId) {
            setSelectedOrg(organizations.find(o => o.id === selectedOrgId) || null);
        }
    }, [selectedOrgId, organizations, profile?.role]);

    useEffect(() => {
        const fetchData = async () => {
            const targetOrgId = profile?.role === 'admin' ? profile.org_id : selectedOrgId;

            if (!targetOrgId && profile?.role !== 'super_admin') {
                setIsLoading(true);
                return;
            }
            if(profile?.role === 'super_admin') {
                supabase.from('help_content').select('*').order('page_key').then(({ data }) => setHelpContents(data || []));
            }

            if (!targetOrgId) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const [perms, orgDetails] = await Promise.all([
                    supabase.from('role_permissions').select('role, permissions').eq('org_id', targetOrgId).in('role', configurableRoles),
                    supabase.from('organizations').select('is_document_storage_enabled, is_payment_gateway_enabled, stripe_account_id, is_datev_export_enabled, datev_settings, is_email_sending_enabled, is_visit_reminder_enabled, is_text_blocks_enabled').eq('id', targetOrgId).single(),
                ]);
                
                const dbPermissionsMap = new Map<UserRole, string[]>();
                if (perms.data) {
                    for (const item of perms.data) {
                        const role = item.role as UserRole;
                        const modules = item.permissions?.modules;
                        if (Array.isArray(modules)) {
                            dbPermissionsMap.set(role, modules);
                        } else {
                            dbPermissionsMap.set(role, []);
                        }
                    }
                }
                const newPermissionsState: Partial<Record<UserRole, string[]>> = {};
                for (const role of configurableRoles) {
                    newPermissionsState[role] = dbPermissionsMap.get(role) || [...defaultPermissions[role]];
                }
                setPermissions(prevState => ({ ...prevState, ...newPermissionsState }));

                if (orgDetails.data) {
                    setIsDocumentStorageEnabled(orgDetails.data.is_document_storage_enabled || false);
                    setIsPaymentGatewayEnabled(orgDetails.data.is_payment_gateway_enabled || false);
                    setIsDatevExportEnabled(orgDetails.data.is_datev_export_enabled || false);
                    setIsEmailSendingEnabled(orgDetails.data.is_email_sending_enabled || false);
                    setIsVisitReminderEnabled(orgDetails.data.is_visit_reminder_enabled || false);
                    setIsTextBlocksEnabled(orgDetails.data.is_text_blocks_enabled || false);
                    setStripeAccountId(orgDetails.data.stripe_account_id);
                    setDatevSettings(orgDetails.data.datev_settings || {});
                }

            } catch (error) {
                console.error("Failed to fetch settings:", error);
                alert("Failed to load settings. Please try again.");
            } finally {
                setIsLoading(false);
            }
        };
        
        if (profile) fetchData();
    }, [profile, selectedOrgId, configurableRoles]);
    
    const handlePermissionChange = (role: UserRole, moduleId: string, isChecked: boolean) => {
        setPermissions(prev => ({
            ...prev,
            [role]: isChecked ? [...(prev[role] || []), moduleId] : (prev[role] || []).filter(m => m !== moduleId),
        }));
    };
    
    const handleDatevSettingChange = (field: keyof DatevSettings, value: string) => {
        setDatevSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleDatevExpenseMappingChange = (category: string, value: string) => {
        setDatevSettings(prev => ({
            ...prev,
            expense_mappings: {
                ...(prev.expense_mappings || {}),
                [category]: value
            }
        }));
    };

    const handleHelpContentChange = (pageKey: string, lang: 'de' | 'al', content: string) => {
        setHelpContents(prev => prev.map(item => 
            item.page_key === pageKey 
                ? { ...item, [lang === 'de' ? 'content_de' : 'content_al']: content }
                : item
        ));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (activeTab === 'data-privacy') {
                setIsSaving(false);
                return; // Actions in this tab are self-contained
            }
            if (activeTab === 'help' && profile?.role === 'super_admin') {
                const { error: helpError } = await supabase.from('help_content').upsert(helpContents);
                if (helpError) throw helpError;
                invalidateHelpCache();
            } else {
                const targetOrgId = profile?.role === 'admin' ? profile.org_id : selectedOrgId;
                if (!targetOrgId) {
                    setIsSaving(false);
                    return;
                }

                if (profile?.role === 'super_admin' && selectedOrg && selectedOrg.name.trim()) {
                    const originalOrg = organizations.find(o => o.id === selectedOrg.id);
                    if (originalOrg && (originalOrg.name !== selectedOrg.name.trim() || originalOrg.max_users !== selectedOrg.max_users)) {
                        const { error } = await supabase.from('organizations').update({ name: selectedOrg.name.trim(), max_users: selectedOrg.max_users }).eq('id', selectedOrg.id);
                        if (error) throw error;
                        const { data: updatedOrgs } = await supabase.from('organizations').select('*').order('name');
                        setOrganizations(updatedOrgs || []);
                    }
                }

                const permsToSave = configurableRoles.map(role => ({
                    org_id: targetOrgId,
                    role: role,
                    permissions: { modules: permissions[role] || [] }
                }));
                const { error: permsError } = await supabase.from('role_permissions').upsert(permsToSave, { onConflict: 'org_id, role' });
                if (permsError) throw permsError;
                
                let orgUpdateData: Partial<Organization> = {};
                if (profile?.role === 'super_admin') {
                    orgUpdateData.is_document_storage_enabled = isDocumentStorageEnabled;
                    orgUpdateData.is_payment_gateway_enabled = isPaymentGatewayEnabled;
                    orgUpdateData.is_datev_export_enabled = isDatevExportEnabled;
                    orgUpdateData.is_email_sending_enabled = isEmailSendingEnabled;
                    orgUpdateData.is_visit_reminder_enabled = isVisitReminderEnabled;
                    orgUpdateData.is_text_blocks_enabled = isTextBlocksEnabled;
                }
                if (profile?.role === 'admin') {
                    orgUpdateData.datev_settings = datevSettings;
                }
                if (Object.keys(orgUpdateData).length > 0) {
                     const { error: orgUpdateError } = await supabase.from('organizations').update(orgUpdateData).eq('id', targetOrgId);
                     if (orgUpdateError) throw orgUpdateError;
                }
                
                await refetchPermissions(); 
            }

            alert('Settings saved successfully!');

        } catch (error: any) {
            console.error("Error saving settings:", error);
            alert(`Error saving settings:\n${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // ... (rest of the component functions: handleStripeConnect, handleStripeTest, renderers) ...

    const renderPermissionsContent = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {configurableRoles.map(role => (
                <div key={role} className="border rounded-lg p-4 dark:border-gray-700">
                    <h3 className="font-bold text-lg capitalize mb-4 text-gray-800 dark:text-gray-200">{t(role as any) || role}</h3>
                    <div className="space-y-3">
                        {modulesForRole.map(module => (
                            <div key={module.id} className="flex items-center justify-between">
                                <label htmlFor={`${role}-${module.id}`} className="text-gray-700 dark:text-gray-300 capitalize cursor-pointer">{t(module.label as any)}</label>
                                <input id={`${role}-${module.id}`} type="checkbox" checked={permissions[role]?.includes(module.id) || false} onChange={(e) => handlePermissionChange(role, module.id, e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"/>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
    
    const renderIntegrationsContent = () => (
        <div className="max-w-2xl">
            <div className="p-4 border rounded-lg dark:border-gray-700">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{t('stripePaymentGateway')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">{t('stripeDescription')}</p>
                {isPaymentGatewayEnabled ? (
                    stripeAccountId ? (
                        <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-md">
                            <p className="font-semibold text-green-800 dark:text-green-200">{t('stripeConnected')}</p>
                            <p className="text-xs text-green-700 dark:text-green-300 mt-1">{t('stripeAccountId')}: {stripeAccountId}</p>
                        </div>
                    ) : (
                        <button onClick={() => {}} disabled={isSaving} className="px-4 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
                           {isSaving ? t('connecting') : t('connectWithStripe')}
                        </button>
                    )
                ) : (
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">{t('premiumPaymentGatewayDesc')}</p>
                )}
            </div>
        </div>
    );
    
    const renderDatevSettings = () => (
        <div className="max-w-3xl space-y-6">
             <div className="p-4 border rounded-lg dark:border-gray-700">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{t('datevAccountSetup')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">{t('datevAccountDescription')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium">{t('debtorAccount')}</label>
                        <input type="text" value={datevSettings.debtor_account || ''} onChange={e => handleDatevSettingChange('debtor_account', e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium">{t('creditorAccount')}</label>
                        <input type="text" value={datevSettings.creditor_account || ''} onChange={e => handleDatevSettingChange('creditor_account', e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    </div>
                </div>
            </div>
             <div className="p-4 border rounded-lg dark:border-gray-700">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{t('revenueAccountMapping')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                     <div><label className="block text-sm font-medium">{t('revenue19')}</label><input type="text" value={datevSettings.revenue_19 || ''} onChange={e => handleDatevSettingChange('revenue_19', e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/></div>
                     <div><label className="block text-sm font-medium">{t('revenue7')}</label><input type="text" value={datevSettings.revenue_7 || ''} onChange={e => handleDatevSettingChange('revenue_7', e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/></div>
                     <div><label className="block text-sm font-medium">{t('revenue0')}</label><input type="text" value={datevSettings.revenue_0 || ''} onChange={e => handleDatevSettingChange('revenue_0', e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/></div>
                </div>
             </div>
             <div className="p-4 border rounded-lg dark:border-gray-700">
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{t('expenseAccountMapping')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">{t('expenseAccountDescription')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {EXPENSE_CATEGORIES.map(cat => (
                        <div key={cat.id}>
                            <label className="block text-sm font-medium capitalize">{t(cat.label as any)}</label>
                            <input type="text" value={datevSettings.expense_mappings?.[cat.id] || ''} onChange={e => handleDatevExpenseMappingChange(cat.id, e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                        </div>
                    ))}
                </div>
             </div>
        </div>
    );

    const renderPremiumFeatures = () => (
        <div className="space-y-6 max-w-2xl">
            {[
                { key: 'isVisitReminderEnabled', state: isVisitReminderEnabled, setState: setIsVisitReminderEnabled, title: 'premiumVisitReminders', desc: 'premiumVisitRemindersDesc' },
                { key: 'isEmailSendingEnabled', state: isEmailSendingEnabled, setState: setIsEmailSendingEnabled, title: 'premiumEmailSending', desc: 'premiumEmailSendingDesc' },
                { key: 'isDatevExportEnabled', state: isDatevExportEnabled, setState: setIsDatevExportEnabled, title: 'premiumDatevExport', desc: 'premiumDatevExportDesc' },
                { key: 'isPaymentGatewayEnabled', state: isPaymentGatewayEnabled, setState: setIsPaymentGatewayEnabled, title: 'premiumPaymentGateway', desc: 'premiumPaymentGatewayDesc' },
                { key: 'isDocumentStorageEnabled', state: isDocumentStorageEnabled, setState: setIsDocumentStorageEnabled, title: 'premiumDocumentStorage', desc: 'premiumDocumentStorageDesc' },
                { key: 'isTextBlocksEnabled', state: isTextBlocksEnabled, setState: setIsTextBlocksEnabled, title: 'premiumTextBlocks', desc: 'premiumTextBlocksDesc' },
            ].map(feature => (
                 <div key={feature.key} className="p-4 border rounded-lg dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{t(feature.title as any)}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{t(feature.desc as any)}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={feature.state} onChange={(e) => feature.setState(e.target.checked)} className="sr-only peer"/>
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                </div>
            ))}
        </div>
    );
    
    const renderHelpContentEditor = () => (
        <div className="space-y-6">
            {helpContents.map(item => (
                <div key={item.page_key} className="p-4 border rounded-lg dark:border-gray-700">
                    <h3 className="font-bold text-lg capitalize mb-4">{item.page_key.replace(/_/g, ' ')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Deutsch (DE)</label>
                            <textarea
                                value={item.content_de || ''}
                                onChange={e => handleHelpContentChange(item.page_key, 'de', e.target.value)}
                                rows={10}
                                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Shqip (AL)</label>
                            <textarea
                                value={item.content_al || ''}
                                onChange={e => handleHelpContentChange(item.page_key, 'al', e.target.value)}
                                rows={10}
                                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );


    const modulesForRole = useMemo(() => {
        if (profile?.role === 'admin') {
            return ALL_MODULES.filter(m => defaultPermissions.admin.includes(m.id));
        }
        return ALL_MODULES;
    }, [profile?.role]);
    
    const renderContent = () => {
        if (profile?.role === 'super_admin' && !selectedOrgId && !['help', 'data-privacy'].includes(activeTab)) {
            return <div className="text-center text-gray-500 py-8">{t('selectOrgToBegin')}</div>;
        }
        if (isLoading && !['help', 'data-privacy'].includes(activeTab)) {
            return <div className="flex justify-center items-center h-64"><div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-primary-600"></div></div>;
        }
        switch (activeTab) {
            case 'permissions': return renderPermissionsContent();
            case 'integrations': return renderIntegrationsContent();
            case 'premium': return renderPremiumFeatures();
            case 'datev': return renderDatevSettings();
            case 'help': return renderHelpContentEditor();
            case 'data-privacy': return <DataPrivacyCenter />;
            default: return null;
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('settings')}</h1>
                {activeTab !== 'data-privacy' && (
                    <button onClick={handleSave} disabled={isSaving || (isLoading && activeTab !== 'help') || (profile?.role === 'super_admin' && !selectedOrgId && activeTab !== 'help')} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed">
                        {isSaving ? t('saving') : t('save')}
                    </button>
                )}
            </div>
            
            {profile?.role === 'super_admin' && activeTab !== 'help' && activeTab !== 'data-privacy' && (
                <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="org-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('selectOrg')}</label>
                            <select id="org-select" value={selectedOrgId || ''} onChange={(e) => setSelectedOrgId(e.target.value || null)} disabled={isLoading} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600">
                                <option value="">-- {t('selectOrgToBegin')} --</option>
                                {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Organization Name</label>
                            <input
                                id="org-name"
                                type="text"
                                value={selectedOrg?.name || ''}
                                onChange={(e) => setSelectedOrg(prev => prev ? { ...prev, name: e.target.value } : null)}
                                disabled={!selectedOrg || isLoading}
                                className="mt-1 block w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50"
                            />
                        </div>
                        <div>
                            <label htmlFor="org-max-users" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Max Users</label>
                            <input
                                id="org-max-users"
                                type="number"
                                value={selectedOrg?.max_users ?? ''}
                                onChange={(e) => setSelectedOrg(prev => prev ? { ...prev, max_users: parseInt(e.target.value, 10) || 0 } : null)}
                                disabled={!selectedOrg || isLoading}
                                className="mt-1 block w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50"
                            />
                        </div>
                    </div>
                </div>
            )}
            
            <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 min-h-[20rem]">
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button onClick={() => setActiveTab('permissions')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'permissions' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('access_control')}</button>
                        {profile?.role === 'admin' && (
                           <>
                           <button onClick={() => setActiveTab('integrations')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'integrations' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('integrations')}</button>
                           {isDatevExportEnabled && <button onClick={() => setActiveTab('datev')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'datev' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>DATEV</button>}
                           </>
                        )}
                        {profile?.role === 'super_admin' && (
                            <>
                                <button onClick={() => setActiveTab('premium')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'premium' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('premiumFeatures')}</button>
                                <button onClick={() => setActiveTab('help')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'help' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t('helpContent')}</button>
                            </>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
                            <button onClick={() => setActiveTab('data-privacy')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeTab === 'data-privacy' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                <ShieldCheckIcon className="w-5 h-5"/>
                                {t('dataPrivacy')}
                            </button>
                        )}
                    </nav>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

export default SettingsPage;