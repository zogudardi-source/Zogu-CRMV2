import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Product, StockStatus } from '../../types';
import { generateNextNumber } from '../../lib/numberGenerator';
import DatePicker from '../ui/DatePicker';
import { parseAsLocalDate } from '../../lib/formatting';

interface ProductModalProps {
  product: Product | null;
  closeModal: () => void;
  onSave: (product: Partial<Product>) => void;
}

const STOCK_STATUSES: StockStatus[] = ['Available', 'Low', 'Not Available', 'Available Soon'];

const unitOptions = [
  { label: '🧰 Allgemeine Einheiten', options: ['Std', 'Min', 'Tag', 'Einsatz', 'Auftrag', 'Stück (Stk)', 'Paket'] },
  { label: '🚗 Fahrt- und Logistikeinheiten', options: ['km', 'Fahrt', 'Stunde Fahrtzeit', 'Anfahrt / Abfahrt'] },
  { label: '🏗️ Material- und Verbrauchseinheiten', options: ['m', 'm²', 'm³', 'kg', 'l', 'Pauschale'] }
];


const ProductModal: React.FC<ProductModalProps> = ({ product, closeModal, onSave }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    selling_price: product?.selling_price || 0,
    type: product?.type || 'good',
    unit: product?.unit || '',
    stock_level: product?.stock_level ?? null,
    minimum_stock_level: product?.minimum_stock_level ?? 0,
    stock_status: product?.stock_status || 'Available',
  });
  const [restockDate, setRestockDate] = useState<Date | null>(parseAsLocalDate(product?.restock_date));
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const isNumberInput = (e.target instanceof HTMLInputElement) && type === 'number';

    if (name === 'type') {
      setFormData(prev => ({
        ...prev,
        type: value as 'good' | 'service',
        // Reset fields when switching types for cleanliness
        unit: value === 'good' ? '' : prev.unit,
        stock_level: value === 'service' ? null : prev.stock_level,
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: isNumberInput ? (value === '' ? null : parseFloat(value)) : value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.org_id) {
        alert("Cannot save product: User or Organization information is missing.");
        return;
    }
    setLoading(true);

    try {
        let productData: Partial<Product>;

        if (formData.type === 'service') {
            productData = {
                name: formData.name,
                description: formData.description,
                selling_price: formData.selling_price,
                type: 'service',
                unit: formData.unit || null,
                stock_level: 0, // Fix: Set to 0 to satisfy NOT NULL constraint
                minimum_stock_level: 0, // Fix: Set to 0 to satisfy NOT NULL constraint
                stock_status: 'Not Available', // Services don't have a stock status
                restock_date: null,
                org_id: profile.org_id,
            };
        } else { // 'good'
            productData = {
                name: formData.name,
                description: formData.description,
                selling_price: formData.selling_price,
                type: 'good',
                unit: null,
                stock_level: formData.stock_level,
                minimum_stock_level: formData.minimum_stock_level,
                stock_status: formData.stock_status,
                restock_date: formData.stock_status === 'Available Soon' && restockDate ? restockDate.toISOString().split('T')[0] : null,
                org_id: profile.org_id,
            };
        }

        if (product?.id) { // Editing
            productData.id = product.id;
            productData.user_id = product.user_id;
            productData.product_number = product.product_number;
        } else { // Creating
            const newNumber = await generateNextNumber(profile.org_id, 'product');
            productData.user_id = user.id;
            productData.product_number = newNumber;
        }
        
        onSave(productData);
    } catch (error: any) {
        alert('Error saving product: ' + error.message);
    }
    setLoading(false);
  };

  const stockStatusTranslations: Record<StockStatus, 'available' | 'low' | 'notAvailable' | 'availableSoon'> = {
    'Available': 'available',
    'Low': 'low',
    'Not Available': 'notAvailable',
    'Available Soon': 'availableSoon',
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-bold mb-6">{product ? `${t('editProduct')} (${product.product_number})` : t('newProduct')}</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('productType')}</label>
            <div className="flex items-center space-x-4 mt-2">
                <label className="flex items-center cursor-pointer">
                    <input type="radio" name="type" value="good" checked={formData.type === 'good'} onChange={handleChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500" />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{t('good')}</span>
                </label>
                <label className="flex items-center cursor-pointer">
                    <input type="radio" name="type" value="service" checked={formData.type === 'service'} onChange={handleChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500" />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{t('service')}</span>
                </label>
            </div>
          </div>
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('name')}</label>
            <input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Concrete Mixer" required className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('description')}</label>
            <textarea id="description" name="description" value={formData.description} onChange={handleChange} placeholder="e.g. 140L, 550W electric" rows={3} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="selling_price" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('selling_price')}</label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 dark:text-gray-400">€</span>
                <input id="selling_price" name="selling_price" type="number" step="0.01" value={formData.selling_price} onChange={handleChange} placeholder="0.00" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 pl-7" />
              </div>
            </div>
            {formData.type === 'service' && (
              <div>
                <label htmlFor="unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('unit')}</label>
                <select
                  id="unit"
                  name="unit"
                  value={formData.unit || ''}
                  onChange={handleChange}
                  className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="">-- Einheit auswählen --</option>
                  {unitOptions.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          {formData.type === 'good' && (
            <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-700/50 space-y-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">{t('inventoryTrackingOptional')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('inventoryTrackingHint')}</p>
              
              <div>
                <label htmlFor="stock_level" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('currentStockLevel')}</label>
                <input id="stock_level" name="stock_level" type="number" value={formData.stock_level ?? ''} onChange={handleChange} placeholder="e.g. 25" className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('stockLevelHint')}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="minimum_stock_level" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('lowStockThreshold')}</label>
                  <input id="minimum_stock_level" name="minimum_stock_level" type="number" value={formData.minimum_stock_level ?? ''} onChange={handleChange} placeholder="e.g. 5" className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('lowStockThresholdHint')}</p>
                </div>
                <div>
                  <label htmlFor="stock_status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('manualStatusOverride')}</label>
                  <select id="stock_status" name="stock_status" value={formData.stock_status} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                    {STOCK_STATUSES.map(s => <option key={s} value={s}>{t(stockStatusTranslations[s])}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('manualStatusOverrideHint')}</p>
                </div>
              </div>

              {formData.stock_status === 'Available Soon' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('expectedRestockDate')}</label>
                  <DatePicker selected={restockDate} onChange={setRestockDate} />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 rounded-md text-sm font-medium dark:bg-gray-600">{t('cancel')}</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-primary-600 rounded-md text-sm font-medium disabled:bg-primary-300">{loading ? t('processing') : t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;