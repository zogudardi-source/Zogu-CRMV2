import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRefresh } from '../contexts/RefreshContext';
import { useTabs } from '../contexts/TabContext';
import { Customer, Visit, VisitStatus, Invoice, Quote, Appointment, CustomerDocument, EmailLog } from '../types';
import { ArrowLeftIcon, BuildingOffice2Icon, EnvelopeIcon, PhoneIcon, DocumentTextIcon, DocumentPlusIcon, BriefcaseIcon, CalendarDaysIcon, PencilIcon, PlusIcon, PaperClipIcon, ArrowDownTrayIcon, TrashIcon, BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';
import { formatEuropeanDate, formatEuropeanTime, parseAsLocalDate } from '../lib/formatting';
import CustomerModal from '../components/modals/CustomerModal';

type TimelineItem = {
    id: string;
    type: 'invoice' | 'quote' | 'visit' | 'appointment' | 'email';
    date: Date;
    title: string;
    details: string | React.ReactNode;
    path: string;
    label: string;
    state?: any; // For passing router state
    status?: string;
    statusColor?: string;
    icon: React.ElementType;
};

type ActiveTab = 'all' | 'invoices' | 'quotes' | 'visits' | 'appointments' | 'emails';

const CustomerDetailPage: React.FC = () => {
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const { refreshKey } = useRefresh();
  const { openTab, updateTabLabel } = useTabs();

  const id = params.id;
  // Capture the path on first render and store it in state.
  // This is the critical fix to prevent the component from using the wrong path
  // when it's hidden but re-renders due to a global location change.
  const [instancePath] = useState(location.pathname);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const isInitialized = useRef(false);
  const [loading, setLoading] = useState(true);
  
  // States for each activity type
  const [visits, setVisits] = useState<Visit[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [notesContent, setNotesContent] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  
  const [docStorageEnabled, setDocStorageEnabled] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const canEditNotes = useMemo(() => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return false;
    return ['admin', 'key_user', 'field_service_employee'].includes(profile.role);
  }, [profile]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setIsCreateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [createMenuRef]);


  const fetchData = useCallback(async () => {
    if (!profile || !id || id === 'new') {
        setLoading(false);
        return;
    }
    setLoading(true);

    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) {
        navigate('/customers');
        return;
    }

    let customerQuery = supabase
      .from('customers')
      .select('*, organizations(*)')
      .eq('id', customerId);

    if (profile.role !== 'super_admin' && profile.org_id) {
      customerQuery = customerQuery.eq('org_id', profile.org_id);
    }
    const { data, error: customerError } = await customerQuery.single();

    if (customerError || !data) {
      navigate('/customers');
      return;
    }
    setCustomer(data);
    setNotesContent(data.notes || '');
    updateTabLabel(instancePath, data.name);
    
    const isDocFeatureEnabled = data.organizations?.is_document_storage_enabled || false;
    setDocStorageEnabled(isDocFeatureEnabled);

    const [
        { data: visitsData }, 
        { data: invoicesData },
        { data: quotesData },
        { data: appointmentsData },
        { data: documentsData },
        { data: emailLogsData },
    ] = await Promise.all([
        supabase.from('visits').select('*, profiles:assigned_employee_id(full_name)').eq('customer_id', customerId),
        supabase.from('invoices').select('*').eq('customer_id', customerId),
        supabase.from('quotes').select('*').eq('customer_id', customerId),
        supabase.from('appointments').select('*').eq('customer_id', customerId),
        isDocFeatureEnabled ? supabase.from('customer_documents').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
        supabase.from('email_logs').select('*, sent_by:sent_by_user_id!left(full_name)').eq('customer_id', customerId),
    ]);
    
    setVisits(visitsData || []);
    setInvoices(invoicesData || []);
    setQuotes(quotesData || []);
    setAppointments(appointmentsData || []);
    setDocuments(documentsData || []);
    setEmailLogs(emailLogsData || []);
    setLoading(false);
  }, [id, profile, navigate, instancePath, updateTabLabel]);


  useEffect(() => {
    // This effect should only run its logic ONCE per component instance.
    // The `isInitialized` ref ensures this, preventing state loss (e.g., for
    // unsaved notes) on re-renders when switching tabs.
    if (isInitialized.current) {
        return;
    }
    fetchData();
    isInitialized.current = true;
  }, [fetchData, refreshKey]);

  const timelineItems = useMemo(() => {
    const combinedItems: TimelineItem[] = [];
    const visitStatusColors: { [key in VisitStatus]: string } = { planned: 'blue', completed: 'green', cancelled: 'red' };

    visits.forEach(v => {
        const parsedDate = parseAsLocalDate(v.start_time);
        if (parsedDate) {
            combinedItems.push({ id: `vis-${v.id}`, type: 'visit', date: parsedDate, title: `${t('visits')} #${v.visit_number}`, details: `${(v as any).profiles?.full_name || t('unassignedVisits')} at ${v.location || 'N/A'}`, path: `/visits/edit/${v.id}`, label: v.visit_number, status: t(v.status), statusColor: visitStatusColors[v.status], icon: BriefcaseIcon });
        }
    });

    const docStatusColors = { draft: 'yellow', sent: 'blue', accepted: 'green', declined: 'red', paid: 'green', overdue: 'red' };
    invoices.forEach(i => {
        const parsedDate = parseAsLocalDate(i.issue_date);
        if (parsedDate) {
            combinedItems.push({ id: `inv-${i.id}`, type: 'invoice', date: parsedDate, title: `${t('invoice')} #${i.invoice_number}`, details: `Total: €${i.total_amount.toFixed(2)}`, path: `/invoices/edit/${i.id}`, label: i.invoice_number, status: t(i.status as any), statusColor: docStatusColors[i.status], icon: DocumentTextIcon });
        }
    });

    quotes.forEach(q => {
        const parsedDate = parseAsLocalDate(q.issue_date);
        if(parsedDate) {
            combinedItems.push({ id: `quo-${q.id}`, type: 'quote', date: parsedDate, title: `${t('quote')} #${q.quote_number}`, details: `Total: €${q.total_amount.toFixed(2)}`, path: `/quotes/edit/${q.id}`, label: q.quote_number, status: t(q.status as any), statusColor: docStatusColors[q.status], icon: DocumentPlusIcon });
        }
    });
    
    appointments.forEach(a => {
        const parsedDate = parseAsLocalDate(a.start_time);
        if (parsedDate) {
            combinedItems.push({ id: `apt-${a.id}`, type: 'appointment', date: parsedDate, title: `${t('appointments')}: ${a.title}`, details: `Starts at ${formatEuropeanTime(a.start_time)}`, path: '/appointments', label: t('appointments'), status: undefined, icon: CalendarDaysIcon, state: { openModalForId: a.id.toString() } });
        }
    });

    emailLogs.forEach(log => {
        const parsedDate = parseAsLocalDate(log.created_at);
        if (parsedDate) {
            let path = '/';
            let label = 'View';
            switch (log.document_type) {
                case 'invoice': path = `/invoices/edit/${log.related_document_id}`; label = `Invoice`; break;
                case 'quote': path = `/quotes/edit/${log.related_document_id}`; label = `Quote`; break;
                case 'visit_reminder': path = `/visits/edit/${log.related_document_id}`; label = `Visit`; break;
            }
            combinedItems.push({ id: `email-${log.id}`, type: 'email', date: parsedDate, title: log.subject, details: <span className="capitalize">{t('sentBy')}: {(log as any).sent_by?.full_name || t('system')} &bull; {log.document_type.replace('_', ' ')}</span>, path: path, label: label, status: 'Sent', statusColor: 'gray', icon: EnvelopeIcon });
        }
    });
    
    combinedItems.sort((a, b) => b.date.getTime() - a.date.getTime());
    return combinedItems;
  }, [appointments, invoices, quotes, visits, emailLogs, t]);
  
  const handleSaveNotes = async () => {
    if (!customer || !canEditNotes) return;
    setIsSavingNotes(true);
    const { error } = await supabase.from('customers').update({ notes: notesContent }).eq('id', customer.id);
    if (error) alert('Error saving notes: ' + error.message);
    else {
        alert('Notes saved successfully!');
        setCustomer(c => c ? { ...c, notes: notesContent } : null);
    }
    setIsSavingNotes(false);
  };

  const handleCreateNew = (type: 'invoice' | 'quote' | 'visit' | 'appointment') => {
    if (!customer) return;
    setIsCreateMenuOpen(false);
    const state = { customerId: customer.id };
    switch (type) {
        case 'invoice': openTab({ path: '/invoices/new', label: t('newInvoice'), state }); break;
        case 'quote': openTab({ path: '/quotes/new', label: t('newQuote'), state }); break;
        case 'visit': openTab({ path: '/visits/new', label: t('newVisit'), state }); break;
        case 'appointment': openTab({ path: '/appointments', label: t('appointments'), state: { openModalWithCustomerId: customer.id } }); break;
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !customer || !profile?.org_id || !user?.id) return;
    const file = event.target.files[0];
    setIsUploading(true);
    const filePath = `${profile.org_id}/${customer.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('customer-documents').upload(filePath, file);
    if (uploadError) {
        alert('Error uploading file: ' + uploadError.message);
        setIsUploading(false);
        return;
    }
    const { error: insertError } = await supabase.from('customer_documents').insert({ customer_id: customer.id, org_id: profile.org_id, uploaded_by_user_id: user.id, file_name: file.name, file_path: filePath, file_size_bytes: file.size, mime_type: file.type });
    if (insertError) {
        alert('Error saving document metadata: ' + insertError.message);
        await supabase.storage.from('customer-documents').remove([filePath]);
    } else {
        await fetchData();
    }
    setIsUploading(false);
    if(fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handleDownload = async (doc: CustomerDocument) => {
      const { data, error } = await supabase.storage.from('customer-documents').download(doc.file_path);
      if (error) { alert("Error downloading file: " + error.message); return; }
      const blob = new Blob([data], { type: doc.mime_type });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
  };
  
  const handleDelete = async (doc: CustomerDocument) => {
    if (window.confirm(`Are you sure you want to delete "${doc.file_name}"?`)) {
        const { error: storageError } = await supabase.storage.from('customer-documents').remove([doc.file_path]);
        if (storageError) { alert("Error deleting file from storage: " + storageError.message); return; }
        const { error: dbError } = await supabase.from('customer_documents').delete().eq('id', doc.id);
        if (dbError) { alert("Error deleting file record: " + dbError.message); }
        else { setDocuments(docs => docs.filter(d => d.id !== doc.id)); }
    }
  };
  
  const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredTimelineItems = useMemo(() => {
    if (activeTab === 'all') return timelineItems;
    if (activeTab === 'emails') {
        return timelineItems.filter(item => item.type === 'email');
    }
    const type = activeTab.slice(0, -1) as TimelineItem['type'];
    return timelineItems.filter(item => item.type === type);
  }, [activeTab, timelineItems]);

  if (loading) return <div className="text-center p-8">Loading customer details...</div>;
  if (!customer) return null;
  
  const TABS: { id: ActiveTab, label: string }[] = [
    { id: 'all', label: 'All' }, 
    { id: 'invoices', label: t('invoices') }, 
    { id: 'quotes', label: t('quotes') }, 
    { id: 'visits', label: t('visits') }, 
    { id: 'appointments', label: t('appointments') },
    { id: 'emails', label: t('emails') }
  ];
  const typeColors: Record<TimelineItem['type'], string> = { visit: 'bg-purple-100 dark:bg-purple-900/50', invoice: 'bg-green-100 dark:bg-green-900/50', quote: 'bg-sky-100 dark:bg-sky-900/50', appointment: 'bg-teal-100 dark:bg-teal-900/50', email: 'bg-gray-100 dark:bg-gray-700' };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('customerDetails')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
            <div className="flex flex-col md:flex-row justify-between items-start">
                <div className="flex items-start gap-x-4">
                    <div><h2 className="text-2xl font-bold text-primary-600">{customer.name}</h2><p className="text-sm font-mono text-gray-500">{customer.customer_number}</p></div>
                    {canEditNotes && (<button onClick={() => setIsEditModalOpen(true)} className="p-2 text-gray-500 hover:text-primary-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><PencilIcon className="w-5 h-5"/></button>)}
                </div>
                <div className="mt-4 md:mt-0 md:text-right space-y-1 text-sm text-gray-600 dark:text-gray-300">
                   {customer.email && <div className="flex items-center md:justify-end"><EnvelopeIcon className="w-4 h-4 mr-2"/><span>{customer.email}</span></div>}
                   {customer.phone && <div className="flex items-center md:justify-end"><PhoneIcon className="w-4 h-4 mr-2"/><span>{customer.phone}</span></div>}
                   {customer.address && <div className="flex items-center md:justify-end"><BuildingOffice2Icon className="w-4 h-4 mr-2"/><span>{customer.address}</span></div>}
                   {customer.organizations?.is_visit_reminder_enabled && (
                     customer.is_reminder_relevant ? (
                       <div className="flex items-center md:justify-end text-green-600 dark:text-green-400">
                         <BellIcon className="w-4 h-4 mr-2"/>
                         <span>{t('receivesVisitReminders')}</span>
                       </div>
                     ) : (
                       <div className="flex items-center md:justify-end text-gray-500">
                         <BellSlashIcon className="w-4 h-4 mr-2"/>
                         <span>{t('noVisitReminders')}</span>
                       </div>
                     )
                   )}
                </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-md dark:bg-gray-800">
            <div className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center pr-4">
                    <div className="overflow-x-auto"><nav className="-mb-px flex space-x-6 px-6" aria-label="Tabs">{TABS.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>{tab.label}</button>))}</nav></div>
                    {canEditNotes && (<div className="relative" ref={createMenuRef}><button onClick={() => setIsCreateMenuOpen(p => !p)} className="p-2 rounded-full bg-primary-600 text-white hover:bg-primary-700"><PlusIcon className="w-5 h-5"/></button>{isCreateMenuOpen && (<div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10 border dark:border-gray-700"><button onClick={() => handleCreateNew('invoice')} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><DocumentTextIcon className="w-5 h-5"/> {t('newInvoice')}</button><button onClick={() => handleCreateNew('quote')} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><DocumentPlusIcon className="w-5 h-5"/> {t('newQuote')}</button><button onClick={() => handleCreateNew('visit')} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><BriefcaseIcon className="w-5 h-5"/> {t('newVisit')}</button><button onClick={() => handleCreateNew('appointment')} className="w-full text-left flex items-center gap-x-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"><CalendarDaysIcon className="w-5 h-5"/> {t('addAppointment')}</button></div>)}</div>)}
                </div>
            </div>
            
            <div className="p-6">{filteredTimelineItems.length > 0 ? (<div className="flow-root"><ul role="list" className="-mb-8">{filteredTimelineItems.map((item, index) => (<li key={item.id}><div className="relative pb-8">{index !== filteredTimelineItems.length - 1 && (<span className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />)}<div className="relative flex items-start space-x-4"><div><span className={`h-10 w-10 rounded-full ${typeColors[item.type]} flex items-center justify-center ring-8 ring-white dark:ring-gray-800`}><item.icon className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" /></span></div><div className="min-w-0 flex-1 pt-1.5"><div className="flex items-center justify-between"><p className="text-sm text-gray-500 dark:text-gray-400"><button onClick={() => openTab({ path: item.path, label: item.label, state: item.state })} className="font-medium text-gray-900 dark:text-white hover:underline">{item.title}</button></p><time dateTime={item.date.toISOString()} className="whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatEuropeanDate(item.date)}</time></div><div className="mt-1 flex items-center gap-x-4"><p className="text-sm text-gray-600 dark:text-gray-300">{item.details}</p>{item.status && (<span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-${item.statusColor}-50 text-${item.statusColor}-700 ring-${item.statusColor}-600/20 capitalize`}>{item.status}</span>)}</div></div></div></div></li>))}</ul></div>) : (<div className="text-center py-10 text-gray-500"><p>No activities found for this filter.</p></div>)}</div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-8">
          <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800"><h3 className="text-lg font-bold mb-3">{t('notes')}</h3><textarea value={notesContent} onChange={(e) => setNotesContent(e.target.value)} readOnly={!canEditNotes} rows={10} placeholder={canEditNotes ? t('addImportantNotes') : t('noNotes')} className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 read-only:bg-gray-100 dark:read-only:bg-gray-700/50"/>{canEditNotes && (<div className="mt-4 flex justify-end"><button onClick={handleSaveNotes} disabled={isSavingNotes || notesContent === (customer.notes || '')} className="px-4 py-2 text-white bg-primary-600 rounded-md font-medium hover:bg-primary-700 disabled:bg-primary-300">{isSavingNotes ? t('saving') : t('saveNotes')}</button></div>)}</div>
          {docStorageEnabled && (
            <div className="p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">{t('documents')}</h3><input type="file" ref={fileInputRef} onChange={handleFileSelect} disabled={isUploading || !canEditNotes} className="hidden" id="file-upload"/><label htmlFor="file-upload" className={`inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700 ${!canEditNotes || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}><PaperClipIcon className="w-4 h-4 mr-2"/>{isUploading ? t('processing') : t('upload')}</label></div>
                <div className="space-y-3">{documents.length > 0 ? documents.map(doc => (<div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-md"><div className="truncate"><p className="text-sm font-medium truncate">{doc.file_name}</p><p className="text-xs text-gray-500">{formatFileSize(doc.file_size_bytes)} - {formatEuropeanDate(doc.created_at)}</p></div><div className="flex-shrink-0 flex items-center gap-x-2 ml-4"><button onClick={() => handleDownload(doc)} className="p-1 text-gray-500 hover:text-primary-600"><ArrowDownTrayIcon className="w-5 h-5"/></button>{canEditNotes && (<button onClick={() => handleDelete(doc)} className="p-1 text-gray-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>)}</div></div>)) : <p className="text-center text-sm text-gray-500 py-4">{t('noDocumentsUploaded')}</p>}</div>
            </div>
          )}
        </div>
      </div>
      {isEditModalOpen && (<CustomerModal customer={customer} closeModal={() => setIsEditModalOpen(false)} onSave={() => { setIsEditModalOpen(false); fetchData(); }} />)}
    </div>
  );
};

export default CustomerDetailPage;