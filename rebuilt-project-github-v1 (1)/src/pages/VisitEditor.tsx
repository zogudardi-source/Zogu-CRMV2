import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTabs } from '../contexts/TabContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Customer, Product, Expense, Profile, Visit, VisitCategory, VisitStatus, VisitProduct, VisitExpense, EmailLog, InvoiceStatus } from '../types';
import { generateNextNumber } from '../lib/numberGenerator';
import { generateVisitSummaryPDF } from '../lib/pdfGenerator';
import { createNotification } from '../lib/notifications';
import { PlusIcon, TrashIcon, ArrowLeftIcon, EnvelopeIcon, PencilIcon as SignatureIcon, ArrowDownTrayIcon, CurrencyDollarIcon, DocumentTextIcon, InformationCircleIcon, DocumentTextIcon as TextBlockIcon } from '@heroicons/react/24/outline';
import ProductSelectionModal from '../components/modals/ProductSelectionModal';
import ExpenseSelectionModal from '../components/modals/ExpenseSelectionModal';
import TextBlockSelectionModal from '../components/modals/TextBlockSelectionModal';
import DatePicker from '../components/ui/DatePicker';
import { parseAsLocalDate, formatEuropeanDate, formatEuropeanTime, resolvePlaceholders } from '../lib/formatting';
import SignatureModal from '../components/modals/SignatureModal';
import { useModal } from '../contexts/ModalContext';

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Local type for managing items in the UI
type VisitEditorItem = Partial<Omit<VisitProduct, 'id' | 'visit_id'>> & {
  expense_id?: number;
  description?: string;
  products?: Partial<Product>;
  expenses?: Partial<Expense>;
};


const VisitEditor: React.FC = () => {
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { replaceTab, closeTab, updateTabLabel, openTab } = useTabs();
  const { triggerRefresh } = useRefresh();
  const { addToast } = useNotifications();
  const { openExpenseModal } = useModal();

  const id = params.id;
  const [instancePath] = useState(location.pathname);
  const isInitialized = useRef(false);
  const initialVisitRef = useRef<Partial<Visit> & { visit_products?: Partial<VisitProduct>[] } | null>(null);

  const [visit, setVisit] = useState<Partial<Visit>>({
    status: 'planned',
    category: 'Maintenance',
  });
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  const [items, setItems] = useState<VisitEditorItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isTextBlockModalOpen, setIsTextBlockModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [isInvoiceCreated, setIsInvoiceCreated] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);


  const canManageAssignee = profile?.role !== 'field_service_employee';
  const isReadOnly = visit.status === 'completed' && !!visit.signature_storage_path;
  const textBlocksEnabled = visit.organizations?.is_text_blocks_enabled;

  const fetchVisitData = useCallback(async () => {
    if (!id || id === 'new' || !profile) return;
    setLoading(true);

    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
        navigate('/visits');
        return;
    }

    let query = supabase.from('visits').select('*, customers:customers!left(*), profiles:profiles!left(id, full_name, email), organizations:org_id(*)').eq('id', visitId);
    
    if (profile.role !== 'super_admin' && profile.org_id) {
        query = query.eq('org_id', profile.org_id);
    }
    
    const { data: visitData, error } = await query.single();

    if (error || !visitData) {
      addToast({ type: 'error', title: 'Error', body: 'Error fetching visit data. ' + (error?.message || 'Not found')});
      navigate('/visits');
      return;
    }

    const { customers, profiles, organizations, ...baseVisitData } = visitData;
    
    const { data: productsData } = await supabase.from('visit_products').select('*, products(*)').eq('visit_id', id);
    const { data: expensesData } = await supabase.from('visit_expenses').select('*, expenses(*)').eq('visit_id', id);
    
    const productItems: VisitEditorItem[] = (productsData || []).map(p => ({
        product_id: p.product_id,
        description: p.products?.name || 'Product not found',
        quantity: p.quantity,
        unit_price: p.unit_price,
        products: p.products as Product,
    }));
    
    const expenseItems: VisitEditorItem[] = (expensesData || []).map(e => ({
        expense_id: e.expense_id,
        description: e.expenses?.description || 'Expense not found',
        quantity: 1, // Expenses are always quantity 1
        unit_price: e.expenses?.amount,
        expenses: e.expenses as Expense,
    }));

    setItems([...productItems, ...expenseItems]);
    
    const fetchedVisit = { ...baseVisitData, customers, profiles, organizations, visit_products: productsData, visit_expenses: expensesData };
    initialVisitRef.current = JSON.parse(JSON.stringify(fetchedVisit));
    
    setVisit(fetchedVisit);
    setStartTime(parseAsLocalDate(baseVisitData.start_time));
    setEndTime(parseAsLocalDate(baseVisitData.end_time));

    if (visitData.signature_storage_path) {
        const { data, error: urlError } = await supabase.storage
            .from('signatures')
            .createSignedUrl(visitData.signature_storage_path, 3600);
        
        if (urlError) {
            console.error("Error creating signed URL for signature:", urlError);
            addToast({ type: 'error', title: 'Display Error', body: 'Could not load customer signature.' });
            setSignatureUrl(null);
        } else {
            setSignatureUrl(data.signedUrl);
        }
    } else {
        setSignatureUrl(null);
    }

    const { data: emailLogsData } = await supabase
        .from('email_logs')
        .select('*, sent_by:sent_by_user_id!left(full_name)')
        .eq('related_document_id', id)
        .order('created_at', { ascending: false });
    
    setEmailLogs(emailLogsData || []);

    const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('visit_id', visitId)
        .limit(1)
        .single();
    
    setIsInvoiceCreated(!!existingInvoice);

    updateTabLabel(instancePath, visitData.visit_number);
    setLoading(false);
  }, [id, profile, navigate, instancePath, updateTabLabel, addToast]);

  const fetchDataForDropdowns = useCallback(async () => {
    if (!profile) return;
    
    let customersQuery = supabase.from('customers').select('*');
    if (profile.role !== 'super_admin') {
        customersQuery = customersQuery.eq('org_id', profile.org_id);
    }
    const { data: customerData } = await customersQuery;
    setCustomers(customerData || []);

    if (canManageAssignee) {
        let employeesQuery = supabase.from('profiles').select('*');
        if (profile.role !== 'super_admin') {
            employeesQuery = employeesQuery.eq('org_id', profile.org_id);
        }
        const { data: employeeData } = await employeesQuery;
        setEmployees(employeeData || []);
    }
  }, [profile, canManageAssignee]);

  useEffect(() => {
    if (isInitialized.current) {
      return;
    }

    fetchDataForDropdowns();
    if (id && id !== 'new') {
      fetchVisitData();
    } else {
      const state = location.state as { defaultDate?: string, defaultAssigneeId?: string, customerId?: number } | null;
      const initialDate = state?.defaultDate ? parseAsLocalDate(state.defaultDate) : new Date();
      setStartTime(initialDate);
      setEndTime(initialDate ? new Date(initialDate.getTime() + 60 * 60 * 1000) : null);

      setVisit(v => ({
        ...v,
        assigned_employee_id: state?.defaultAssigneeId || user?.id,
        customer_id: state?.customerId
      }));
      if (profile?.org_id) {
        supabase.from('organizations').select('*').eq('id', profile.org_id).single()
        .then(({ data: orgData }) => {
            if (orgData) {
                setVisit(prev => ({ ...prev, organizations: orgData }));
            }
        });
      }
      initialVisitRef.current = { status: 'planned', visit_products: [] };
      setLoading(false);
    }

    isInitialized.current = true;

  }, [id, user, location.state, fetchVisitData, fetchDataForDropdowns, profile?.org_id]);

  const handleVisitChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'customer_id') {
      const customerId = value ? Number(value) : null;
      const selectedCustomer = customers.find(c => c.id === customerId);
      setVisit(prev => ({ ...prev, customer_id: customerId || undefined, customers: selectedCustomer || null }));
    } else {
      setVisit(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleStartTimeChange = (date: Date | null) => {
    setStartTime(date);
    if (date) {
      const newEndTime = new Date(date.getTime() + 60 * 60 * 1000); // Keep 1 hour duration
      setEndTime(newEndTime);
    }
  };
  
  const addProductsFromModal = (selectedProducts: Product[]) => {
    setItems(prevItems => {
      const newItems = [...prevItems]; // Create a mutable copy
      const existingProductIds = new Map<number, number>();
      newItems.forEach((item, index) => {
        if (item.product_id) {
            existingProductIds.set(item.product_id, index);
        }
      });

      selectedProducts.forEach(product => {
        if (product.id && existingProductIds.has(product.id)) {
          // Product already exists, increment quantity
          const existingItemIndex = existingProductIds.get(product.id)!;
          const existingItem = newItems[existingItemIndex];
          newItems[existingItemIndex] = {
            ...existingItem,
            quantity: (existingItem.quantity || 0) + 1,
          };
        } else {
          // Product is new, add it as a new line item
          newItems.push({
            product_id: product.id,
            description: product.name,
            quantity: 1,
            unit_price: product.selling_price,
            products: product,
          });
        }
      });
      // The filter is important to remove any blank "manual" lines.
      return newItems.filter(item => item.product_id || item.expense_id || (item.description && item.description.trim() !== ''));
    });
    setIsProductModalOpen(false);
  };
    
  const addExpensesFromModal = (selectedExpenses: Expense[]) => {
    const newItems: VisitEditorItem[] = selectedExpenses.map(e => ({ expense_id: e.id, description: e.description, quantity: 1, unit_price: e.amount, expenses: e }));
    const existingExpenseIds = new Set(items.map(e => e.expense_id));
    const uniqueNewItems = newItems.filter(item => !existingExpenseIds.has(item.expense_id));
    setItems(prev => [...prev, ...uniqueNewItems]);
    setIsExpenseModalOpen(false);
  };
  
    const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
    const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

    const handleItemChange = (index: number, field: keyof VisitEditorItem, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        
        if (field === 'quantity') {
          const numericValue = Number(value);
          (item as any)[field] = isNaN(numericValue) ? undefined : numericValue;
        } else {
          (item as any)[field] = value;
        }
        newItems[index] = item;
        setItems(newItems);
    };

    const handleInsertTextBlock = (content: string) => {
        const numericCustomerId = visit.customer_id ? Number(visit.customer_id) : undefined;
        const context = {
            customer: customers.find(c => c.id === numericCustomerId),
            document: {
                ...visit,
                number: visit.visit_number,
                date: startTime,
            },
            user: profile,
            organization: visit.organizations,
        };
        const resolvedContent = resolvePlaceholders(content, context);
        setVisit(prev => ({
            ...prev,
            purpose: prev.purpose ? `${prev.purpose}\n\n${resolvedContent}` : resolvedContent
        }));
        setIsTextBlockModalOpen(false);
    };

  const handleStockUpdate = async (savedVisit: Visit, finalProducts: Partial<VisitProduct>[]) => {
    const initial = initialVisitRef.current;
    if (!initial) return;

    const stockRelevantStatuses: VisitStatus[] = ['planned', 'completed'];
    const wasActive = stockRelevantStatuses.includes(initial.status as VisitStatus);
    const isNowActive = stockRelevantStatuses.includes(savedVisit.status as VisitStatus);

    if (!wasActive && !isNowActive) return;

    const initialItemsMap = new Map(((initial.visit_products || []) as Partial<VisitProduct>[]).filter(p => p.product_id).map(p => [p.product_id, Number(p.quantity ?? 0)]));
    const finalItemsMap = new Map(finalProducts.filter(p => p.product_id).map(p => [p.product_id, Number(p.quantity ?? 0)]));

    const allProductIds = new Set([...initialItemsMap.keys(), ...finalItemsMap.keys()]);
    const stockUpdates: { product_id: number; quantity_delta: number }[] = [];

    allProductIds.forEach(productId => {
        if(!productId) return;
        const initialQty = initialItemsMap.get(productId) || 0;
        const finalQty = finalItemsMap.get(productId) || 0;
        const reservedInitial = wasActive ? initialQty : 0;
        const reservedFinal = isNowActive ? finalQty : 0;
        const delta = reservedFinal - reservedInitial;
        if (delta !== 0) {
            stockUpdates.push({ product_id: productId, quantity_delta: delta });
        }
    });

    if (stockUpdates.length > 0) {
        const { error } = await supabase.rpc('update_stock_levels', { updates: stockUpdates });
        if (error) {
            console.error("Stock update failed:", error);
            addToast({ type: 'error', title: 'Stock Update Failed', body: error.message });
        }
    }
  };

  const handleSave = async () => {
    if (!user || !profile?.org_id || !visit.customer_id) {
      addToast({ type: 'error', title: 'Error', body: "Please select a customer." });
      return;
    }
    setIsSaving(true);
    
    const { customers, profiles, visit_products, visit_expenses, organizations, ...baseVisitData } = visit;
    const isNewVisit = !id || id === 'new';

    if (!startTime || !endTime) {
        addToast({ type: 'error', title: 'Error', body: 'Please enter a valid start and end time.' });
        setIsSaving(false);
        return;
    }

    const dataToSave = {
        ...baseVisitData,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
    };
    
    try {
      let savedVisit: Visit;
      
      if (isNewVisit) {
        const visitNumber = await generateNextNumber(profile.org_id, 'visit');
        const { data, error } = await supabase.from('visits').insert({ ...dataToSave, user_id: user.id, org_id: profile.org_id, visit_number: visitNumber }).select().single();
        if (error) throw error;
        savedVisit = data;
      } else {
        const { data, error } = await supabase.from('visits').update(dataToSave).eq('id', parseInt(id)).select().single();
        if (error) throw error;
        savedVisit = data;
      }
      
      const productsToSave = items.filter(item => item.product_id).map(p => ({ visit_id: savedVisit.id, product_id: p.product_id!, quantity: p.quantity!, unit_price: p.products?.selling_price || 0 }));
      const expensesToSave = items.filter(item => item.expense_id).map(e => ({ visit_id: savedVisit.id, expense_id: e.expense_id! }));

      await supabase.from('visit_products').delete().eq('visit_id', savedVisit.id);
      if (productsToSave.length > 0) {
          const { error } = await supabase.from('visit_products').insert(productsToSave);
          if (error) throw new Error('Failed to save products: ' + error.message);
      }
      
      await supabase.from('visit_expenses').delete().eq('visit_id', savedVisit.id);
      if (expensesToSave.length > 0) {
          const { error } = await supabase.from('visit_expenses').insert(expensesToSave);
          if (error) throw new Error('Failed to save expenses: ' + error.message);
      }
      
      await handleStockUpdate(savedVisit, productsToSave);
      
      if (savedVisit.assigned_employee_id && savedVisit.assigned_employee_id !== user.id) {
        await createNotification({
            user_id: savedVisit.assigned_employee_id,
            org_id: profile.org_id,
            title: 'newVisitAssigned',
            body: JSON.stringify({
              key: 'youveBeenAssignedVisitBy',
              params: {
                visitNumber: savedVisit.visit_number,
                userName: profile.full_name,
              },
            }),
            type: 'new_visit',
            related_entity_path: `/visits/edit/${savedVisit.id}`,
            related_entity_id: savedVisit.id.toString(),
        });
      }

      if (isNewVisit) {
        supabase.functions.invoke('send-visit-reminder', {
            body: { visit_id: savedVisit.id, user_id: user.id },
        }).then(({ error }) => {
            if (error) {
                console.error("Visit reminder trigger failed:", error);
            }
        });
      }

      addToast({ type: 'success', title: 'Success', body: 'Visit saved successfully!' });
      
      triggerRefresh();
      
      if (isNewVisit) {
        replaceTab(instancePath, { path: `/visits/edit/${savedVisit.id}`, label: savedVisit.visit_number });
      } else {
        await fetchVisitData();
      }

    } catch (error: any) {
      addToast({ type: 'error', title: 'Error', body: 'Error saving visit: ' + error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!profile || !user || !visit || !visit.id || !visit.customer_id) {
        addToast({ type: 'error', title: 'Error', body: 'Missing required visit or user data.' });
        return;
    }
    setIsCreatingInvoice(true);

    try {
        const newInvoiceNumber = await generateNextNumber(profile.org_id, 'invoice');
        const today = new Date();
        const dueDate = new Date();
        dueDate.setDate(today.getDate() + 14);

        const newInvoiceItems = items.map(item => {
            let unit_price = 0;
            if (item.product_id && item.products) {
                unit_price = item.products.selling_price;
            } else if (item.expense_id && item.expenses) {
                unit_price = item.expenses.amount;
            } else {
                unit_price = item.unit_price || 0;
            }
            return {
                product_id: item.product_id, expense_id: item.expense_id,
                description: item.description || '', quantity: item.quantity || 1,
                unit_price: unit_price, vat_rate: 19,
            };
        });

        const totalAmount = newInvoiceItems.reduce((acc, item) => {
            const itemTotal = item.quantity * item.unit_price;
            const vatAmount = itemTotal * (item.vat_rate / 100);
            return acc + itemTotal + vatAmount;
        }, 0);

        const newInvoiceData = {
            user_id: user.id, org_id: profile.org_id, customer_id: visit.customer_id,
            visit_id: visit.id, invoice_number: newInvoiceNumber,
            issue_date: today.toISOString().split('T')[0],
            due_date: dueDate.toISOString().split('T')[0],
            total_amount: totalAmount, status: 'draft' as InvoiceStatus,
            internal_notes: `Created from Visit #${visit.visit_number}`,
        };

        const { data: createdInvoice, error: invoiceInsertError } = await supabase.from('invoices').insert(newInvoiceData).select().single();
        if (invoiceInsertError) throw invoiceInsertError;

        const itemsToInsert = newInvoiceItems.map(item => ({ ...item, invoice_id: createdInvoice.id }));

        if (itemsToInsert.length > 0) {
            const { error: itemsInsertError } = await supabase.from('invoice_items').insert(itemsToInsert);
            if (itemsInsertError) {
                await supabase.from('invoices').delete().eq('id', createdInvoice.id);
                throw itemsInsertError;
            }
        }

        addToast({ type: 'success', title: 'Invoice Created', body: `Invoice #${newInvoiceNumber} created.` });
        openTab({ path: `/invoices/edit/${createdInvoice.id}`, label: createdInvoice.invoice_number });
        setIsInvoiceCreated(true);

    } catch (error: any) {
        addToast({ type: 'error', title: 'Conversion Failed', body: error.message });
        console.error('Failed to create invoice from visit:', error);
    } finally {
        setIsCreatingInvoice(false);
    }
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleSaveSignature = async (dataUrl: string) => {
    if (!profile?.org_id || !visit?.id) {
      addToast({ type: 'error', title: 'Error', body: 'Cannot save signature without organization or visit ID.' });
      return;
    }
    setIsSaving(true);
    try {
      const blob = dataURLtoBlob(dataUrl);
      if (!blob) throw new Error("Could not convert signature to a file.");
      const filePath = `${profile.org_id}/${visit.id}/signature_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('signatures').upload(filePath, blob);
      if (uploadError) throw uploadError;
      
      const signatureDate = new Date().toISOString();

      // Automatically save all pending changes along with the signature
      const { customers, profiles, visit_products, visit_expenses, organizations, ...baseVisitData } = visit;
      const dataToSave = {
          ...baseVisitData,
          start_time: startTime!.toISOString(),
          end_time: endTime!.toISOString(),
          signature_storage_path: filePath,
          signature_date: signatureDate
      };
      
      const { data: savedVisit, error: visitUpdateError } = await supabase.from('visits').update(dataToSave).eq('id', visit.id!).select().single();
      if (visitUpdateError) throw visitUpdateError;

      const productsToSave = items.filter(item => item.product_id).map(p => ({ visit_id: savedVisit.id, product_id: p.product_id!, quantity: p.quantity!, unit_price: p.products?.selling_price || 0 }));
      const expensesToSave = items.filter(item => item.expense_id).map(e => ({ visit_id: savedVisit.id, expense_id: e.expense_id! }));

      await supabase.from('visit_products').delete().eq('visit_id', savedVisit.id);
      if (productsToSave.length > 0) {
          const { error } = await supabase.from('visit_products').insert(productsToSave);
          if (error) throw new Error('Failed to save products: ' + error.message);
      }
      
      await supabase.from('visit_expenses').delete().eq('visit_id', savedVisit.id);
      if (expensesToSave.length > 0) {
          const { error } = await supabase.from('visit_expenses').insert(expensesToSave);
          if (error) throw new Error('Failed to save expenses: ' + error.message);
      }
      
      await handleStockUpdate(savedVisit, productsToSave);
      
      addToast({ type: 'success', title: 'Success', body: 'Signature saved and visit finalized.' });
      await fetchVisitData(); // Refetch all data to be sure
      
    } catch (error: any) {
      addToast({ type: 'error', title: 'Error Saving Signature', body: error.message });
    } finally {
      setIsSignatureModalOpen(false);
      setIsSaving(false);
    }
  };

  const handleSendReminder = async () => {
    if (!id || id === 'new' || !user?.id) {
        addToast({ title: 'Cannot Send', body: 'Please save the visit first.', type: 'error' });
        return;
    }
    setIsSendingReminder(true);
    try {
        const { error } = await supabase.functions.invoke('send-visit-reminder', {
            body: { visit_id: parseInt(id), user_id: user.id },
        });

        if (error) {
             const functionError = (error as any).context?.json?.error;
             if (functionError) throw new Error(functionError);
             throw error;
        }
        
        addToast({ title: 'Reminder Sent', body: 'The visit reminder email has been sent successfully.', type: 'success' });
        await fetchVisitData();

    } catch (err: any) {
        console.error("Failed to send reminder:", err);
        addToast({ title: "Send Failed", body: err.message, type: 'error' });
    } finally {
        setIsSendingReminder(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!visit?.id) return;
    setIsGeneratingPdf(true);
    try {
        await generateVisitSummaryPDF(visit.id, language, 'download');
    } catch (error: any) {
        addToast({ type: 'error', title: 'PDF Error', body: error.message });
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  const handleSendSummary = async () => {
    if (!visit?.id || !visit.customers?.email) {
        addToast({ title: 'Cannot Send', body: 'Missing visit ID or customer email.', type: 'error'});
        return;
    }
    setIsSendingSummary(true);
    try {
        const pdfBlob = await generateVisitSummaryPDF(visit.id, language, 'blob');
        if (!pdfBlob) throw new Error("Failed to generate PDF blob.");

        const pdfBase64 = await blobToBase64(pdfBlob);

        const { error } = await supabase.functions.invoke('send-visit-summary', {
            body: {
                visit_id: visit.id,
                pdf_base_64: pdfBase64,
            },
        });

        if (error) {
            const functionError = (error as any).context?.json?.error;
            throw new Error(functionError || error.message);
        }
        
        addToast({ title: "Summary Sent", body: `The visit summary was sent to ${visit.customers.email}.`, type: 'success' });
        await fetchVisitData();

    } catch (err: any) {
        console.error("Failed to send summary:", err);
        addToast({ title: "Send Failed", body: err.message, type: 'error' });
    } finally {
        setIsSendingSummary(false);
    }
  };
  
  const handleCloseEditor = () => {
    closeTab(instancePath);
  };

  const EmailHistory: React.FC<{ logs: EmailLog[] }> = ({ logs }) => {
    if (logs.length === 0) {
      return (
        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <h2 className="text-xl font-bold mb-4">{t('emailHistory')}</h2>
          <p className="text-sm text-gray-500">{t('noEmailsSentForVisit')}</p>
        </div>
      );
    }
  
    return (
      <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">{t('emailHistory')}</h2>
        <ul className="space-y-4">
          {logs.map(log => (
            <li key={log.id} className="flex items-start space-x-3">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-full p-2 mt-1">
                <EnvelopeIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{log.subject}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('sentBy')} {log.sent_by?.full_name || t('system')} on {formatEuropeanDate(log.created_at)} {t('at')} {formatEuropeanTime(log.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (loading) return <div className="text-center p-8">Loading...</div>;
  
  const visitCategories: VisitCategory[] = ['Maintenance', 'Repair', 'Consulting', 'Training'];
  const visitStatuses: VisitStatus[] = ['planned', 'completed', 'cancelled'];
  const canSendSummary = visit.organizations?.is_email_sending_enabled;

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
           <button onClick={handleCloseEditor} className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeftIcon className="w-4 h-4 mr-2" /> {t('back')}
          </button>
          <h1 className="text-3xl font-bold">{id && id !== 'new' ? `${t('visitDetails')} ${visit.visit_number || ''}` : t('newVisit')}</h1>
        </div>
        <div className="flex items-center gap-x-2 flex-wrap">
            {!isReadOnly && <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
              {isSaving ? t('saving') : t('save')}
            </button>}
            {visit.status === 'completed' && visit.signature_storage_path && !isInvoiceCreated && (
              <button
                onClick={handleCreateInvoice}
                disabled={isCreatingInvoice}
                className="px-4 py-2 text-white bg-green-600 rounded-md font-medium hover:bg-green-700 disabled:bg-green-300 flex items-center gap-x-2"
              >
                <DocumentTextIcon className="w-5 h-5"/>
                <span>{isCreatingInvoice ? t('processing') : t('createFollowUpInvoice')}</span>
              </button>
            )}
            {id && id !== 'new' && visit.organizations?.is_visit_reminder_enabled && !isReadOnly && (
              <button
                onClick={handleSendReminder}
                disabled={isSendingReminder}
                className="px-4 py-2 text-white bg-blue-600 rounded-md font-medium hover:bg-blue-700 disabled:bg-blue-300 flex items-center gap-x-2"
              >
                <EnvelopeIcon className="w-5 h-5"/>
                <span>{isSendingReminder ? t('sending') : t('sendReminder')}</span>
              </button>
            )}
            {visit.status === 'completed' && visit.signature_storage_path && (
                <>
                <button onClick={handleGenerateSummary} disabled={isGeneratingPdf} className="px-4 py-2 text-white bg-gray-600 rounded-md font-medium hover:bg-gray-700 disabled:bg-gray-400 flex items-center gap-x-2">
                    <ArrowDownTrayIcon className="w-5 h-5"/>
                    <span>{isGeneratingPdf ? t('generating') : t('visitSummaryPDF')}</span>
                </button>
                {canSendSummary && (
                    <button onClick={handleSendSummary} disabled={isSendingSummary} className="px-4 py-2 text-white bg-gray-600 rounded-md font-medium hover:bg-gray-700 disabled:bg-gray-400 flex items-center gap-x-2">
                        <EnvelopeIcon className="w-5 h-5"/>
                        <span>{isSendingSummary ? t('sending') : t('sendSummary')}</span>
                    </button>
                )}
                </>
            )}
            <button onClick={handleCloseEditor} className="px-6 py-2 bg-gray-200 rounded-md font-medium hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">
                {isReadOnly ? t('back') : t('cancel')}
            </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="p-4 bg-blue-100 border-l-4 border-blue-500 rounded-r-lg dark:bg-blue-900/50">
            <div className="flex">
                <div className="flex-shrink-0">
                    <InformationCircleIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="ml-3">
                    <p className="text-sm text-blue-700 dark:text-blue-200">
                        {t('visitCompletedAndSigned')}
                    </p>
                </div>
            </div>
        </div>
      )}

      <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div>
                <label className="block text-sm font-medium">{t('customers')}</label>
                <select name="customer_id" value={visit.customer_id || ''} onChange={handleVisitChange} required disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
                  <option value="">Select a customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option>)}
                </select>
            </div>
             <div className="mt-1">
                <label className="block text-sm font-medium">{t('startTime')}</label>
                <DatePicker selected={startTime} onChange={handleStartTimeChange} showTimeSelect disabled={isReadOnly} />
            </div>
             <div className="mt-1">
                <label className="block text-sm font-medium">{t('endTime')}</label>
                <DatePicker selected={endTime} onChange={setEndTime} showTimeSelect disabled={isReadOnly} />
            </div>
             <div>
                <label className="block text-sm font-medium">{t('location')}</label>
                <input type="text" name="location" value={visit.location || ''} onChange={handleVisitChange} required readOnly={isReadOnly} placeholder={t('egCustomerAddress')} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('category')}</label>
                <select name="category" value={visit.category} onChange={handleVisitChange} disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 capitalize disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
                    {visitCategories.map(c => <option key={c} value={c}>{t(c.toLowerCase() as any)}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('assignedEmployee')}</label>
                <select name="assigned_employee_id" value={visit.assigned_employee_id || ''} onChange={handleVisitChange} disabled={!canManageAssignee || isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
                    <option value="">Unassigned</option>
                    {canManageAssignee ? employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.email}</option>) : <option value={user?.id}>Me</option>}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium">{t('status')}</label>
                <select name="status" value={visit.status} onChange={handleVisitChange} disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 capitalize disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
                    {visitStatuses.map(s => <option key={s} value={s}>{t(s)}</option>)}
                </select>
            </div>
             <div className="md:col-span-2">
                <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium">{t('purpose')}</label>
                    {textBlocksEnabled && !isReadOnly && (
                        <button onClick={() => setIsTextBlockModalOpen(true)} className="flex items-center gap-x-1 px-2 py-1 text-xs font-medium text-primary-600 bg-primary-100 rounded-md hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-900">
                            <TextBlockIcon className="w-4 h-4"/> {t('insertTextBlock')}
                        </button>
                    )}
                </div>
                <textarea name="purpose" value={visit.purpose || ''} onChange={handleVisitChange} readOnly={isReadOnly} rows={3} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"></textarea>
            </div>
            <div className="md:col-span-3">
                <label className="block text-sm font-medium">{t('internalVisitNotes')}</label>
                <textarea name="internal_notes" value={visit.internal_notes || ''} onChange={handleVisitChange} readOnly={isReadOnly} rows={3} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"></textarea>
            </div>
          </div>
      </div>
      
      {id && id !== 'new' && <EmailHistory logs={emailLogs} />}

      <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4">{t('items')}</h2>
        <div className="overflow-x-auto -mx-6">
            <table className="min-w-full">
            <thead className="border-b dark:border-gray-700"><tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                <th className="px-6 py-2 w-[70%]">{t('description')}</th>
                <th className="px-6 py-2 w-28">{t('quantity')}</th>
                <th className="w-10 px-6"></th>
            </tr></thead>
            <tbody>{items.map((item, index) => {
                const isExpense = !!item.expense_id;
                return (
                    <tr key={index} className="border-b dark:border-gray-700">
                        <td className="px-6 py-2">
                            <div className="flex items-center">
                                {isExpense && <CurrencyDollarIcon className="w-4 h-4 mr-2 text-gray-400" title="Expense"/>}
                                <input type="text" value={item.description || ''} onChange={(e) => handleItemChange(index, 'description', e.target.value)} readOnly={isExpense || isReadOnly} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/>
                            </div>
                        </td>
                        <td className="px-6 py-2">
                            <input type="number" value={item.quantity || ''} onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))} readOnly={isExpense || isReadOnly} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/>
                        </td>
                        <td className="px-6">
                            {!isReadOnly && <button onClick={() => removeItem(index)}><TrashIcon className="w-5 h-5 text-red-500"/></button>}
                        </td>
                    </tr>
                );
            })}</tbody>
            </table>
        </div>
        {!isReadOnly && <div className="flex space-x-2 mt-4">
            <button onClick={() => setIsProductModalOpen(true)} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm">{t('addProduct')}</button>
            <button onClick={() => setIsExpenseModalOpen(true)} className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 text-sm">{t('addExpense')}</button>
            <button onClick={addItem} className="px-4 py-2 bg-gray-200 rounded-md dark:bg-gray-600 text-sm">{t('addItem')}</button>
        </div>}
      </div>

      {visit.status === 'completed' && (
        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <h2 className="text-xl font-bold mb-4">{t('proofOfCompletion')}</h2>
          {signatureUrl ? (
            <div>
              <p className="text-sm text-gray-500 mb-2">{t('customerSignature')}:</p>
              <div className="inline-block border rounded-md dark:border-gray-600 bg-white p-2">
                <img src={signatureUrl} alt={t('customerSignature')} style={{ height: '80px' }} />
              </div>
              <div className="mt-2" style={{ maxWidth: '250px' }}>
                <div className="w-full h-px bg-gray-400 dark:bg-gray-600 my-1"></div>
                <p className="text-sm text-gray-800 dark:text-gray-200">{visit.customers?.name}</p>
                {visit.signature_date && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('date')}: {formatEuropeanDate(visit.signature_date)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 border-2 border-dashed rounded-lg">
              <p className="text-gray-500 mb-4">{t('noSignatureCaptured')}</p>
              <button
                onClick={() => setIsSignatureModalOpen(true)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700"
              >
                <SignatureIcon className="w-5 h-5 mr-2" /> {t('getSignature')}
              </button>
            </div>
          )}
        </div>
      )}
      
      <ProductSelectionModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} onAdd={addProductsFromModal} context="visit" />
      <ExpenseSelectionModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onAdd={addExpensesFromModal} onAddNew={openExpenseModal} context="visit" />
      {isTextBlockModalOpen && <TextBlockSelectionModal isOpen={isTextBlockModalOpen} onClose={() => setIsTextBlockModalOpen(false)} onSelect={handleInsertTextBlock} documentType="visit" />}
      {isSignatureModalOpen && <SignatureModal onClose={() => setIsSignatureModalOpen(false)} onSave={handleSaveSignature} />}
    </div>
    </>
  );
};

export default VisitEditor;