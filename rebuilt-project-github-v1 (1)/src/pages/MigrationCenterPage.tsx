import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Organization } from '../types';
import { generateNextNumber } from '../lib/numberGenerator';
import { ArrowUpTrayIcon, CubeIcon, UsersIcon } from '@heroicons/react/24/outline';

interface UploadResult {
  successCount: number;
  errorCount: number;
  errors: string[];
}

const MigrationCenterPage: React.FC = () => {
  const { profile, user } = useAuth();
  const { t } = useLanguage();

  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customerResult, setCustomerResult] = useState<UploadResult | null>(null);
  const [productResult, setProductResult] = useState<UploadResult | null>(null);

  // For super admin
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  useEffect(() => {
    if (profile?.role === 'super_admin') {
      supabase.from('organizations').select('*').then(({ data }) => {
        setOrganizations(data || []);
      });
    }
  }, [profile]);

  const downloadTemplate = (type: 'customer' | 'product') => {
    const headers = type === 'customer'
      ? ['name', 'email', 'phone', 'address']
      : ['name', 'description', 'selling_price', 'stock_level'];
    
    const csvContent = headers.join(',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${type}_template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleFileUpload = async (type: 'customer' | 'product') => {
      const file = type === 'customer' ? customerFile : productFile;
      const setResult = type === 'customer' ? setCustomerResult : setProductResult;
      
      const targetOrgId = profile?.role === 'super_admin' ? selectedOrgId : profile?.org_id;

      if (!file || !user || !targetOrgId) {
          alert('File, user, or organization is missing.');
          return;
      }
      
      setIsProcessing(true);
      setResult(null);

      const reader = new FileReader();
      reader.onload = async (event) => {
          const csvContent = event.target?.result as string;
          
          try {
              const lines = csvContent.split(/\r\n|\n/).filter(line => line.trim() !== '');
              if (lines.length < 2) {
                  throw new Error('CSV file must have a header and at least one data row.');
              }
              const header = lines[0].split(',').map(h => h.trim());
              const rows = lines.slice(1);

              const expectedHeaders = type === 'customer'
                  ? ['name', 'email', 'phone', 'address']
                  : ['name', 'description', 'selling_price', 'stock_level'];

              if (JSON.stringify(header) !== JSON.stringify(expectedHeaders)) {
                  throw new Error(`Invalid headers. Expected: ${expectedHeaders.join(', ')}`);
              }

              let successCount = 0;
              let errors: string[] = [];
              
              const itemsToInsert = [];

              for (let i = 0; i < rows.length; i++) {
                  const line = rows[i];
                  const values = line.split(',');
                  if (values.length !== header.length) {
                      errors.push(`Row ${i + 2}: Incorrect number of columns.`);
                      continue;
                  }
                  
                  const rowData: any = {};
                  header.forEach((h, index) => {
                      rowData[h] = values[index].trim();
                  });

                  try {
                    if (type === 'customer') {
                        const customerNumber = await generateNextNumber(targetOrgId, 'customer');
                        itemsToInsert.push({
                            name: rowData.name,
                            email: rowData.email || null,
                            phone: rowData.phone || null,
                            address: rowData.address || null,
                            org_id: targetOrgId,
                            user_id: user.id,
                            customer_number: customerNumber,
                        });
                    } else { // product
                        const productNumber = await generateNextNumber(targetOrgId, 'product');
                        itemsToInsert.push({
                            name: rowData.name,
                            description: rowData.description || null,
                            selling_price: parseFloat(rowData.selling_price) || 0,
                            stock_level: rowData.stock_level ? parseInt(rowData.stock_level) : null,
                            org_id: targetOrgId,
                            user_id: user.id,
                            product_number: productNumber,
                        });
                    }
                  } catch (numberError: any) {
                    errors.push(`Row ${i + 2}: Failed to generate number. ${numberError.message}`);
                  }
              }

              if (itemsToInsert.length > 0) {
                const tableName = type === 'customer' ? 'customers' : 'products';
                const { error: insertError } = await supabase.from(tableName).insert(itemsToInsert);

                if (insertError) {
                    throw new Error(`Database insert failed: ${insertError.message}`);
                }
                successCount = itemsToInsert.length;
              }

              setResult({
                  successCount: successCount,
                  errorCount: errors.length,
                  errors: errors
              });
              if(errors.length > 0) {
                console.error("CSV Import Errors:", errors);
              }

          } catch (e: any) {
              setResult({ successCount: 0, errorCount: 1, errors: [e.message] });
          } finally {
              setIsProcessing(false);
          }
      };
      reader.readAsText(file);
  };
  
  const UploadSection: React.FC<{
    type: 'customer' | 'product';
    file: File | null;
    setFile: (file: File | null) => void;
    result: UploadResult | null;
  }> = ({ type, file, setFile, result }) => {
    const title = type === 'customer' ? t('importCustomers') : t('importProducts');
    const Icon = type === 'customer' ? UsersIcon : CubeIcon;
    const headers = type === 'customer' ? 'name,email,phone,address' : 'name,description,selling_price,stock_level';

    return (
        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 space-y-4">
            <div className="flex items-center gap-x-3">
                <Icon className="w-8 h-8 text-primary-500"/>
                <h2 className="text-xl font-bold">{title}</h2>
            </div>
            <div className="text-sm p-4 bg-gray-50 dark:bg-gray-700 rounded-md space-y-2">
                <h3 className="font-semibold">{t('fileRequirements')}</h3>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                    <li>{t('mustBeCsv')}</li>
                    <li>{t('headersMustMatch')} <code className="text-xs">{headers}</code></li>
                    <li>Data should not contain commas.</li>
                </ul>
                <button onClick={() => downloadTemplate(type)} className="text-sm text-primary-600 hover:underline font-medium">{t('downloadTemplate')}</button>
            </div>
            
            <div className="flex items-center gap-x-4">
                <label className="block">
                    <span className="sr-only">{t('selectFile')}</span>
                    <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary-50 file:text-primary-700
                        hover:file:bg-primary-100"
                    />
                </label>
                <button
                    onClick={() => handleFileUpload(type)}
                    disabled={!file || isProcessing || (profile?.role === 'super_admin' && !selectedOrgId)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700 disabled:bg-gray-400"
                >
                    <ArrowUpTrayIcon className="w-5 h-5 mr-2"/>
                    {isProcessing ? t('processingFile') : t('upload')}
                </button>
            </div>
            
            {result && (
                <div className={`p-3 rounded-md text-sm ${result.errorCount > 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                    <p className="font-bold">{result.errorCount > 0 ? 'Upload Completed with Errors' : t('uploadSuccess')}</p>
                    <p>{result.successCount} {t('importedRows')}</p>
                    {result.errorCount > 0 && <p>{result.errorCount} {t('failedRows')} {t('seeConsole')}</p>}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('migrationCenter')}</h1>

      {profile?.role === 'super_admin' && (
        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <label htmlFor="org-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('selectOrg')}</label>
            <select
                id="org-select"
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
            >
                <option value="">-- Select an Organization --</option>
                {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
        </div>
      )}
      
      <p className="text-sm text-yellow-700 bg-yellow-100 dark:text-yellow-200 dark:bg-yellow-900/50 p-3 rounded-md">
        <strong>Warning:</strong> For large files, the upload process may take several minutes as each row is numbered individually. Please be patient and do not navigate away from this page.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <UploadSection type="customer" file={customerFile} setFile={setCustomerFile} result={customerResult} />
          <UploadSection type="product" file={productFile} setFile={setProductFile} result={productResult} />
      </div>
    </div>
  );
};

export default MigrationCenterPage;
