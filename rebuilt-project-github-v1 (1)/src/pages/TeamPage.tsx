import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { Profile, UserInvitation, UserRole, OrganizationInvitation, Organization } from '../types';
import { PlusIcon, TrashIcon, PencilIcon, KeyIcon } from '@heroicons/react/24/outline';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useNotifications } from '../contexts/NotificationContext';
import { formatEuropeanDate } from '../lib/formatting';

const ROLES: UserRole[] = ['admin', 'key_user', 'field_service_employee'];

type EnrichedProfile = Profile & {
    organization?: Organization;
    org_user_count?: number;
};


const EditUserModal: React.FC<{ userToEdit: Profile, onClose: () => void, onSave: () => void, t: (key: any) => string }> = ({ userToEdit, onClose, onSave, t }) => {
    const [formData, setFormData] = useState({ full_name: userToEdit.full_name, phone: userToEdit.phone || '', role: userToEdit.role });
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const { error } = await supabase.from('profiles').update(formData).eq('id', userToEdit.id);
        if (error) {
            alert("Failed to update user: " + error.message);
        } else {
            onSave();
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-4">Edit User: {userToEdit.email}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">{t('full_name')}</label>
                        <input name="full_name" value={formData.full_name} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">{t('phone')}</label>
                        <input name="phone" value={formData.phone} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">{t('role')}</label>
                        <select name="role" value={formData.role} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                            {ROLES.filter(r => r !== 'super_admin').map(role => <option key={role} value={role}>{t(role as any)}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end space-x-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">{t('cancel')}</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">
                        {isSaving ? t('saving') : t('save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SuperAdminOrgInvitations: React.FC<{ t: (key: any) => string, addToast: any, user: any }> = ({ t, addToast, user }) => {
    const [orgName, setOrgName] = useState('');
    const [maxUsers, setMaxUsers] = useState(5);
    const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchInvitations = useCallback(async () => {
        const { data, error } = await supabase.from('organization_invitations').select('*').order('created_at', { ascending: false });
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Could not fetch invitations: ' + error.message });
        } else {
            setInvitations(data || []);
        }
        setLoading(false);
    }, [addToast]);

    useEffect(() => {
        fetchInvitations();
    }, [fetchInvitations]);

    const handleGenerateInvite = async () => {
        if (!orgName || !user) return;
        const code = `ZOGU-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        const { error } = await supabase.from('organization_invitations').insert({
            code,
            org_name: orgName,
            max_users: maxUsers,
            created_by: user.id
        });
        if (error) {
            addToast({ type: 'error', title: 'Error', body: 'Failed to create invitation: ' + error.message });
        } else {
            addToast({ type: 'success', title: 'Success', body: `Invitation created: ${code}` });
            setOrgName('');
            setMaxUsers(5);
            fetchInvitations();
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h3 className="font-bold text-lg mb-4">Generate New Organization Invitation</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium">Organization Name</label>
                        <input value={orgName} onChange={e => setOrgName(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Max Users</label>
                        <input type="number" value={maxUsers} onChange={e => setMaxUsers(parseInt(e.target.value))} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                </div>
                <button onClick={handleGenerateInvite} className="mt-4 px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">Generate Code</button>
            </div>

            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <h3 className="font-bold text-lg mb-4">Generated Invitations</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead><tr className="text-left text-xs uppercase"><th className="py-2">Code</th><th className="py-2">Org Name</th><th className="py-2">Status</th><th className="py-2">Created At</th></tr></thead>
                        <tbody>
                            {invitations.map(inv => (
                                <tr key={inv.id} className="border-t dark:border-gray-700 text-sm">
                                    <td className="py-2 font-mono">{inv.code}</td>
                                    <td className="py-2">{inv.org_name}</td>
                                    <td className="py-2"><span className={`px-2 py-1 text-xs rounded-full ${inv.status === 'pending' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>{inv.status}</span></td>
                                    <td className="py-2">{formatEuropeanDate(inv.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const TeamPage: React.FC = () => {
    const { profile, user } = useAuth();
    const { t } = useLanguage();
    const { refreshKey } = useRefresh();
    const { addToast } = useNotifications();
    const [members, setMembers] = useState<Profile[]>([]);
    const [allUsers, setAllUsers] = useState<EnrichedProfile[]>([]);
    const [invitations, setInvitations] = useState<UserInvitation[]>([]);
    const [orgDetails, setOrgDetails] = useState<Organization | null>(null);
    const [loading, setLoading] = useState(true);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('field_service_employee');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [memberToRemove, setMemberToRemove] = useState<Profile | null>(null);
    const [inviteToCancel, setInviteToCancel] = useState<UserInvitation | null>(null);
    const [userToReset, setUserToReset] = useState<Profile | null>(null);
    const [userToEdit, setUserToEdit] = useState<Profile | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        if (!profile?.org_id) { setLoading(false); return; }
        const { data: membersData } = await supabase.from('profiles').select('*').eq('org_id', profile.org_id);
        const { data: invitesData } = await supabase.from('user_invitations').select('*').eq('org_id', profile.org_id).eq('status', 'pending');
        const { data: orgData } = await supabase.from('organizations').select('id, name, max_users').eq('id', profile.org_id).single();

        setMembers(membersData || []);
        setInvitations(invitesData || []);
        setOrgDetails(orgData);
        setLoading(false);
    }, [profile]);

    const fetchSuperAdminData = useCallback(async () => {
        setLoading(true);
        const [
            { data: profilesData, error: profilesError },
            { data: orgsData, error: orgsError }
        ] = await Promise.all([
            supabase.from('profiles').select('*').order('full_name', { ascending: true }),
            supabase.from('organizations').select('id, name, max_users')
        ]);

        if (profilesError || orgsError) {
            addToast({ type: 'error', title: 'Error', body: 'Could not fetch users and organizations.' });
            setLoading(false);
            return;
        }
        
        const orgMap = new Map((orgsData || []).map(org => [org.id, org]));
        // Fix: Explicitly type the initial value and callback parameters for the reduce function.
        // This resolves the "Untyped function calls may not accept type arguments" error by letting
        // TypeScript infer the accumulator type from the typed initial value, instead of using a
        // generic type argument on a method that may be inferred as non-generic.
        const userCounts = (profilesData || []).reduce((acc, profile: Profile) => {
            if (profile.org_id) {
                acc[profile.org_id] = (acc[profile.org_id] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
        
        const enrichedUsers = (profilesData || []).map(p => ({
            ...p,
            organization: orgMap.get(p.org_id),
            org_user_count: p.org_id ? userCounts[p.org_id] || 0 : 0
        }));

        setAllUsers(enrichedUsers);
        setLoading(false);
    }, [addToast]);

    useEffect(() => {
        if (profile && profile.role !== 'super_admin') {
            fetchData();
        } else if (profile?.role === 'super_admin') {
            fetchSuperAdminData();
        } else {
            setLoading(false);
        }
    }, [fetchData, profile, refreshKey, fetchSuperAdminData]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.org_id || !user?.id || !orgDetails) return;

        if (orgDetails.max_users && members.length >= orgDetails.max_users) {
            setInviteError(`Organization has reached its maximum user limit of ${orgDetails.max_users}.`);
            return;
        }

        setInviteLoading(true);
        setInviteError(null);

        // This assumes an Edge Function named 'send-invitation-email' exists.
        // This function should handle:
        // 1. Validating if the user/invite already exists.
        // 2. Inserting a row into the 'user_invitations' table.
        // 3. Sending an invitation email (e.g., using Resend, or Supabase's auth.admin.inviteUserByEmail).
        const { error } = await supabase.functions.invoke('send-invitation-email', {
            body: {
                org_id: profile.org_id,
                org_name: orgDetails.name,
                invited_by_user_id: user.id,
                invited_by_user_name: profile.full_name || user.email,
                invited_user_email: inviteEmail,
                role: inviteRole
            }
        });

        if (error) {
            let errorMessage = "Failed to send invitation. Please check the function logs.";
            try {
                // Try to parse a more specific error message from the function response
                const contextError = (error as any).context?.json?.error;
                if (contextError) {
                    errorMessage = contextError;
                }
            } catch {}
            setInviteError(errorMessage);
        } else {
            setIsInviteModalOpen(false);
            setInviteEmail('');
            setInviteRole('field_service_employee');
            addToast({ type: 'success', title: 'Invitation Sent', body: `An invitation email has been sent to ${inviteEmail}.` });
            fetchData(); // Refresh pending list
        }

        setInviteLoading(false);
    };

    const handleConfirmRemoveMember = async () => {
        if (!memberToRemove) return;
        const { error } = await supabase.from('profiles').update({ org_id: null }).eq('id', memberToRemove.id);
        if (error) { addToast({ type: 'error', title: 'Error', body: 'Error removing member: ' + error.message }); } else { addToast({ type: 'success', title: 'Success', body: 'Member removed.' }); fetchData(); }
        setMemberToRemove(null);
    };

    const handleConfirmCancelInvite = async () => {
        if (!inviteToCancel) return;
        const { error } = await supabase.from('user_invitations').delete().eq('id', inviteToCancel.id);
        if (error) { addToast({ type: 'error', title: 'Error', body: 'Error cancelling invitation: ' + error.message }); } else { addToast({ type: 'success', title: 'Success', body: 'Invitation cancelled.' }); fetchData(); }
        setInviteToCancel(null);
    };

    const handleConfirmResetPassword = async () => {
        if (!userToReset) return;
        try {
            const { data, error } = await supabase.functions.invoke('admin-reset-password', { body: { user_id_to_reset: userToReset.id } });
            if (error) throw error;
            addToast({ type: 'success', title: 'Success', body: data.message || 'Password reset email sent successfully.' });
        } catch (error: any) {
            addToast({ type: 'error', title: 'Error', body: 'Failed to send password reset: ' + (error.message || 'Please check the logs.') });
        }
        setUserToReset(null);
    };
    
    const handleSaveUserEdit = () => {
        setUserToEdit(null);
        if (profile?.role === 'super_admin') {
            fetchSuperAdminData();
        } else {
            fetchData();
        }
    };

    const InviteModal = () => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{t('add_member')}</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('email_address')}</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('role')}</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as UserRole)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                  <option value="key_user">{t('key_user')}</option>
                  <option value="field_service_employee">{t('field_service_employee')}</option>
                </select>
              </div>
              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
              <div className="flex justify-end space-x-2">
                <button type="button" onClick={() => setIsInviteModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded">{t('cancel')}</button>
                <button type="submit" disabled={inviteLoading} className="px-4 py-2 text-white bg-primary-600 rounded disabled:bg-primary-300">{inviteLoading ? t('sending') : t('sendInvite')}</button>
              </div>
            </form>
          </div>
        </div>
    );

    if (loading) return <div className="text-center p-8">Loading...</div>;

    if (profile?.role === 'super_admin') {
        return (
            <div className="space-y-8">
                <SuperAdminOrgInvitations t={t} addToast={addToast} user={user} />

                <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 p-6">
                    <h2 className="text-xl font-bold mb-4">All Current Employees</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 dark:bg-slate-900/50">
                                <tr className="text-left text-xs font-semibold text-gray-500 uppercase">
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3">Email</th>
                                    <th className="px-6 py-3">Organization</th>
                                    <th className="px-6 py-3">Users</th>
                                    <th className="px-6 py-3">Role</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y dark:divide-gray-700">
                                {allUsers.map(member => {
                                    const current = member.org_user_count || 0;
                                    const max = member.organization?.max_users || 0;
                                    const remaining = max - current;
                                    return (
                                    <tr key={member.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{member.full_name || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.email}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.organization?.name || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {member.organization ? `${current} / ${max} (${remaining} left)` : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">{t(member.role as any) || member.role}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                            <button onClick={() => setUserToEdit(member)} className="text-gray-500 hover:text-primary-600" title="Edit User">
                                                <PencilIcon className="w-5 h-5"/>
                                            </button>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                </div>

                {userToEdit && <EditUserModal userToEdit={userToEdit} onClose={() => setUserToEdit(null)} onSave={handleSaveUserEdit} t={t} />}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('team_management')}</h1>
                <button onClick={() => setIsInviteModalOpen(true)} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
                    <PlusIcon className="w-5 h-5 mr-2" /> {t('add_member')}
                </button>
            </div>

            {orgDetails && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                    <p className="text-blue-800 dark:text-blue-200">
                        User Limit: <span className="font-bold">{members.length} / {orgDetails.max_users || 'N/A'}</span>
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-300">
                        ({(orgDetails.max_users || 0) - members.length} slots remaining)
                    </p>
                </div>
            )}


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 p-6">
                    <h2 className="text-xl font-bold mb-4">{t('current_members')}</h2>
                    <div className="space-y-4">
                        {members.map(member => (
                            <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{member.full_name || 'N/A'}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{member.email}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{t(member.role as any) || member.role}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => setUserToEdit(member)} className="text-gray-500 hover:text-primary-600"><PencilIcon className="w-5 h-5"/></button>
                                    {member.id !== profile?.id && (<button onClick={() => setMemberToRemove(member)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 p-6">
                    <h2 className="text-xl font-bold mb-4">{t('pending_members')}</h2>
                    <div className="space-y-4">
                        {invitations.length > 0 ? invitations.map(invite => (
                            <div key={invite.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{invite.invited_user_email}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{t(invite.role as any) || invite.role}</p>
                                </div>
                                <button onClick={() => setInviteToCancel(invite)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        )) : <p className="text-sm text-gray-500">No pending invitations.</p>}
                    </div>
                </div>
            </div>
            
            {isInviteModalOpen && <InviteModal />}
            {userToEdit && <EditUserModal userToEdit={userToEdit} onClose={() => setUserToEdit(null)} onSave={handleSaveUserEdit} t={t} />}
            <ConfirmModal isOpen={!!memberToRemove} onClose={() => setMemberToRemove(null)} onConfirm={handleConfirmRemoveMember} title="Remove Member" message={t('confirmRemoveMember')} confirmText="Remove" />
            <ConfirmModal isOpen={!!inviteToCancel} onClose={() => setInviteToCancel(null)} onConfirm={handleConfirmCancelInvite} title="Cancel Invitation" message={t('confirmCancelInvite')} confirmText="Cancel" />
            <ConfirmModal isOpen={!!userToReset} onClose={() => setUserToReset(null)} onConfirm={handleConfirmResetPassword} title="Reset User Password" message={`Are you sure you want to send a password reset email to ${userToReset?.email}?`} confirmText="Send Reset Email" />
        </div>
    );
};

export default TeamPage;