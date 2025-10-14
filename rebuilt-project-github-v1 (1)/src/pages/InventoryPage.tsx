import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Product, StockStatus } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import ProductModal from '../components/modals/ProductModal';
import { generateNextNumber } from '../lib/numberGenerator';
import Pagination from '../components/ui/Pagination';
import ConfirmModal from '../components/modals/ConfirmModal';
import { formatEuropeanDate } from '../lib/formatting';

type SortConfig = { key: string; direction: 'asc' | 'desc' };
const ITEMS_PER_PAGE = 20;

const StockStatusBadge: React.FC<{ status?: StockStatus | null }> = ({ status }) => {
    if (!status) return null;
    const statusColors: Record<StockStatus, string> = {
        'Available': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
        'Low': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
        'Not Available': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
        'Available Soon': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    };
    return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[status] || 'bg-gray-100'}`}>
            {status}
        </span>
    );
};

const InventoryPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { addToast } = useNotifications();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const canManageInventory = profile?.role !== 'field_service_employee';
  const canCreate = profile?.role !== 'field_service_employee' && profile?.role !== 'super_admin';
  const isFieldServiceEmployee = profile?.role === 'field_service_employee';

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm]);

  const fetchProducts = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);

    let query = supabase
      .from('products')
      .select('*, organizations(name)', { count: 'exact' });

    if (profile.role !== 'super_admin') {
      query = query.eq('org_id', profile.org_id);
    }
    
    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,product_number.ilike.%${searchTerm}%`);
    }
    
    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    query = query
      .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching products:', error.message);
    } else {
        setProducts(data || []);
        setTotalItems(count || 0);
    }
    
    setLoading(false);
  }, [user, profile, searchTerm, sortConfig, currentPage]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, refreshKey]);

  const handleSort = (key: string) => {
    setCurrentPage(0);
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenModal = (product: Product | null = null) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const handleSaveProduct = async (productData: Partial<Product>) => {
    const { data, error } = await supabase.from('products').upsert(productData).select().single();
    if (error) {
      addToast({ title: 'Error', body: 'Error saving product: ' + error.message, type: 'error' });
    } else {
      fetchProducts();
      handleCloseModal();
    }
  };

  const handleCopyProduct = async (productId: number) => {
    if (!profile) return;
    try {
        setLoading(true);
        const { data: original, error: fetchError } = await supabase.from('products').select('*').eq('id', productId).single();
        if (fetchError || !original) throw new Error(fetchError?.message || 'Product not found.');
        
        const newNumber = await generateNextNumber(profile.org_id, 'product');
        const { id, created_at, product_number, ...rest } = original;

        const newProductData = {
            ...rest,
            product_number: newNumber,
            name: `(Copy) ${original.name}`.trim(),
        };

        const { data: newProduct, error: insertError } = await supabase.from('products').insert(newProductData).select().single();
        if (insertError) throw insertError;

        addToast({ title: 'Success', body: `Product copied. Opening new draft...`, type: 'success' });
        handleOpenModal(newProduct);

    } catch (error: any) {
        addToast({ title: 'Error', body: `Failed to copy product: ${error.message}`, type: 'error' });
    } finally {
        setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
    if (error) {
      addToast({ title: 'Error', body: 'Error deleting product: ' + error.message, type: 'error' });
    } else {
      addToast({ title: 'Success', body: 'Product deleted.', type: 'success' });
      fetchProducts();
    }
    setProductToDelete(null);
  };

  const SortableHeader: React.FC<{ sortKey: string; label: string; }> = ({ sortKey, label }) => (
    <th 
        className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        onClick={() => handleSort(sortKey)}
    >
        <div className="flex items-center">
            <span>{label}</span>
            {sortConfig.key === sortKey && (
                sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-4 h-4 ml-1" /> : <ChevronDownIcon className="w-4 h-4 ml-1" />
            )}
        </div>
    </th>
  );
  
  const MobileProductCard: React.FC<{ product: Product }> = ({ product }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-3">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-bold">{product.name}</p>
                <p className="text-sm font-mono text-gray-500">{product.product_number}</p>
            </div>
            <span className="font-bold text-lg">€{product.selling_price.toFixed(2)}{product.type === 'service' && product.unit ? ` / ${product.unit}` : ''}</span>
        </div>
        {product.description && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{product.description}</p>}
        {product.type === 'good' && (
            <div className="flex justify-between items-center text-sm">
                <p className="text-gray-500 dark:text-gray-400">
                    {t('stock')}: {product.stock_level ?? 'N/A'}
                </p>
                <StockStatusBadge status={product.stock_status} />
            </div>
        )}
         {product.type === 'good' && product.stock_status === 'Available Soon' && product.restock_date && (
            <p className="text-xs text-blue-500">{t('expectedRestockDate')}: {formatEuropeanDate(product.restock_date)}</p>
        )}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('inventory')}</h1>
          {canCreate && (
            <button onClick={() => handleOpenModal()} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700">
              <PlusIcon className="w-5 h-5 mr-2" /> {t('newProduct')}
            </button>
          )}
        </div>

        <div className="p-4 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <input 
            type="text"
            placeholder={t('searchByProduct')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        {loading ? <div className="p-6 text-center text-gray-500">{t('loading')}</div> : (
          isFieldServiceEmployee ? (
            <div className="space-y-4">
                 {products.length > 0 ? products.map(product => (
                    <MobileProductCard key={product.id} product={product} />
                  )) : <p className="p-6 text-center text-gray-500">{t('noProductsFound')}</p>}
                  <Pagination
                    currentPage={currentPage}
                    totalItems={totalItems}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                    <tr>
                        <SortableHeader sortKey="product_number" label={t('product_number')} />
                        <SortableHeader sortKey="name" label={t('name')} />
                        <SortableHeader sortKey="type" label={t('type')} />
                        {profile?.role === 'super_admin' && <SortableHeader sortKey="organizations.name" label={t('organization')} />}
                        <SortableHeader sortKey="selling_price" label={t('price')} />
                        <SortableHeader sortKey="stock_level" label={t('stock')} />
                        <SortableHeader sortKey="stock_status" label={t('status')} />
                        <SortableHeader sortKey="created_at" label={t('createdAt')} />
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{t('actions')}</th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800">
                    {products.map(product => (
                        <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{product.product_number}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{product.name}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">{t(product.type)} {product.type === 'service' && product.unit ? `(${product.unit})` : ''}</td>
                        {profile?.role === 'super_admin' && <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{product.organizations?.name || 'N/A'}</td>}
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">€{product.selling_price.toFixed(2)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{product.type === 'good' ? (product.stock_level ?? 'N/A') : <span className="text-gray-400">-</span>}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm">{product.type === 'good' ? <StockStatusBadge status={product.stock_status} /> : <span className="text-gray-400">-</span>}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(product.created_at)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            {canManageInventory && (
                            <>
                                <button onClick={() => handleOpenModal(product)} className="text-primary-600 hover:text-primary-800" title={t('edit')}><PencilIcon className="w-5 h-5"/></button>
                                <button onClick={() => handleCopyProduct(product.id)} title={t('copyProduct')}><DocumentDuplicateIcon className="w-5 h-5 text-gray-500 hover:text-primary-600"/></button>
                                <button onClick={() => setProductToDelete(product)} className="text-red-600 hover:text-red-800" title={t('delete')}><TrashIcon className="w-5 h-5"/></button>
                            </>
                            )}
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
                 <Pagination
                    currentPage={currentPage}
                    totalItems={totalItems}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
            </div>
            )
        )}
      </div>
      {isModalOpen && <ProductModal product={selectedProduct} closeModal={handleCloseModal} onSave={handleSaveProduct} />}
      <ConfirmModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={`${t('delete')} ${t('inventory')}`}
        message={`${t('confirmDeleteProduct')} "${productToDelete?.name}"?`}
        confirmText={t('delete')}
      />
    </>
  );
};

export default InventoryPage;