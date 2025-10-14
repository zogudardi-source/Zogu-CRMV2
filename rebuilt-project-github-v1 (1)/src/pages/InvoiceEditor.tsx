import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTabs } from '../contexts/TabContext';
import { useModal } from '../contexts/ModalContext';
import { Customer, Product, Invoice, InvoiceItem, InvoiceStatus, EmailLog, Expense } from '../types';
import { GERMAN_VAT_RATES } from '../constants';
import { generateNextNumber } from '../lib/numberGenerator';
import generateDocumentPDF from '../lib/pdfGenerator';
import { PlusIcon, TrashIcon, ArrowDownTrayIcon, EllipsisVerticalIcon, ArrowLeftIcon, EnvelopeIcon, DocumentDuplicateIcon, LinkIcon, CreditCardIcon, InformationCircleIcon, CurrencyDollarIcon, DocumentTextIcon as TextBlockIcon } from '@heroicons/react/24/outline';
import CustomerModal from '../components/modals/CustomerModal';
import ProductSelectionModal from '../components/modals/ProductSelectionModal';
import ExpenseSelectionModal from '../components/modals/ExpenseSelectionModal';
import TextBlockSelectionModal from '../components/modals/TextBlockSelectionModal';
import DatePicker from '../components/ui/DatePicker';
import { format } from 'date-fns';
import { parseAsLocalDate, formatEuropeanDate, formatEuropeanTime, resolvePlaceholders } from '../lib/formatting';
import { useNotifications } from '../contexts/NotificationContext';
import ConfirmModal from '../components/modals/ConfirmModal';

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

const InvoiceEditor: React.FC = () => {
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const { closeTab, updateTabLabel, replaceTab } = useTabs();
  const { addToast } = useNotifications();
  const { openExpenseModal } = useModal();

  const id = params.id;
  const [instancePath] = useState(location.pathname);
  const isInitialized = useRef(false);
  const initialInvoiceRef = useRef<Partial<Invoice> & { invoice_items?: Partial<InvoiceItem>[] } | null>(null);

  const [invoice, setInvoice] = useState<Partial<Invoice>>({
    issue_date: new Date().toISOString(),
    due_date: new Date(new Date().setDate(new Date().getDate() + 14)).toISOString(),
    status: 'draft',
    customer_id: undefined,
  });
  const [items, setItems] = useState<Partial<InvoiceItem>[]>([{ description: '', quantity: 1, unit_price: 0, vat_rate: 19 }]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isFetchingReceipt, setIsFetchingReceipt] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isTextBlockModalOpen, setIsTextBlockModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmSendMailOpen, setIsConfirmSendMailOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isReadOnly = profile?.role === 'field_service_employee' || invoice.status === 'paid';
  const canSave = !isReadOnly;
  const paymentGatewayEnabled = invoice.organizations?.is_payment_gateway_enabled && !!invoice.organizations?.stripe_account_id;
  const emailSendingEnabled = invoice.organizations?.is_email_sending_enabled;
  const textBlocksEnabled = invoice.organizations?.is_text_blocks_enabled;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  const fetchData = useCallback(async () => {
    if (!id || id === 'new' || !profile) return;
    setLoading(true);

    const invoiceId = parseInt(id, 10);
    if (isNaN(invoiceId)) {
      console.error("Invalid invoice ID from URL:", id);
      navigate('/invoices');
      return;
    }

    let query = supabase
      .from('invoices')
      .select('*, invoice_items:invoice_items!left(*), customers:customers!left(*), organizations:org_id(*)')
      .eq('id', invoiceId);
      
    if (profile.role !== 'super_admin' && profile.org_id) {
        query = query.eq('org_id', profile.org_id);
    }

    const { data: dataRows, error } = await query;

    if (error || !dataRows || dataRows.length === 0) {
      console.error('Error fetching invoice: Not found or access denied. Potential cause: RLS policy or invalid ID.', { id, error });
      navigate('/invoices');
      return;
    }

    const firstRow = dataRows[0];
    const allItems = dataRows.map(row => row.invoice_items).flat().filter(Boolean);
    const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
    
    const { invoice_items, ...invoiceDataWithJoins } = firstRow;

    const fetchedInvoice = { ...invoiceDataWithJoins, invoice_items: uniqueItems };
    initialInvoiceRef.current = JSON.parse(JSON.stringify(fetchedInvoice));

    setInvoice(fetchedInvoice);
    setItems(uniqueItems);
    updateTabLabel(instancePath, invoiceDataWithJoins.invoice_number);

    const { data: emailLogsData } = await supabase
        .from('email_logs')
        .select('*, sent_by:sent_by_user_id!left(full_name)')
        .eq('related_document_id', id)
        .eq('document_type', 'invoice')
        .order('created_at', { ascending: false });
    
    setEmailLogs(emailLogsData || []);

    setLoading(false);
  }, [id, profile, navigate, instancePath, updateTabLabel]);


  const fetchCustomersAndProducts = useCallback(async () => {
    if (!profile) return;
    
    let query = supabase.from('customers').select('*');
    if (profile.role !== 'super_admin') {
        query = query.eq('org_id', profile.org_id);
    }

    const { data: customerData } = await query;
    setCustomers(customerData || []);
  }, [profile]);

  useEffect(() => {
    if (isInitialized.current) {
      return;
    }

    fetchCustomersAndProducts();
    if (id && id !== 'new') {
      fetchData();
    } else {
      const state = location.state as { customerId?: number } | null;
      if (state?.customerId) {
          setInvoice(inv => ({ ...inv, customer_id: state.customerId }));
      }
      if (profile?.org_id) {
          supabase.from('organizations').select('*').eq('id', profile.org_id).single()
          .then(({ data: orgData }) => {
              if (orgData) {
                  setInvoice(prev => ({ ...prev, organizations: orgData }));
              }
          });
      }
      initialInvoiceRef.current = { status: 'draft', invoice_items: [] };
      setLoading(false);
    }
    
    isInitialized.current = true;

  }, [id, fetchCustomersAndProducts, fetchData, location.state, profile?.org_id]);

  useEffect(() => {
    if (!isReadOnly) {
        const newTotal = items.reduce((acc, item) => {
            const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
            const vatAmount = itemTotal * ((item.vat_rate || 0) / 100);
            return acc + itemTotal + vatAmount;
        }, 0);
        setInvoice(inv => ({...inv, total_amount: newTotal }));
    }
  }, [items, isReadOnly]);


  const handleInvoiceChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setInvoice({ ...invoice, [e.target.name]: e.target.value });
  };
  
  const handleDateChange = (name: 'issue_date' | 'due_date', date: Date | null) => {
    if (date) {
        setInvoice({ ...invoice, [name]: date.toISOString() });
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    if (field === 'quantity' || field === 'unit_price' || field === 'vat_rate') {
      const numericValue = Number(value);
      (item as any)[field] = isNaN(numericValue) ? undefined : numericValue;
    } else {
      (item as any)[field] = value;
    }
    newItems[index] = item;
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0, vat_rate: 19 }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  
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
            vat_rate: 19, // default VAT
          });
        }
      });

      // Filter out any blank lines that might exist before returning.
      return newItems.filter(item => item.product_id || item.expense_id || (item.description && item.description.trim() !== ''));
    });
    setIsProductModalOpen(false);
  };

  const addExpensesFromModal = (selectedExpenses: Expense[]) => {
    const newItems = selectedExpenses.map(e => ({
      expense_id: e.id,
      description: e.description,
      quantity: 1,
      unit_price: e.amount,
      vat_rate: 19, // Default VAT, user can change.
    }));
    const existingExpenseIds = new Set(items.filter(i => i.expense_id).map(i => i.expense_id));
    const uniqueNewItems = newItems.filter(item => !existingExpenseIds.has(item.expense_id));
    setItems(prev => [...prev.filter(i => i.description || i.product_id || i.expense_id), ...uniqueNewItems]);
    setIsExpenseModalOpen(false);
  };

  const handleInsertTextBlock = (content: string) => {
    const numericCustomerId = invoice.customer_id ? Number(invoice.customer_id) : undefined;
    const context = {
        customer: customers.find(c => c.id === numericCustomerId),
        document: {
            ...invoice,
            number: invoice.invoice_number,
            date: invoice.issue_date,
            total: invoice.total_amount
        },
        user: profile,
        organization: invoice.organizations,
    };
    const resolvedContent = resolvePlaceholders(content, context);
    setInvoice(prev => ({
        ...prev,
        customer_notes: prev.customer_notes ? `${prev.customer_notes}\n\n${resolvedContent}` : resolvedContent
    }));
    setIsTextBlockModalOpen(false);
  };
  
  const handleCloseEditor = () => {
    closeTab(instancePath);
  };
  
  const handleStockUpdate = async (savedInvoice: Invoice, finalItems: Partial<InvoiceItem>[]) => {
    const initial = initialInvoiceRef.current;
    if (!initial) return;

    const stockRelevantStatuses: InvoiceStatus[] = ['sent', 'overdue', 'paid'];
    const wasActive = stockRelevantStatuses.includes(initial.status as InvoiceStatus);
    const isNowActive = stockRelevantStatuses.includes(savedInvoice.status as InvoiceStatus);

    if (!wasActive && !isNowActive) return; // No change in stock reservation status

    // Fix: Cast initial items array to restore type info lost from JSON.parse and ensure quantity is treated as a number.
    const initialItemsMap = new Map(((initial.invoice_items || []) as Partial<InvoiceItem>[]).filter(i => i.product_id).map(i => [i.product_id, Number(i.quantity ?? 0)]));
    const finalItemsMap = new Map(finalItems.filter(i => i.product_id).map(i => [i.product_id, Number(i.quantity ?? 0)]));

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
    if (!canSave || !user || !profile?.org_id || !invoice.customer_id) {
      addToast({ title: 'Cannot save', body: t('pleaseSelectCustomer'), type: 'error' });
      return;
    }
    setIsSaving(true);
    
    const { customers, invoice_items, organizations, ...invoiceDataToSave } = invoice;
    const isNewInvoice = !id || id === 'new';

    const issueDate = parseAsLocalDate(invoiceDataToSave.issue_date);
    const dueDate = parseAsLocalDate(invoiceDataToSave.due_date);

    if (!issueDate || !dueDate) {
        addToast({ title: 'Cannot save', body: 'Issue date and due date are required.', type: 'error' });
        setIsSaving(false);
        return;
    }

    const issueDateISO = format(issueDate, 'yyyy-MM-dd');
    const dueDateISO = format(dueDate, 'yyyy-MM-dd');

    try {
      let savedInvoice: Invoice & { invoice_items: Partial<InvoiceItem>[] };

      if (isNewInvoice) {
        const invoiceNumber = await generateNextNumber(profile.org_id, 'invoice');
        const { data, error } = await supabase.from('invoices').insert({
          ...invoiceDataToSave, 
          issue_date: issueDateISO,
          due_date: dueDateISO,
          user_id: user.id, 
          org_id: profile.org_id, 
          invoice_number: invoiceNumber,
        }).select().single();
        if (error) throw error;
        savedInvoice = { ...data, invoice_items: [] };
      } else {
        const { data, error } = await supabase.from('invoices').update({
          ...invoiceDataToSave,
          issue_date: issueDateISO,
          due_date: dueDateISO,
        }).eq('id', parseInt(id)).select().single();
        if (error) throw error;
        savedInvoice = { ...data, invoice_items: [] };
      }
      
      const itemsToSave = items.map(item => ({ ...item, invoice_id: savedInvoice.id }));
      await supabase.from('invoice_items').delete().eq('invoice_id', savedInvoice.id);
      if(itemsToSave.length > 0) {
        const { data: savedItems, error: itemsError } = await supabase.from('invoice_items').insert(itemsToSave.map(({ id, ...rest }) => rest)).select();
        if (itemsError) throw itemsError;
        savedInvoice.invoice_items = savedItems;
      }

      await handleStockUpdate(savedInvoice, items);

      // Auto-generate payment link on status change to 'sent'
      const wasPreviouslySent = ['sent', 'paid', 'overdue'].includes(initialInvoiceRef.current?.status as string);
      const isNowSent = savedInvoice.status === 'sent';

      if (paymentGatewayEnabled && !wasPreviouslySent && isNowSent && !savedInvoice.payment_link_url) {
          try {
              addToast({ title: t('copyPaymentLink'), body: t('processing'), type: 'info' });
              const { data: linkData, error: functionError } = await supabase.functions.invoke('create-invoice-payment-link', {
                  body: { invoice_id: savedInvoice.id },
              });
              if (functionError) throw functionError;
              
              const paymentUrl = linkData.url;
              if (paymentUrl) {
                  const { error: updateError } = await supabase.from('invoices').update({ payment_link_url: paymentUrl }).eq('id', savedInvoice.id);
                  if (updateError) throw updateError;
                  
                  setInvoice(prev => ({ ...prev, payment_link_url: paymentUrl }));
                  addToast({ title: 'Success', body: 'Payment link generated and saved.', type: 'success'});
              } else {
                  throw new Error("Function did not return a URL.");
              }
          } catch (linkError: any) {
              let errorMessage = "Could not auto-generate payment link";
              if (linkError.context?.json?.error) errorMessage += `: ${linkError.context.json.error}`;
              else if (linkError.message) errorMessage += `: ${linkError.message}`;
              addToast({ title: 'Payment Link Failed', body: errorMessage, type: 'error'});
          }
      }

      addToast({ title: 'Success', body: t('invoiceSavedSuccess'), type: 'success' });

      if (isNewInvoice) {
        replaceTab(instancePath, {
          path: `/invoices/edit/${savedInvoice.id}`,
          label: savedInvoice.invoice_number,
        });
      } else {
        fetchData();
      }
    } catch (error: any) {
      addToast({ title: 'Save Error', body: `Error saving invoice: ${error.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    const vatTotals: { [key: number]: number } = {};
    items.forEach(item => {
      const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
      subtotal += itemTotal;
      const vatRate = item.vat_rate || 0;
      const vatAmount = itemTotal * (vatRate / 100);
      vatTotals[vatRate] = (vatTotals[vatRate] || 0) + vatAmount;
    });
    const totalVat = Object.values(vatTotals).reduce((a, b) => a + b, 0);
    const grandTotal = subtotal + totalVat;
    return { subtotal, vatTotals, totalVat, grandTotal };
  }, [items]);

  const handleDownloadPdf = async () => {
    if (!id || id === 'new') return;
    try {
        await generateDocumentPDF(parseInt(id, 10), 'invoice', language);
    } catch (error: any) {
        addToast({ type: 'error', title: 'PDF Error', body: error.message });
    }
  };
  
  const executeSendEmail = async () => {
    if (!id || id === 'new' || !invoice.customers?.email) {
        addToast({ title: 'Cannot Send', body: 'Missing document ID or customer email.', type: 'error'});
        return;
    }

    setIsConfirmSendMailOpen(false);
    setIsSendingEmail(true);

    try {
        const pdfBlob = await generateDocumentPDF(parseInt(id, 10), 'invoice', language, 'blob');
        if (!pdfBlob) throw new Error("Failed to generate PDF blob.");

        const pdfBase64 = await blobToBase64(pdfBlob);

        const { error } = await supabase.functions.invoke('send-document-email', {
            body: {
                document_id: parseInt(id, 10),
                document_type: 'invoice',
                pdf_base_64: pdfBase64,
            },
        });

        if (error) {
            const functionError = error.context?.json?.error;
            throw new Error(functionError || error.message);
        }
        
        addToast({ title: "Email Sent", body: `Invoice ${invoice.invoice_number} was sent to ${invoice.customers.email}.`, type: 'success' });
        await fetchData();

    } catch (err: any) {
        console.error("Failed to send email:", err);
        addToast({ title: "Email Failed", body: err.message, type: 'error' });
    } finally {
        setIsSendingEmail(false);
    }
  };

  const handleSendEmail = () => {
    if (!id || id === 'new' || !invoice.customers?.email) {
        addToast({ title: 'Cannot Send', body: 'Missing document ID or customer email.', type: 'error'});
        return;
    }
    setIsMenuOpen(false);
    setIsConfirmSendMailOpen(true);
  };

  const handleCopyPaymentLink = async () => {
    if (!invoice?.id) return;

    if (invoice.payment_link_url) {
        await navigator.clipboard.writeText(invoice.payment_link_url);
        addToast({ title: 'Copied!', body: 'Existing payment link copied to clipboard.', type: 'success'});
        setIsMenuOpen(false);
        return;
    }
    
    setIsSaving(true);
    try {
        const { data, error: functionError } = await supabase.functions.invoke('create-invoice-payment-link', {
            body: { invoice_id: invoice.id },
        });
        if (functionError) throw functionError;

        const paymentUrl = data.url;
        if (!paymentUrl) {
            throw new Error("The server did not return a payment URL.");
        }

        const { error: updateError } = await supabase
            .from('invoices')
            .update({ payment_link_url: paymentUrl })
            .eq('id', invoice.id);
        
        if (updateError) throw updateError;
        
        setInvoice(prev => ({ ...prev, payment_link_url: paymentUrl }));

        await navigator.clipboard.writeText(paymentUrl);
        addToast({ title: 'Copied!', body: 'New payment link created, saved, and copied.', type: 'success'});

    } catch (error: any) {
        let errorMessage = "Could not create payment link";
        if (error.context?.json?.error) {
            errorMessage += `: ${error.context.json.error}`;
        } else if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        addToast({ title: 'Error', body: errorMessage, type: 'error'});
    } finally {
        setIsSaving(false);
        setIsMenuOpen(false);
    }
  };

  const handleViewReceipt = async () => {
    if (!invoice?.id) return;
    setIsFetchingReceipt(true);
    try {
        const { data, error } = await supabase.functions.invoke('get-stripe-receipt-url', {
            body: { invoice_id: invoice.id },
        });
        if (error) throw new Error(error.context?.json?.error || error.message);
        window.open(data.url, '_blank');
    } catch (error: any) {
        // Fix: Added the missing 'type' property to the addToast call.
        addToast({ title: 'Error', body: `Could not fetch receipt: ${error.message}`, type: 'error' });
    } finally {
        setIsFetchingReceipt(false);
        setIsMenuOpen(false);
    }
  };


  const EmailHistory: React.FC<{ logs: EmailLog[] }> = ({ logs }) => {
    if (logs.length === 0) {
      return (
        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <h2 className="text-xl font-bold mb-4">{t('emailHistory')}</h2>
          <p className="text-sm text-gray-500">{t('noEmailsSent')}</p>
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
                  {t('sentBy')} {log.sent_by?.full_name || t('system')} {t('on')} {formatEuropeanDate(log.created_at)} {t('at')} {formatEuropeanTime(log.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{id && id !== 'new' ? `${isReadOnly ? t('viewInvoice') : t('editInvoice')} ${invoice.invoice_number || ''}` : t('newInvoice')}</h1>
          </div>
          <div className="flex items-center gap-x-2">
            {!isReadOnly && <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">
                {isSaving ? t('saving') : t('save')}
            </button>}
            
            {emailSendingEnabled && id && id !== 'new' && (
                <button onClick={handleSendEmail} disabled={isSendingEmail} className="px-4 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300 flex items-center gap-x-2">
                    <EnvelopeIcon className="w-5 h-5"/>
                    <span>{isSendingEmail ? t('sending') : t('sendViaEmail')}</span>
                </button>
            )}

            <button onClick={handleCloseEditor} className="px-6 py-2 bg-gray-200 rounded-md font-medium hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">
                  {isReadOnly ? t('close') : t('cancel')}
            </button>
              {id && id !== 'new' && (
                <div className="relative" ref={menuRef}>
                    <button onClick={() => setIsMenuOpen(p => !p)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                        <EllipsisVerticalIcon className="w-6 h-6"/>
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 border dark:border-slate-700">
                           <button onClick={handleDownloadPdf} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowDownTrayIcon className="w-5 h-5"/> {t('downloadPDF')}</button>
                           {paymentGatewayEnabled && (
                              <button onClick={handleCopyPaymentLink} disabled={isSaving} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                                  <LinkIcon className="w-5 h-5"/> {t('copyPaymentLink')}
                              </button>
                           )}
                           {invoice.status === 'paid' && invoice.stripe_payment_intent_id && paymentGatewayEnabled && (
                                <button onClick={handleViewReceipt} disabled={isFetchingReceipt} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                                    <CreditCardIcon className="w-5 h-5"/>
                                    {isFetchingReceipt ? t('processing') : t('viewPaymentReceipt')}
                                </button>
                           )}
                        </div>
                    )}
                </div>
              )}
          </div>
        </div>

        {invoice.status === 'paid' && (
            <div className="p-4 bg-blue-100 border-l-4 border-blue-500 rounded-r-lg dark:bg-blue-900/50">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <InformationCircleIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700 dark:text-blue-200">
                            {t('invoiceIsPaid')}
                        </p>
                    </div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <div>
            <label className="block text-sm font-medium">{t('customers')}</label>
            <div className="flex items-center space-x-2">
              <select name="customer_id" value={invoice.customer_id || ''} onChange={handleInvoiceChange} required disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
                <option value="">{t('selectCustomer')}</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_number})</option>)}
              </select>
               {!isReadOnly && <button onClick={() => setIsCustomerModalOpen(true)} className="mt-1 p-2 bg-gray-200 rounded-md dark:bg-gray-600"><PlusIcon className="w-5 h-5"/></button>}
            </div>
          </div>
          <div className="mt-1">
            <label className="block text-sm font-medium">{t('issue_date')}</label>
            <DatePicker selected={parseAsLocalDate(invoice.issue_date)} onChange={(date) => handleDateChange('issue_date', date)} />
          </div>
          <div className="mt-1">
            <label className="block text-sm font-medium">{t('due_date')}</label>
            <DatePicker selected={parseAsLocalDate(invoice.due_date)} onChange={(date) => handleDateChange('due_date', date)} />
          </div>
          <div>
            <label className="block text-sm font-medium">{t('status')}</label>
            <select name="status" value={invoice.status} onChange={handleInvoiceChange} disabled={isReadOnly} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 capitalize disabled:bg-gray-100 dark:disabled:bg-gray-700/50">
              {(['draft', 'sent', 'paid', 'overdue'] as InvoiceStatus[]).map(s => <option key={s} value={s}>{t(s as any)}</option>)}
            </select>
          </div>
        </div>
        
        {id && id !== 'new' && <EmailHistory logs={emailLogs} />}

        <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
          <h2 className="text-xl font-bold mb-4">{t('items')}</h2>
          <div className="overflow-x-auto -mx-6">
              <table className="min-w-full">
              <thead className="border-b dark:border-gray-700"><tr className="text-left text-sm text-gray-500 dark:text-gray-400">
                  <th className="px-6 py-2 w-[40%]">{t('description')}</th><th className="px-6 py-2 w-28">{t('quantity')}</th><th className="px-6 py-2 w-40">{t('unitPrice')}</th><th className="px-6 py-2 w-32">{t('vatPercent')}</th><th className="px-6 py-2 w-36 text-right">{t('total')}</th><th className="w-10 px-6"></th>
              </tr></thead>
              <tbody>{items.map((item, index) => {
                  const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
                  const vatAmount = itemTotal * ((item.vat_rate || 0) / 100);
                  const isExpense = !!item.expense_id;
                  return (
                      <tr key={index} className="border-b dark:border-gray-700">
                          <td className="px-6 py-2">
                              <div className="flex items-center">
                                {isExpense && <CurrencyDollarIcon className="w-4 h-4 mr-2 text-gray-400" title="Expense"/>}
                                <input type="text" value={item.description || ''} onChange={(e) => handleItemChange(index, 'description', e.target.value)} readOnly={isReadOnly || isExpense} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/>
                              </div>
                          </td>
                          <td className="px-6 py-2"><input type="number" value={item.quantity || ''} onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))} readOnly={isReadOnly || isExpense} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/></td>
                          <td className="px-6 py-2"><input type="number" step="0.01" value={item.unit_price || ''} onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))} readOnly={isReadOnly || isExpense} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/></td>
                          <td className="px-6 py-2"><select value={item.vat_rate} onChange={(e) => handleItemChange(index, 'vat_rate', parseInt(e.target.value))} disabled={isReadOnly} className="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50">{GERMAN_VAT_RATES.map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select></td>
                          <td className="px-6 py-2 text-right font-medium">€{(itemTotal + vatAmount).toFixed(2)}</td>
                          <td className="px-6">{!isReadOnly && <button onClick={() => removeItem(index)}><TrashIcon className="w-5 h-5 text-red-500"/></button>}</td>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 space-y-4">
                <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold">{t('customerNotes')}</h3>
                      {textBlocksEnabled && !isReadOnly && (
                        <button onClick={() => setIsTextBlockModalOpen(true)} className="flex items-center gap-x-1 px-2 py-1 text-xs font-medium text-primary-600 bg-primary-100 rounded-md hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-900">
                            <TextBlockIcon className="w-4 h-4"/> {t('insertTextBlock')}
                        </button>
                      )}
                    </div>
                    <textarea name="customer_notes" value={invoice.customer_notes || ''} onChange={handleInvoiceChange} rows={4} readOnly={isReadOnly} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50" placeholder={t('customerNotesHint')}></textarea>
                </div>
                 <div>
                    <h3 className="font-bold mb-2">{t('internalNotes')}</h3>
                    <textarea name="internal_notes" value={invoice.internal_notes || ''} onChange={handleInvoiceChange} rows={4} readOnly={isReadOnly} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50" placeholder={t('internalNotesHint')}></textarea>
                </div>
            </div>
            <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800 space-y-2"><div className="flex justify-between"><span>{t('subtotal')}:</span><span>€{totals.subtotal.toFixed(2)}</span></div>
                {Object.entries(totals.vatTotals).map(([rate, amount]) => (<div key={rate} className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>{`${t('totalVAT')} (${rate}%)`}:</span><span>€{(amount as number).toFixed(2)}</span></div>))}
                <hr className="dark:border-gray-600"/><div className="flex justify-between text-xl font-bold"><span >{t('total')}:</span><span>€{invoice.total_amount?.toFixed(2) || '0.00'}</span></div>
            </div>
        </div>
      </div>
      {isCustomerModalOpen && <CustomerModal customer={null} closeModal={() => setIsCustomerModalOpen(false)} onSave={() => { fetchCustomersAndProducts(); setIsCustomerModalOpen(false); }} />}
      {isProductModalOpen && <ProductSelectionModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} onAdd={addProductsFromModal} context="invoice" />}
      {isExpenseModalOpen && <ExpenseSelectionModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onAdd={addExpensesFromModal} onAddNew={openExpenseModal} context="invoice" />}
      {isTextBlockModalOpen && <TextBlockSelectionModal isOpen={isTextBlockModalOpen} onClose={() => setIsTextBlockModalOpen(false)} onSelect={handleInsertTextBlock} documentType="invoice" />}
      <ConfirmModal
        isOpen={isConfirmSendMailOpen}
        onClose={() => setIsConfirmSendMailOpen(false)}
        onConfirm={executeSendEmail}
        title={t('confirmSendEmailTitle')}
        message={t('confirmSendEmailMessage').replace('{email}', invoice.customers?.email || '')}
        confirmText={t('send')}
      />
    </>
  );
};

export default InvoiceEditor;