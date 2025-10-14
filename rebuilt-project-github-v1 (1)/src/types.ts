// This file contains type definitions for the application.

export type UserRole = 'super_admin' | 'admin' | 'key_user' | 'field_service_employee';

export interface Profile {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  current_plan: 'free' | 'pro';
}

export interface DatevSettings {
  debtor_account?: string;
  creditor_account?: string;
  revenue_19?: string;
  revenue_7?: string;
  revenue_0?: string;
  expense_mappings?: { [key: string]: string };
}

export interface Organization {
  id: string;
  name: string;
  company_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  iban?: string;
  bic?: string;
  ust_idnr?: string; // VAT ID
  is_payment_gateway_enabled?: boolean;
  stripe_account_id?: string;
  is_document_storage_enabled?: boolean;
  is_datev_export_enabled?: boolean;
  datev_settings?: DatevSettings;
  is_email_sending_enabled?: boolean;
  is_visit_reminder_enabled?: boolean;
  is_text_blocks_enabled?: boolean;
  max_users?: number;
}

export interface Customer {
  id: number;
  org_id: string;
  user_id: string;
  name: string;
  customer_number: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_reminder_relevant?: boolean;
  created_at: string;
  organizations?: Organization | null;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_id?: number;
  expense_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

export interface Invoice {
  id: number;
  org_id: string;
  user_id: string;
  customer_id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  status: InvoiceStatus;
  customer_notes?: string;
  internal_notes?: string;
  payment_link_url?: string;
  stripe_payment_intent_id?: string;
  visit_id?: number;
  created_at: string;
  customers?: Customer | null;
  organizations?: Organization | null;
  invoice_items?: InvoiceItem[];
  was_sent_via_email?: boolean;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export interface QuoteItem {
  id: number;
  quote_id: number;
  product_id?: number;
  expense_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

export interface Quote {
    id: number;
    org_id: string;
    user_id: string;
    customer_id: number;
    quote_number: string;
    issue_date: string;
    valid_until_date: string;
    total_amount: number;
    status: QuoteStatus;
    customer_notes?: string;
    internal_notes?: string;
    created_at: string;
    customers?: Customer | null;
    organizations?: Organization | null;
    quote_items?: QuoteItem[];
    was_sent_via_email?: boolean;
}

export type VisitCategory = 'Maintenance' | 'Repair' | 'Consulting' | 'Training';
export type VisitStatus = 'planned' | 'completed' | 'cancelled';

export interface Visit {
  id: number;
  org_id: string;
  user_id: string;
  customer_id: number;
  assigned_employee_id?: string;
  visit_number: string;
  start_time: string;
  end_time: string;
  status: VisitStatus;
  category: VisitCategory;
  location: string;
  purpose?: string;
  internal_notes?: string;
  signature_storage_path?: string;
  signature_date?: string;
  created_at: string;
  customers?: Customer | null;
  organizations?: Organization | null;
  profiles?: Profile | null; // employee
  visit_products?: VisitProduct[];
  visit_expenses?: VisitExpense[];
  was_sent_via_email?: boolean;
}

export type StockStatus = 'Available' | 'Low' | 'Not Available' | 'Available Soon';

export interface Product {
    id: number;
    org_id: string;
    user_id: string;
    product_number: string;
    name: string;
    description?: string;
    selling_price: number;
    type: 'good' | 'service';
    unit?: string | null;
    stock_level?: number | null;
    created_at: string;
    organizations?: { name: string } | null;
    stock_status?: StockStatus;
    minimum_stock_level?: number | null;
    restock_date?: string | null;
}

export interface VisitProduct {
    id: number;
    visit_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    products?: { name: string, product_number: string, selling_price: number } | null;
}

export interface Expense {
    id: number;
    org_id: string;
    user_id: string;
    expense_number: string;
    description: string;
    amount: number;
    category?: string;
    expense_date: string;
    created_at: string;
    organizations?: { name: string } | null;
    profiles?: { full_name?: string, email?: string } | null;
}

export interface VisitExpense {
    id: number;
    visit_id: number;
    expense_id: number;
    expenses?: { description: string, amount: number } | null;
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export type AppointmentStatus = 'draft' | 'open' | 'in_progress' | 'done';

export interface Appointment {
    id: number;
    org_id: string;
    user_id: string;
    customer_id?: number | null;
    appointment_number: string;
    title: string;
    start_time: string;
    end_time: string;
    status: AppointmentStatus;
    notes?: string;
    type?: 'standard' | 'absence';
    is_all_day?: boolean;
    created_at: string;
    customers?: Partial<Customer> | null;
    organizations?: { name: string } | null;
}

export interface Task {
    id: string;
    org_id: string;
    user_id: string;
    customer_id?: number | null;
    title: string;
    start_time?: string | null;
    end_time?: string | null;
    is_complete: boolean;
    created_at: string;
    customers?: Partial<Customer> | null;
    profiles?: { full_name?: string } | null;
}

export interface UserInvitation {
    id: string;
    org_id: string;
    invited_by_user_id: string;
    invited_user_email: string;
    role: UserRole;
    status: 'pending' | 'accepted' | 'declined';
    created_at: string;
}

export interface OrganizationInvitation {
    id: string;
    code: string;
    org_name: string;
    max_users: number;
    created_by: string;
    status: 'pending' | 'accepted';
    accepted_by_user_id: string | null;
    accepted_at: string | null;
    created_at: string;
}

export interface CustomerDocument {
  id: string;
  customer_id: number;
  org_id: string;
  uploaded_by_user_id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  created_at: string;
}

export interface EmailLog {
  id: string;
  org_id: string;
  customer_id: number;
  sent_by_user_id: string;
  document_type: 'invoice' | 'quote' | 'visit_reminder' | 'visit_summary';
  related_document_id: string;
  subject: string;
  created_at: string;
  sent_by?: { full_name: string } | null;
}

export interface RolePermissions {
  org_id: string;
  role: UserRole;
  permissions: {
    modules: string[];
  };
}

export type NotificationType = 'new_task' | 'new_visit' | 'new_appointment' | 'generic';

export interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  title: string;
  body: string;
  type: NotificationType;
  related_entity_path: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Changelog {
  id: string;
  created_at: string;
  user_email: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string;
  changes: any; // jsonb
}

export interface TextBlock {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  content: string;
  applicable_to: ('invoice' | 'quote' | 'visit')[];
  created_at: string;
}

export interface HelpContent {
  page_key: string;
  content_de: string;
  content_al: string;
  updated_at: string;
}

export interface LegalContent {
  key: 'agb' | 'datenschutz';
  content_de: string | null;
  content_al: string | null;
  updated_at: string;
}
