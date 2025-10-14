// Fix: Created missing ProfilePage.tsx file.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Profile, Organization } from '../types';

const ProfilePage: React.FC = () => {
  const { user, profile, refetchProfile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState<Partial<Organization>>({});
  const [personalData, setPersonalData] = useState<Partial<Profile>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const canEditCompany = profile?.role === 'admin' || profile?.role === 'key_user';

  const fetchOrganizationData = useCallback(async () => {
    if (profile?.org_id) {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.org_id)
        .single();
      if (error) console.error('Error fetching organization data:', error.message);
      else {
        setOrganization(data || {});
        setLogoPreview(data?.logo_url || null);
      }
    }
  }, [profile]);
  
  useEffect(() => {
    if (profile) {
      setPersonalData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
      fetchOrganizationData();
    }
  }, [profile, fetchOrganizationData]);

  const handlePersonalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setPersonalData({ ...personalData, [e.target.name]: e.target.value });
  };
  
  const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setOrganization({ ...organization, [e.target.name]: e.target.value });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.org_id) return;
    setLoading(true);

    try {
      // 1. Update personal data
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: personalData.full_name, phone: personalData.phone })
        .eq('id', user.id);
      if (profileError) throw profileError;
      
      // 2. Update company data (if allowed)
      if (canEditCompany) {
        let logoUrl = organization.logo_url;
        
        // 2a. Handle logo upload
        if (logoFile) {
          const filePath = `${profile.org_id}/${Date.now()}_${logoFile.name}`;
          
          // If a logo already exists, remove the old one first
          if (organization.logo_url) {
            const oldFilePath = organization.logo_url.split('/').pop();
            if(oldFilePath) {
                await supabase.storage.from('logos').remove([`${profile.org_id}/${oldFilePath}`]);
            }
          }

          const { error: uploadError } = await supabase.storage
            .from('logos')
            .upload(filePath, logoFile, { upsert: true });

          if (uploadError) throw uploadError;

          const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
          logoUrl = data.publicUrl;
        }

        // 2b. Update organization table
        const { name, ...orgDataToUpdate } = organization; // Exclude 'name' as it might not be editable
        const { error: orgError } = await supabase
          .from('organizations')
          .update({ ...orgDataToUpdate, logo_url: logoUrl })
          .eq('id', profile.org_id);

        if (orgError) throw orgError;
      }
      
      alert(t('profileUpdatedSuccess'));
      await refetchProfile(); // This re-fetches the user profile
      await fetchOrganizationData(); // We also need to re-fetch the org data
    } catch (error: any) {
      alert(t('errorUpdatingProfile') + ' ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('profile_settings')}</h1>
      
      <form onSubmit={handleSubmit} className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">

        {/* --- Company Information --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t('companyInformation')}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('companyInformationHint')}</p>
            {/* Logo Section */}
             <div className="space-y-2">
                <label className="block text-sm font-medium">{t('companyLogo')}</label>
                <div className="flex items-center space-x-4">
                    {logoPreview ? (
                        <img src={logoPreview} alt="Logo Preview" className="w-20 h-20 object-contain rounded-md bg-gray-100" />
                    ) : (
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center text-gray-400">{t('noLogo')}</div>
                    )}
                    <input type="file" id="logo-upload" onChange={handleLogoChange} accept="image/png, image/jpeg" disabled={!canEditCompany} className="hidden" />
                    <label htmlFor="logo-upload" className={`cursor-pointer px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 ${!canEditCompany && 'opacity-50 cursor-not-allowed'}`}>{t('change')}</label>
                </div>
            </div>
          </div>
          <div className="md:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">{t('company_name')}</label>
                    <input type="text" name="company_name" value={organization.company_name || ''} onChange={handleCompanyChange} disabled={!canEditCompany} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50" />
                </div>
                <div>
                    <label className="block text-sm font-medium">{t('vat_id')}</label>
                    <input type="text" name="ust_idnr" value={organization.ust_idnr || ''} onChange={handleCompanyChange} disabled={!canEditCompany} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50" />
                </div>
            </div>
            <div>
              <label className="block text-sm font-medium">{t('address')}</label>
              <textarea name="address" value={organization.address || ''} onChange={handleCompanyChange} rows={3} disabled={!canEditCompany} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50"></textarea>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">{t('iban')}</label>
                <input type="text" name="iban" value={organization.iban || ''} onChange={handleCompanyChange} disabled={!canEditCompany} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50" />
              </div>
              <div>
                <label className="block text-sm font-medium">{t('bic')}</label>
                <input type="text" name="bic" value={organization.bic || ''} onChange={handleCompanyChange} disabled={!canEditCompany} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50" />
              </div>
            </div>
          </div>
        </div>

        <hr className="my-6 dark:border-gray-700" />
        
        {/* --- Personal Information --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">{t('personalInformation')}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('personalInformationHint')}</p>
          </div>
          <div className="md:col-span-2 space-y-4">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">{t('full_name')}</label>
                    <input type="text" name="full_name" value={personalData.full_name || ''} onChange={handlePersonalChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                </div>
                <div>
                    <label className="block text-sm font-medium">{t('phone')}</label>
                    <input type="text" name="phone" value={personalData.phone || ''} onChange={handlePersonalChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">{t('emailCannotBeChanged')}</label>
              <input type="email" value={user?.email || ''} readOnly className="mt-1 w-full p-2 border rounded bg-gray-100 dark:bg-gray-700/50 dark:border-gray-600" />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mt-8">
            <div className="text-sm">
                {t('currentPlan')}: <span className="font-bold text-primary-500">{profile?.current_plan}</span>
            </div>
            <button type="submit" disabled={loading} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
              {loading ? t('saving') : t('save')}
            </button>
        </div>
      </form>
    </div>
  );
};

export default ProfilePage;